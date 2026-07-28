import { useState, useCallback } from 'react';
import { Keyboard } from 'react-native';

/**
 * Which picker is open and over what data.
 *
 * Walking the category tree is NOT this hook's job: a category picker renders
 * CategoryGridSelector (see CLAUDE.md, "Category selection"), which owns the
 * drill-down and hands back the chosen id — so `data` is simply the whole list
 * the picker was opened with, at every level.
 */
const useOperationPicker = () => {
  const [pickerState, setPickerState] = useState({
    visible: false,
    type: null,
    data: [],
  });

  const openPicker = useCallback((type, data) => {
    Keyboard.dismiss();
    setPickerState({ visible: true, type, data });
  }, []);

  const closePicker = useCallback(() => {
    setPickerState({ visible: false, type: null, data: [] });
  }, []);

  return {
    pickerState,
    openPicker,
    closePicker,
  };
};

export default useOperationPicker;
