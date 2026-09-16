/**
 * Tests for PennyMark — Penny with an arm that moves.
 *
 * The path itself is rebuilt on the UI thread, which the globally mocked
 * Reanimated (jest.setup.js) does not run, so the arithmetic is covered in
 * `pennyArm.test.js` instead. What is worth pinning here is the structure the
 * illusion rests on: two strokes off one path, and the body drawn last.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import PennyMark from '../../app/components/startup/PennyMark';
import { ARM_CORE_WIDTH, ARM_INK_WIDTH } from '../../app/components/startup/pennyArm';
import { BRAND } from '../../app/styles/semanticColors';

const shared = (value) => ({ value });

const draw = async () => {
  const { toJSON } = await render(<PennyMark size={200} raise={shared(0)} wave={shared(0)} />);
  return toJSON();
};

describe('PennyMark', () => {
  it('strokes the arm twice off one path: the outline, then the lighter core', async () => {
    const [svg] = (await draw()).children;
    const [ink, core] = svg.children;

    // Order matters: the core sits inside the outline, so it goes down second.
    expect(ink.props.stroke).toBe(BRAND.ink);
    expect(ink.props.strokeWidth).toBe(ARM_INK_WIDTH);
    expect(core.props.stroke).toBe(BRAND.limb);
    expect(core.props.strokeWidth).toBe(ARM_CORE_WIDTH);
    // One animated source for both, so they can never disagree by a frame.
    expect(core.props.animatedProps).toBe(ink.props.animatedProps);
  });

  it('draws the body over the arm, so the shoulder stays under the coin', async () => {
    const types = (await draw()).children.map((child) => child.type);

    expect(types.indexOf('Svg')).toBeLessThan(types.indexOf('Image'));
  });

  it('draws at the size it is given, in the coordinate space of the artwork', async () => {
    const [svg] = (await draw()).children;

    expect(svg.props.width).toBe(200);
    expect(svg.props.height).toBe(200);
    expect(svg.props.viewBox).toBe('0 0 592 592');
  });
});
