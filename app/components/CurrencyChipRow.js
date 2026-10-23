import React, { memo, useMemo } from 'react';
import PropTypes from 'prop-types';
import currencies from '../../assets/currencies.json';
import ChoiceChipRow from './ChoiceChipRow';

/**
 * The inline form counterpart of `CurrencySheet`: a row of M3 filter chips for
 * the currency of the *field being edited*, where the choice is one of a
 * handful and the form has room to show them all.
 *
 * Both budget modals grew their own copy of this and drifted apart — the line
 * editor tinted the selected chip at 33% primary over a rounded rectangle, the
 * group editor filled it solid primary while leaving the label `colors.text`,
 * which on the light theme put near-black text on a saturated blue. Neither
 * drew M3's leading checkmark, so a selected chip and a merely-emphasised one
 * were the same object. One component, one selected state: tonal fill, primary
 * outline, primary label, check.
 */

const CurrencyChipRow = memo(({
  codes,
  selectedCode,
  onSelect,
  colors,
  showSymbol = false,
  testIDPrefix,
  style,
}) => {
  const options = useMemo(() => codes.map((code) => {
    const symbol = showSymbol ? currencies[code]?.symbol : null;
    return {
      value: code,
      label: symbol && symbol !== code ? `${symbol} ${code}` : code,
      accessibilityLabel: code,
    };
  }), [codes, showSymbol]);

  return (
    <ChoiceChipRow
      options={options}
      selected={selectedCode}
      onSelect={onSelect}
      colors={colors}
      testIDPrefix={testIDPrefix}
      style={style}
    />
  );
});

CurrencyChipRow.displayName = 'CurrencyChipRow';

CurrencyChipRow.propTypes = {
  codes: PropTypes.arrayOf(PropTypes.string).isRequired,
  selectedCode: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  colors: PropTypes.object.isRequired,
  showSymbol: PropTypes.bool,
  testIDPrefix: PropTypes.string.isRequired,
  // The row's placement in its host's layout (a margin, a flex) — never its
  // chips' own look, which is the whole point of the component.
  style: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
};

export default CurrencyChipRow;
