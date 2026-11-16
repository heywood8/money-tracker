package expo.modules.pennysystemcolors

import android.app.Application
import android.content.Context
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.Package

// Found by Expo autolinking by its name (…Package.kt importing Package). Starts PaletteWatcher
// with the process, whatever started it: the app, a widget update or the bank-notification
// listener, so the widgets follow the palette without the app being opened.
class PennySystemColorsPackage : Package {
  override fun createApplicationLifecycleListeners(context: Context): List<ApplicationLifecycleListener> =
    listOf(
      object : ApplicationLifecycleListener {
        override fun onCreate(application: Application) {
          PaletteWatcher.start(application)
        }
      },
    )
}
