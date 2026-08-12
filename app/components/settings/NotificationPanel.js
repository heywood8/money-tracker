import React, { useState, useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet } from 'react-native';
import NotificationProcessingContentPanel from '../NotificationProcessingContentPanel';
import NotificationFiltersContentPanel from '../NotificationFiltersContentPanel';
import NotificationBindingsContentPanel from '../NotificationBindingsContentPanel';
import NotificationTemplatesContentPanel from '../NotificationTemplatesContentPanel';
import NotificationTemplateEditorPanel from '../NotificationTemplateEditorPanel';

// The notification-processing subpanel. Its five views are already separate
// content panels; what lives here is which one is showing and the draft the
// template editor is working on.
//
// The draft is held here rather than inside the editor because the editor is a
// sibling view — the panel that launches it unmounts as it opens. Where leaving
// the editor returns to is the stack's business, not the draft's.
export default function NotificationPanel({
  step,
  parentStep,
  onPushStep,
  onPopStep,
  onReplaceStep,
  onRegisterBack,
  bottomInset,
}) {
  const [templateDraft, setTemplateDraft] = useState(null);

  // Backing out of the editor discards its draft.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    onRegisterBack(() => {
      if (stepRef.current === 'templateEditor') setTemplateDraft(null);
      return false;
    });
    return () => onRegisterBack(null);
  }, [onRegisterBack]);

  // Build a new template from a notification the user long-pressed in the feed.
  // `recent` rides along so the editor can report how many of the app's other
  // captured notifications the draft also matches.
  // `editing` rides on the stack entry rather than being read off the draft:
  // the header renders "New template" or "Edit template" from it, and the header
  // is the host's, not this panel's.
  const handleCreateTemplate = useCallback((notification, recent = []) => {
    setTemplateDraft({ notification, template: null, recent });
    onPushStep('templateEditor', { editing: false });
  }, [onPushStep]);

  const handleEditTemplate = useCallback((template) => {
    setTemplateDraft({ notification: null, template, recent: [] });
    onPushStep('templateEditor', { editing: true });
  }, [onPushStep]);

  // Leaving the editor. A cancel steps back to whichever view opened it — the
  // stack already knows which. A saved template lands on the templates list:
  // that is where it now lives, and seeing it there confirms the save, so an
  // editor opened from the feed replaces itself with the list rather than
  // popping back to it.
  const handleTemplateEditorDone = useCallback((saved) => {
    if (saved && parentStep !== 'templates') {
      onReplaceStep('templates');
    } else {
      onPopStep();
    }
    setTemplateDraft(null);
  }, [parentStep, onReplaceStep, onPopStep]);

  return (
    <View style={styles.fill}>
      {step === 'filters' ? (
        <NotificationFiltersContentPanel bottomInset={bottomInset} />
      ) : step === 'bindings' ? (
        <NotificationBindingsContentPanel bottomInset={bottomInset} />
      ) : step === 'templates' ? (
        <NotificationTemplatesContentPanel
          onEdit={handleEditTemplate}
          bottomInset={bottomInset}
        />
      ) : step === 'templateEditor' ? (
        <NotificationTemplateEditorPanel
          notification={templateDraft?.notification}
          template={templateDraft?.template}
          recentNotifications={templateDraft?.recent || []}
          onDone={handleTemplateEditorDone}
          bottomInset={bottomInset}
        />
      ) : (
        <NotificationProcessingContentPanel
          onCreateTemplate={handleCreateTemplate}
          bottomInset={bottomInset}
        />
      )}
    </View>
  );
}

NotificationPanel.propTypes = {
  // 'main' | 'filters' | 'bindings' | 'templates' | 'templateEditor'
  step: PropTypes.string,
  // The step back would land on — decides where a saved template goes.
  parentStep: PropTypes.string,
  onPushStep: PropTypes.func.isRequired,
  onPopStep: PropTypes.func.isRequired,
  onReplaceStep: PropTypes.func.isRequired,
  onRegisterBack: PropTypes.func.isRequired,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
