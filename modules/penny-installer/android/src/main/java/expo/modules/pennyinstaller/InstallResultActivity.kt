package expo.modules.pennyinstaller

import android.app.Activity
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import android.os.Bundle
import android.util.Log

private const val TAG = "PennyInstaller"

internal fun interface InstallStatusListener {
  fun onStatus(sessionId: Int, status: String, message: String?)
}

// Carries a session's status from InstallResultActivity to the module, which may be gone: after
// a self-update the status lands in a new process whose JS has not asked about anything.
internal object InstallStatusBus {
  @Volatile private var listener: InstallStatusListener? = null

  fun register(next: InstallStatusListener) {
    listener = next
  }

  fun unregister(current: InstallStatusListener) {
    if (listener === current) listener = null
  }

  fun emit(sessionId: Int, status: String, message: String?) {
    listener?.onStatus(sessionId, status, message)
  }
}

// Where PackageInstaller reports how a session ended. An activity rather than a receiver because
// two of the answers need one: STATUS_PENDING_USER_ACTION carries the confirmation screen to
// start, and STATUS_SUCCESS of a self-update arrives in a fresh process that should bring Penny
// back, which a receiver is not allowed to do from the background. It draws nothing and finishes
// at once. Like any activity on top, it pauses Penny's for that moment, so a failure reported
// while Penny is open reads as a brief trip to the background (AppState); failures are rare, and
// the system installer's own screen did the same.
class InstallResultActivity : Activity() {
  companion object {
    const val EXTRA_OWN_SESSION_ID = "expo.modules.pennyinstaller.SESSION_ID"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      handle(intent)
    } finally {
      finish()
    }
  }

  private fun handle(source: Intent) {
    val sessionId = source.getIntExtra(
      PackageInstaller.EXTRA_SESSION_ID,
      source.getIntExtra(EXTRA_OWN_SESSION_ID, -1),
    )
    val status = source.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
    val message = source.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
    Log.i(TAG, "session $sessionId status $status ${message ?: ""}")

    when (status) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirmation = confirmationIntent(source)
        val started = confirmation != null && try {
          startActivity(confirmation)
          true
        } catch (error: Exception) {
          Log.w(TAG, "could not show the install confirmation", error)
          false
        }
        InstallStatusBus.emit(
          sessionId,
          if (started) "pending_user_action" else "failure",
          if (started) message else "The install confirmation could not be shown",
        )
      }
      PackageInstaller.STATUS_SUCCESS -> {
        InstallStatusBus.emit(sessionId, "success", message)
        relaunchPenny()
      }
      else -> InstallStatusBus.emit(sessionId, statusName(status), message)
    }
  }

  // Penny is the package that was just replaced, so its process was killed to install it.
  private fun relaunchPenny() {
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      startActivity(launch)
    } catch (error: Exception) {
      Log.w(TAG, "could not reopen Penny after the update", error)
    }
  }

  @Suppress("DEPRECATION")
  private fun confirmationIntent(source: Intent): Intent? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      source.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
    } else {
      source.getParcelableExtra(Intent.EXTRA_INTENT)
    }

  private fun statusName(status: Int): String =
    when (status) {
      PackageInstaller.STATUS_FAILURE_ABORTED -> "aborted"
      PackageInstaller.STATUS_FAILURE_BLOCKED -> "blocked"
      PackageInstaller.STATUS_FAILURE_CONFLICT -> "conflict"
      PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "incompatible"
      PackageInstaller.STATUS_FAILURE_INVALID -> "invalid"
      PackageInstaller.STATUS_FAILURE_STORAGE -> "storage"
      PackageInstaller.STATUS_FAILURE_TIMEOUT -> "timeout"
      else -> "failure"
    }
}
