package expo.modules.pennyinstaller

import android.app.ActivityOptions
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import java.io.File

internal const val UPDATE_WITHOUT_USER_ACTION_PERMISSION =
  "android.permission.UPDATE_PACKAGES_WITHOUT_USER_ACTION"

internal class InstallValidationException(val code: String, message: String) : Exception(message)

@Volatile private var declaresPermissionCache: Boolean? = null

// Tests only: the cache outlives a test's change to the package info.
internal fun resetDeclaredPermissionCache() {
  declaresPermissionCache = null
}

// Penny installing a newer build of itself through a PackageInstaller session.
//
// The old route, an ACTION_VIEW intent to the system installer, always shows Android's "Do you
// want to update this app?" screen: it has no way to skip it. A session can, on Android 12+
// (API 31), when all of these hold (PackageInstaller.SessionParams#setRequireUserAction):
//   - the session asks for USER_ACTION_NOT_REQUIRED,
//   - the app declares UPDATE_PACKAGES_WITHOUT_USER_ACTION (an install-time permission),
//   - the user has allowed Penny to install apps (REQUEST_INSTALL_PACKAGES, granted once),
//   - the installer is updating itself, which Penny always is here,
//   - the APK targets an API level recent enough for the device's Android version.
// When any of them fails, Android answers STATUS_PENDING_USER_ACTION and InstallResultActivity
// shows the confirmation instead, so the worst case is the dialog Penny always had.
internal class SelfUpdateInstaller(private val context: Context) {
  private val packageManager: PackageManager = context.packageManager

  fun canRequestPackageInstalls(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.O || packageManager.canRequestPackageInstalls()

  // Read from the installed package rather than assumed: the Play build does not declare it, and
  // without it the session would only ever end in the confirmation dialog. The manifest cannot
  // change while the process lives, so the answer is kept.
  fun declaresSilentUpdatePermission(): Boolean =
    declaresPermissionCache ?: try {
      requestedPermissions().contains(UPDATE_WITHOUT_USER_ACTION_PERMISSION).also { declaresPermissionCache = it }
    } catch (_: Exception) {
      false
    }

  fun canUpdateWithoutUserAction(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
      declaresSilentUpdatePermission() &&
      canRequestPackageInstalls()

  // The APK must be Penny's own and sit in Penny's cache, which is where the updater downloads
  // to. Android itself refuses an update signed with another key, so the signature is left to it.
  fun validate(fileUri: String): File {
    val parsed = Uri.parse(fileUri)
    val path = (if (parsed.scheme == null || parsed.scheme == "file") parsed.path else null)
      ?: throw InstallValidationException("ERR_INVALID_PATH", "Not a file URI: $fileUri")
    val apk = File(path).canonicalFile
    val cacheRoot = context.cacheDir.canonicalFile
    if (!apk.path.startsWith(cacheRoot.path + File.separator)) {
      throw InstallValidationException("ERR_INVALID_PATH", "The APK is outside the app cache")
    }
    if (!apk.isFile || apk.length() == 0L) {
      throw InstallValidationException("ERR_FILE_MISSING", "The APK is no longer on disk")
    }
    val archive = archiveInfo(apk)
      ?: throw InstallValidationException("ERR_INVALID_APK", "Android could not read the APK")
    if (archive.packageName != context.packageName) {
      throw InstallValidationException(
        "ERR_PACKAGE_MISMATCH",
        "The APK is ${archive.packageName}, not ${context.packageName}",
      )
    }
    return apk
  }

  // Creates the session, hands its id to [onSessionCreated] before anything can report on it,
  // copies the APK in and commits. Returns once Android has the session; how it ends arrives
  // later, at InstallResultActivity.
  fun sessionParams(apk: File): PackageInstaller.SessionParams {
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
    params.setAppPackageName(context.packageName)
    params.setSize(apk.length())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
    }
    // setPackageSource is left unset on purpose. Android 13+ applies "restricted settings" to
    // apps whose source is a downloaded or local file, and Penny's bank-notification listener is
    // one of those settings. Claiming either source would gain nothing and could cost that.
    return params
  }

  fun stageAndCommit(apk: File, onSessionCreated: (Int) -> Unit): Int {
    val installer = packageManager.packageInstaller
    val sessionId = installer.createSession(sessionParams(apk))
    onSessionCreated(sessionId)
    try {
      installer.openSession(sessionId).use { session ->
        apk.inputStream().use { input ->
          session.openWrite("penny-update.apk", 0, apk.length()).use { output ->
            input.copyTo(output)
            session.fsync(output)
          }
        }
        session.commit(statusReceiver(sessionId))
      }
    } catch (error: Exception) {
      try {
        installer.abandonSession(sessionId)
      } catch (_: Exception) {
        // The session may already be gone; the original error is the one worth reporting.
      }
      throw error
    }
    return sessionId
  }

  private fun statusReceiver(sessionId: Int) =
    PendingIntent.getActivity(
      context,
      sessionId,
      Intent(context, InstallResultActivity::class.java)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        .putExtra(InstallResultActivity.EXTRA_OWN_SESSION_ID, sessionId),
      // Mutable: Android fills the status, its message and the confirmation intent in. The
      // intent names its component, which Android 14+ requires of a mutable PendingIntent.
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0),
      creatorOptions(),
    ).intentSender

  // After a self-update Penny's process is gone, and the result activity starts a fresh one from
  // the background. Android 14+ blocks that unless the PendingIntent's creator opts in. Whether
  // it is then allowed still depends on the device, so relaunching is best effort.
  private fun creatorOptions(): Bundle? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return null
    val options = ActivityOptions.makeBasic()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
      options.setPendingIntentCreatorBackgroundActivityStartMode(
        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOW_ALWAYS,
      )
    } else {
      @Suppress("DEPRECATION")
      options.setPendingIntentCreatorBackgroundActivityStartMode(
        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED,
      )
    }
    return options.toBundle()
  }

  @Suppress("DEPRECATION")
  private fun archiveInfo(apk: File): PackageInfo? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      packageManager.getPackageArchiveInfo(apk.path, PackageManager.PackageInfoFlags.of(0))
    } else {
      packageManager.getPackageArchiveInfo(apk.path, 0)
    }

  @Suppress("DEPRECATION")
  private fun requestedPermissions(): Array<String> {
    val info =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        packageManager.getPackageInfo(
          context.packageName,
          PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()),
        )
      } else {
        packageManager.getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
      }
    return info.requestedPermissions ?: emptyArray()
  }
}
