/**
 * The rate text whose digits roll on the home screen. It is one of the widget
 * library's primitives by name, so it is checked through the library's own
 * tree builder, the call the launcher path makes.
 */

import React from 'react';
import { buildWidgetTree } from 'react-native-android-widget/lib/commonjs/api/build-widget-tree';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { ROLLING_GROUPS, RollingTextWidget } from '../../app/widgets/RollingTextWidget';

const textNodeOf = (element) => buildWidgetTree(<FlexWidget>{element}</FlexWidget>).children[0];

describe('RollingTextWidget', () => {
  it('is a TextWidget to the library, with its group added', () => {
    const style = { fontSize: 22, fontWeight: 'bold', color: '#112233' };
    const rolling = textNodeOf(
      <RollingTextWidget text="₽81.55" rollingGroup={1} rollingKey="1 USD>RUB" maxLines={1} truncate="END" style={style} />,
    );
    const plain = textNodeOf(<TextWidget text="₽81.55" maxLines={1} truncate="END" style={style} />);

    expect(rolling.type).toBe('TextWidget');
    // Every prop the TextWidget would carry, converted the same way.
    expect(rolling.props).toEqual({ ...plain.props, rollingGroup: 1, rollingKey: '1 USD>RUB' });
  });

  it('rolls without a key, and drops a key that is not a string', () => {
    expect(textNodeOf(<RollingTextWidget text="1.00" rollingGroup={0} />).props)
      .not.toHaveProperty('rollingKey');
    expect(textNodeOf(<RollingTextWidget text="1.00" rollingGroup={0} rollingKey={7} />).props)
      .not.toHaveProperty('rollingKey');
  });

  it('leaves out a group the patch has no slots for', () => {
    [-1, ROLLING_GROUPS, 0.5, '0', undefined].forEach((rollingGroup) => {
      const node = textNodeOf(<RollingTextWidget text="1.00" rollingGroup={rollingGroup} rollingKey="k" />);

      expect(node.props).not.toHaveProperty('rollingGroup');
      expect(node.props).not.toHaveProperty('rollingKey');
      expect(node.props.text).toBe('1.00');
    });
  });

  it('allows the pair widget its two rates', () => {
    expect(ROLLING_GROUPS).toBe(2);
  });
});
