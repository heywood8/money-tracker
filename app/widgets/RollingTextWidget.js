'use no memo';
// ↑ Built by the widget library calling it directly, like every widget part.

import { TextWidget } from 'react-native-android-widget';

/**
 * How many texts one widget can roll: the pair widget's two rates. Matches
 * GROUPS in patches/react-native-android-widget@*.patch (RollingIds.java).
 */
export const ROLLING_GROUPS = 2;

/**
 * A TextWidget whose digits roll on the home screen when its text changes:
 * 4,459 → 4,460 → … → 4,465, each changing digit rolling down out of its place
 * as the next comes in from above (the other way on a fall).
 *
 * The widget library draws a widget as one bitmap, which cannot move. Penny's
 * patch to it (patches/react-native-android-widget@*.patch, RollingText.java)
 * leaves a TextWidget given a `rollingGroup` out of the bitmap and shows its
 * text in live views laid over it, whose rolls the launcher animates. Android
 * 12 and up; older versions, and a text the live views cannot show as drawn
 * (wrapped, cut short, not bold), keep it in the bitmap.
 *
 * Each rolling text in a widget takes its own group, 0 up to ROLLING_GROUPS - 1,
 * and keeps it from draw to draw: the group is what remembers the last text,
 * to roll from. `rollingKey` names what the text is of (a rate's pair and
 * amount): a text under another key is something else, shown at once rather
 * than rolled to.
 *
 * The library builds its tree from its primitives by name, so this is one
 * (`__name__` 'TextWidget'): the TextWidget's own props, plus `rollingGroup`,
 * which the TextWidget's conversion would drop.
 *
 * @param {Object} props - A TextWidget's props, `rollingGroup` and `rollingKey`
 * @returns {null}
 */
export function RollingTextWidget() {
  return null;
}

RollingTextWidget.convertProps = ({ rollingGroup, rollingKey, ...props }) => ({
  ...TextWidget.convertProps(props),
  ...(Number.isInteger(rollingGroup) && rollingGroup >= 0 && rollingGroup < ROLLING_GROUPS
    ? { rollingGroup, ...(typeof rollingKey === 'string' ? { rollingKey } : null) }
    : null),
});
RollingTextWidget.__name__ = 'TextWidget';
