package expo.modules.pennysystemcolors

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The system palette for the home-screen widgets, which run headless as often as in the app.
// See SystemPalette for what it holds and modules/penny-system-colors/index.js for the JS side.
class PennySystemColorsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("PennySystemColors")

    // Read on every call: the palette follows the wallpaper.
    Function("getPalette") {
      SystemPalette.read(context)
    }
  }
}
