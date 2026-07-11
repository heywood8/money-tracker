import { cardMaskLast4, cardMasksMatch } from '../../app/utils/cardMask';

describe('cardMaskLast4', () => {
  it('extracts the trailing four digits regardless of decoration or BIN prefix', () => {
    expect(cardMaskLast4('*5285')).toBe('5285');
    expect(cardMaskLast4('•• 5285')).toBe('5285');
    expect(cardMaskLast4('••5285')).toBe('5285');
    expect(cardMaskLast4('4083***5285')).toBe('5285');
    expect(cardMaskLast4('4083 12** **** 5285')).toBe('5285');
    expect(cardMaskLast4('5285')).toBe('5285');
  });

  it('returns null when fewer than four digits are present', () => {
    expect(cardMaskLast4('***')).toBeNull();
    expect(cardMaskLast4('•• 12')).toBeNull();
    expect(cardMaskLast4('')).toBeNull();
    expect(cardMaskLast4(null)).toBeNull();
    expect(cardMaskLast4(undefined)).toBeNull();
  });
});

describe('cardMasksMatch', () => {
  it('matches masks that share their last four digits despite formatting', () => {
    // The exact scenario behind the empty-account bug: a notification's short
    // mask vs. a full mask a user typed into the account editor.
    expect(cardMasksMatch('*5285', '4083***5285')).toBe(true);
    expect(cardMasksMatch('•• 5285', '5285')).toBe(true);
    expect(cardMasksMatch('4083***5285', '*5285')).toBe(true);
  });

  it('does not match different cards', () => {
    expect(cardMasksMatch('*5285', '*1234')).toBe(false);
    expect(cardMasksMatch('4083***5285', '4083***1234')).toBe(false);
  });

  it('never matches when either side lacks a comparable last-4', () => {
    expect(cardMasksMatch('*5285', null)).toBe(false);
    expect(cardMasksMatch(null, '*5285')).toBe(false);
    expect(cardMasksMatch('12', '12')).toBe(false);
  });
});
