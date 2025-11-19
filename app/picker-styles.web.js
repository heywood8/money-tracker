// Web-specific picker styles
export const pickerWebStyles = `
  select.picker-select {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    background-image: none !important;
    background-color: transparent;
    padding-right: 8px !important;
  }

  select.picker-select::-ms-expand {
    display: none;
  }

  select.picker-select option {
    background-color: white;
    color: black;
  }
`;

// Inject styles into document head
if (typeof document !== 'undefined') {
  const styleId = 'picker-custom-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = pickerWebStyles;
    document.head.appendChild(style);
  }
}
