package expo.modules.pennysystemcolors

import android.annotation.TargetApi
import android.content.Context
import android.os.Build
import java.util.Locale

// The phone's own colours ("Material You", Android 12+): five tonal palettes the system derives
// from the wallpaper or from the colours picked in "Wallpaper & style", thirteen shades each, as
// the framework's @android:color/system_* resources. The widgets the system and Google ship take
// their background, text and accent from these, and so do Penny's home-screen widgets
// (app/widgets/widgetColors.js), which are drawn as a picture and so need the values themselves.
//
// Shade 0 is white, 1000 black; 500 is the palette's key colour.
object SystemPalette {
  val SHADES = intArrayOf(0, 10, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000)

  // Each palette's resources in the order of SHADES.
  @TargetApi(Build.VERSION_CODES.S)
  private fun resources(): Map<String, IntArray> = linkedMapOf(
    "accent1" to intArrayOf(
      android.R.color.system_accent1_0, android.R.color.system_accent1_10,
      android.R.color.system_accent1_50, android.R.color.system_accent1_100,
      android.R.color.system_accent1_200, android.R.color.system_accent1_300,
      android.R.color.system_accent1_400, android.R.color.system_accent1_500,
      android.R.color.system_accent1_600, android.R.color.system_accent1_700,
      android.R.color.system_accent1_800, android.R.color.system_accent1_900,
      android.R.color.system_accent1_1000,
    ),
    "accent2" to intArrayOf(
      android.R.color.system_accent2_0, android.R.color.system_accent2_10,
      android.R.color.system_accent2_50, android.R.color.system_accent2_100,
      android.R.color.system_accent2_200, android.R.color.system_accent2_300,
      android.R.color.system_accent2_400, android.R.color.system_accent2_500,
      android.R.color.system_accent2_600, android.R.color.system_accent2_700,
      android.R.color.system_accent2_800, android.R.color.system_accent2_900,
      android.R.color.system_accent2_1000,
    ),
    "accent3" to intArrayOf(
      android.R.color.system_accent3_0, android.R.color.system_accent3_10,
      android.R.color.system_accent3_50, android.R.color.system_accent3_100,
      android.R.color.system_accent3_200, android.R.color.system_accent3_300,
      android.R.color.system_accent3_400, android.R.color.system_accent3_500,
      android.R.color.system_accent3_600, android.R.color.system_accent3_700,
      android.R.color.system_accent3_800, android.R.color.system_accent3_900,
      android.R.color.system_accent3_1000,
    ),
    "neutral1" to intArrayOf(
      android.R.color.system_neutral1_0, android.R.color.system_neutral1_10,
      android.R.color.system_neutral1_50, android.R.color.system_neutral1_100,
      android.R.color.system_neutral1_200, android.R.color.system_neutral1_300,
      android.R.color.system_neutral1_400, android.R.color.system_neutral1_500,
      android.R.color.system_neutral1_600, android.R.color.system_neutral1_700,
      android.R.color.system_neutral1_800, android.R.color.system_neutral1_900,
      android.R.color.system_neutral1_1000,
    ),
    "neutral2" to intArrayOf(
      android.R.color.system_neutral2_0, android.R.color.system_neutral2_10,
      android.R.color.system_neutral2_50, android.R.color.system_neutral2_100,
      android.R.color.system_neutral2_200, android.R.color.system_neutral2_300,
      android.R.color.system_neutral2_400, android.R.color.system_neutral2_500,
      android.R.color.system_neutral2_600, android.R.color.system_neutral2_700,
      android.R.color.system_neutral2_800, android.R.color.system_neutral2_900,
      android.R.color.system_neutral2_1000,
    ),
  )

  /**
   * Every palette as `{ "accent1": { "0": "#ffffff", "10": "#…", …, "1000": "#000000" }, … }`,
   * read now: the values follow the wallpaper, so they are never kept. Null below Android 12,
   * which has no such palette.
   */
  fun read(context: Context): Map<String, Map<String, String>>? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return null
    return resources().mapValues { (_, ids) ->
      val shades = LinkedHashMap<String, String>()
      ids.forEachIndexed { i, id -> shades[SHADES[i].toString()] = hex(context.getColor(id)) }
      shades
    }
  }

  /** The whole palette as one string, to tell whether it changed. Null below Android 12. */
  fun fingerprint(context: Context): String? = read(context)
    ?.entries
    ?.joinToString(";") { (name, shades) -> "$name:" + shades.values.joinToString(",") }

  // The shades are opaque; the alpha byte is left out so the value reads as CSS and SVG do.
  private fun hex(color: Int): String = String.format(Locale.ROOT, "#%06x", color and 0xFFFFFF)
}
