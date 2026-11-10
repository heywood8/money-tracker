package expo.modules.pennyinstaller

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

// Penny's self-updater: installs a downloaded build of Penny through a PackageInstaller session,
// with no confirmation screen where Android allows it. See SelfUpdateInstaller for the rules.
class PennyInstallerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // Sessions committed from this runtime, each waiting on the first status Android reports.
  private val pending = ConcurrentHashMap<Int, Promise>()

  // Sessions not yet ended, by when they were committed: those in `pending`, and those whose
  // first answer was Android's own confirmation screen, still open. A second session while one
  // of these is alive would end in a conflict or two confirmation screens.
  private val active = ConcurrentHashMap<Int, Long>()

  // Held while an APK is being copied into a session, before it is in `active`.
  private val staging = AtomicBoolean(false)

  // The first status of a session settles its promise. Any later one (how Android's own
  // confirmation ended, a status after the JS side stopped waiting) goes out as an event.
  private val statusListener = InstallStatusListener { sessionId, status, message ->
    if (status != "pending_user_action") active.remove(sessionId)
    val body = Bundle().apply {
      putInt("sessionId", sessionId)
      putString("status", status)
      putString("message", message)
    }
    val waiting = pending.remove(sessionId)
    if (waiting != null) {
      waiting.resolve(body)
    } else {
      sendEvent(STATUS_EVENT, body)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("PennyInstaller")

    Events(STATUS_EVENT)

    OnCreate {
      InstallStatusBus.register(statusListener)
    }

    OnDestroy {
      InstallStatusBus.unregister(statusListener)
      val abandoned = pending.values.toList()
      pending.clear()
      active.clear()
      abandoned.forEach {
        it.reject(CodedException("ERR_INSTALLER_GONE", "The app reloaded before the install reported back", null))
      }
    }

    // What this device and build allow, read fresh on every call: the user can grant or revoke
    // "Install unknown apps" at any time.
    Function("getCapabilities") {
      val installer = SelfUpdateInstaller(context)
      mapOf(
        "sdkInt" to Build.VERSION.SDK_INT,
        "canRequestPackageInstalls" to installer.canRequestPackageInstalls(),
        "declaresSilentUpdatePermission" to installer.declaresSilentUpdatePermission(),
        "silentUpdate" to installer.canUpdateWithoutUserAction(),
      )
    }

    // Resolves with { sessionId, status, message } once Android reports on the session:
    // "pending_user_action" when it showed the confirmation instead, a failure name ("conflict",
    // "blocked", ...) when it refused. A silent update that succeeds kills this process before
    // anything resolves. Rejects only when the APK never reached Android.
    AsyncFunction("install") { fileUri: String, promise: Promise ->
      // One at a time. A session that never reported is forgotten soon after the JS side stops
      // waiting for it (SILENT_INSTALL_TIMEOUT_MS in app/services/silentInstaller.js), so a lost
      // status cannot keep refusing taps once "Installing…" is gone from the screen.
      val now = SystemClock.elapsedRealtime()
      active.entries.removeIf { now - it.value > STALE_SESSION_MS }
      pending.keys.retainAll(active.keys)
      if (active.isNotEmpty() || !staging.compareAndSet(false, true)) {
        throw CodedException("ERR_INSTALL_IN_PROGRESS", "An install is still waiting for Android's answer", null)
      }
      try {
        val installer = SelfUpdateInstaller(context)
        val apk = try {
          installer.validate(fileUri)
        } catch (error: InstallValidationException) {
          throw CodedException(error.code, error.message, null)
        }
        var sessionId: Int? = null
        try {
          installer.stageAndCommit(apk) { id ->
            sessionId = id
            active[id] = now
            pending[id] = promise
          }
        } catch (error: Exception) {
          sessionId?.let {
            pending.remove(it)
            active.remove(it)
          }
          throw CodedException("ERR_INSTALL_STAGING_FAILED", "Could not hand the APK to Android: ${error.message}", error)
        }
      } finally {
        staging.set(false)
      }
    }
  }
}

private const val STATUS_EVENT = "onInstallStatus"
// The JS side waits two minutes; a little longer here, so its retry after that is not refused.
private const val STALE_SESSION_MS = 3 * 60 * 1000L
