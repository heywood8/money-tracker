package expo.modules.pennysystemcolors

import android.app.WallpaperManager
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.database.ContentObserver
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log

// Penny's home-screen widgets are pictures drawn in the system's colours of the moment
// (SystemPalette), so when those colours change the launcher goes on showing the old picture
// until Penny draws a new one. The system's own widgets follow at once: the launcher resolves
// their colours itself.
//
// Android does not tell an app that its palette changed. The new colours arrive as a resource
// overlay, and a change of overlay alone is not reported to Application.onConfigurationChanged
// (only to activities, which are recreated). So a running process watches what the palette is
// made from: the wallpaper's colours, and the colour choice in "Wallpaper & style", which the
// picker saves in a secure setting that SystemUI reads (AOSP and Pixel do; another vendor may keep
// it elsewhere, and then only a new wallpaper is seen). The overlay follows either a moment
// later, so the palette is read again a few times over the next minute, and once it differs from
// the one last seen every Penny widget is asked to redraw, the same request the launcher's
// periodic update makes.
//
// Not seen while Penny's process is not running: the check at the next process start and the
// widgets' hourly update catch that.
internal object PaletteWatcher {
  private const val TAG = "PennySystemColors"
  private const val PREFS = "penny_system_colors"
  private const val KEY_PALETTE = "palette"

  // Settings.Secure.THEME_CUSTOMIZATION_OVERLAY_PACKAGES, hidden from the SDK: the colours picked
  // in "Wallpaper & style" (or that they follow the wallpaper), as JSON. Only watched, never read.
  private const val THEME_CUSTOMIZATION = "theme_customization_overlay_packages"

  // After what the palette is made from changes: when to look whether the palette has followed.
  private val RECHECK_DELAYS_MS = longArrayOf(1_000, 5_000, 20_000, 60_000)
  private val RECHECK_TOKEN = Any()

  private var started = false

  @Synchronized
  fun start(context: Context) {
    if (started || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    started = true
    val app = context.applicationContext
    // The main thread: a check is a few dozen resource reads and a broadcast.
    val handler = Handler(Looper.getMainLooper())
    val recheckSoon = {
      handler.removeCallbacksAndMessages(RECHECK_TOKEN)
      RECHECK_DELAYS_MS.forEach { delay -> handler.postDelayed({ check(app) }, RECHECK_TOKEN, delay) }
    }
    // The palette may have changed while the process was not running. Posted, so it runs after
    // Application.onCreate rather than in it.
    handler.post { check(app) }
    try {
      WallpaperManager.getInstance(app).addOnColorsChangedListener({ _, _ -> recheckSoon() }, handler)
    } catch (e: Exception) {
      Log.w(TAG, "Could not watch the wallpaper's colours", e)
    }
    try {
      app.contentResolver.registerContentObserver(
        Settings.Secure.getUriFor(THEME_CUSTOMIZATION),
        false,
        object : ContentObserver(handler) {
          override fun onChange(selfChange: Boolean, uri: Uri?) {
            recheckSoon()
          }
        },
      )
    } catch (e: Exception) {
      Log.w(TAG, "Could not watch the colour choice", e)
    }
  }

  // Redraws the widgets when the palette is not the one last seen. Never seen counts: the widgets
  // on the home screen were drawn by an older build, in its fixed colours. The palette is kept as
  // seen only once the redraw was asked for, so a failure is retried at the next check. Internal,
  // not private, for the Robolectric check run outside this repo (there is no android/ project).
  internal fun check(context: Context) {
    try {
      val current = SystemPalette.fingerprint(context) ?: return
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      if (current == prefs.getString(KEY_PALETTE, null)) return
      redrawWidgets(context)
      prefs.edit().putString(KEY_PALETTE, current).apply()
    } catch (e: Exception) {
      Log.w(TAG, "Could not check the system palette", e)
    }
  }

  // Every placed widget of this app, through its provider's onUpdate: the widget library starts
  // the JS task that draws it, which reads the palette afresh. A full update, as the hourly one:
  // rates over an hour old are topped up on the way.
  private fun redrawWidgets(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    for (info in manager.installedProviders) {
      if (info.provider.packageName != context.packageName) continue
      val ids = manager.getAppWidgetIds(info.provider)
      if (ids.isEmpty()) continue
      context.sendBroadcast(
        Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
          .setComponent(info.provider)
          .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids),
      )
    }
  }
}
