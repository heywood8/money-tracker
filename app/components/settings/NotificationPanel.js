import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import NotificationProcessingContentPanel from '../NotificationProcessingContentPanel';
import NotificationFiltersContentPanel from '../NotificationFiltersContentPanel';
import NotificationBindingsContentPanel from '../NotificationBindingsContentPanel';
import NotificationTemplatesContentPanel from '../NotificationTemplatesContentPanel';
import NotificationTemplateEditorPanel from '../NotificationTemplateEditorPanel';
import NotificationTabBar from './NotificationTabBar';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useThemeColors } from '../../contexts/ThemeColorsContext';
import { SPRING_SETTLE, clampWithRubberband } from '../../utils/motion';

// The notification-processing subpanel.
//
// Its four pages are tabs, not a menu: bindings, templates and filters are
// where you look while working through the feed, and reaching them through a
// three-dots menu meant every glance cost a menu, a tap and a full navigation
// step back. As tabs they are one swipe apart, and the feed keeps its place
// while you go and look.
//
// The template editor is the exception and stays a pushed step on the host's
// stack: it is a full-screen task with a draft attached, not a page you swipe
// past. The draft is held here rather than inside the editor because the editor
// is a sibling view — the page that launches it unmounts as it opens.

const TABS = [
  { key: 'feed', labelKey: 'notification_feed', fallback: 'Notifications' },
  { key: 'bindings', labelKey: 'notification_bindings', fallback: 'Bindings' },
  { key: 'templates', labelKey: 'notification_templates', fallback: 'Templates' },
  { key: 'filters', labelKey: 'notification_filters', fallback: 'Filters' },
];

const TEMPLATES_TAB = TABS.findIndex((tab) => tab.key === 'templates');
// Read inside the gesture worklets. A plain number, so the worklet's closure
// carries a scalar rather than the whole TABS array across to the UI thread.
const TAB_COUNT = TABS.length;

// Same physics as the main tab strip: a spring so a flick carries its velocity
// into the settle, shortened from SPRING_SETTLE's response because switching
// tabs is a move the user makes constantly.
const TAB_SPRING = { ...SPRING_SETTLE, duration: 280 };

// Drag distance / release speed past which the swipe commits to the next tab.
const DISTANCE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 500;
// Slop before the pager takes the gesture. Below the host panel's own 16px
// dismiss slop, so on any tab but the first the pager claims a back-swipe first.
const ACTIVE_OFFSET = 12;

export default function NotificationPanel({
  step,
  onPushStep,
  onPopStep,
  onRegisterBack,
  onCanStepBackChange = null,
  hostSwipeGesture = null,
  bottomInset,
}) {
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  const { width: windowWidth } = useWindowDimensions();

  const [templateDraft, setTemplateDraft] = useState(null);
  // Which tab is settled, and how wide one page is. The width starts at the
  // window width so the very first layout is already right on a full-bleed
  // panel; onLayout only corrects it (rotation, split screen).
  const [tab, setTab] = useState(0);
  const tabRef = useRef(0);
  tabRef.current = tab;
  const [pageWidth, setPageWidth] = useState(windowWidth);
  // Every page mounts one idle tick after the panel opens, and stays mounted.
  // Mounting on reveal is not an option: a swipe uncovers the neighbour
  // immediately, and a page that mounts as it appears shows a spinner during
  // the drag. Mounting them all up front would put three panels' worth of
  // database reads on the panel's own open.
  const [allMounted, setAllMounted] = useState(false);

  const translateX = useSharedValue(0);
  // Fractional tab position: the pill in the strip rides this, so it follows
  // the finger rather than jumping when the swipe commits.
  const progress = useSharedValue(0);
  // Mirror of `tab` readable from the gesture worklets.
  const tabShared = useSharedValue(0);
  const dragStart = useSharedValue(0);
  // Translation already travelled when the pager claims the gesture. Subtracted
  // so the pages track the finger from where it is rather than jumping by the
  // activation slop the moment the swipe is recognized.
  const dragOrigin = useSharedValue(0);

  // Staged again after the editor closes, not just on open: the pages unmount
  // while the editor is showing, and remounting all four in the same commit is
  // the burst this staging exists to avoid.
  useEffect(() => {
    if (step === 'templateEditor') {
      setAllMounted(false);
      return undefined;
    }
    const handle = requestIdleCallback(() => setAllMounted(true));
    return () => cancelIdleCallback(handle);
  }, [step]);

  const tabs = useMemo(
    () => TABS.map((item) => ({ key: item.key, label: t(item.labelKey) || item.fallback })),
    [t],
  );

  const goToTab = useCallback((next, { animated = true } = {}) => {
    const target = Math.min(Math.max(next, 0), TAB_COUNT - 1);
    setTab(target);
    tabShared.value = target;
    if (animated) {
      progress.value = withSpring(target, TAB_SPRING);
      translateX.value = withSpring(-target * pageWidth, TAB_SPRING);
    } else {
      progress.value = target;
      translateX.value = -target * pageWidth;
    }
  }, [pageWidth, progress, tabShared, translateX]);

  // A page-width change (rotation, split screen) invalidates the resting
  // offset, so re-anchor the strip on the current tab without animating. Only a
  // real width change may do this: re-running it on a tab change would snap the
  // strip to its destination and swallow the transition.
  const widthRef = useRef(pageWidth);
  useEffect(() => {
    if (widthRef.current === pageWidth) return;
    widthRef.current = pageWidth;
    translateX.value = -tabRef.current * pageWidth;
  }, [pageWidth, translateX]);

  const handlePagerLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    setPageWidth((prev) => (width > 0 && width !== prev ? width : prev));
  }, []);

  const atFirstTab = tab === 0;

  const gesture = useMemo(() => {
    const lastOffset = -(TAB_COUNT - 1) * pageWidth;
    const pan = Gesture.Pan()
      // Vertical drags belong to the page's own scroll view.
      .failOffsetY([-16, 16])
      .onStart((event) => {
        'worklet';
        dragStart.value = translateX.value;
        dragOrigin.value = event.translationX;
      })
      .onUpdate((event) => {
        'worklet';
        // Past the first / last tab the strip keeps following the finger with
        // progressive resistance rather than freezing against the clamp.
        translateX.value = clampWithRubberband(
          dragStart.value + (event.translationX - dragOrigin.value),
          lastOffset,
          0,
          pageWidth,
        );
        progress.value = Math.min(
          TAB_COUNT - 1,
          Math.max(0, -translateX.value / pageWidth),
        );
      })
      .onEnd((event) => {
        'worklet';
        const current = tabShared.value;
        const travelled = event.translationX - dragOrigin.value;
        let target = current;
        if (travelled < -DISTANCE_THRESHOLD || event.velocityX < -VELOCITY_THRESHOLD) {
          target = Math.min(current + 1, TAB_COUNT - 1);
        } else if (travelled > DISTANCE_THRESHOLD || event.velocityX > VELOCITY_THRESHOLD) {
          target = Math.max(current - 1, 0);
        }
        tabShared.value = target;
        // Hand the release speed to both springs so the pages and the pill keep
        // the momentum of the flick. `target === current` when the swipe fell
        // short, so the same two springs cover commit and snap-back.
        progress.value = withSpring(target, {
          ...TAB_SPRING,
          velocity: -event.velocityX / pageWidth,
        });
        translateX.value = withSpring(-target * pageWidth, {
          ...TAB_SPRING,
          velocity: event.velocityX,
        });
        // Highlight the destination as the finger leaves rather than when the
        // spring settles — the tab has been chosen by then.
        if (target !== current) runOnJS(setTab)(target);
      });

    // On the first tab a rightward drag is the host panel's swipe back to the
    // settings list, so the pager only takes leftward drags there and fails
    // outright on a rightward one instead of sitting on the gesture until the
    // finger lifts. On every other tab it claims both directions, and the host
    // waits for it (blocksExternalGesture) rather than racing it.
    const directional = atFirstTab
      ? pan.activeOffsetX(-ACTIVE_OFFSET).failOffsetX(ACTIVE_OFFSET - 2)
      : pan.activeOffsetX([-ACTIVE_OFFSET, ACTIVE_OFFSET]);
    return hostSwipeGesture ? directional.blocksExternalGesture(hostSwipeGesture) : directional;
  }, [atFirstTab, hostSwipeGesture, pageWidth, dragOrigin, dragStart, progress, tabShared, translateX]);

  const pagerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Back navigation. The editor discards its draft and lets the host pop the
  // step it pushed; on the tabs, anything but the first tab returns to the feed
  // (claiming the gesture), and the feed itself lets the host close the panel.
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    onRegisterBack(() => {
      if (stepRef.current === 'templateEditor') {
        setTemplateDraft(null);
        return false;
      }
      if (tabRef.current > 0) {
        goToTab(0);
        return true;
      }
      return false;
    });
    return () => onRegisterBack(null);
  }, [onRegisterBack, goToTab]);

  // Tell the host whether a completed back-swipe has somewhere to go inside the
  // panel. It only matters as a fallback — the pager claims the gesture first —
  // but without it a swipe the pager missed would close the panel from a tab
  // the user had stepped into.
  useEffect(() => {
    onCanStepBackChange?.(step !== 'templateEditor' && tab > 0);
  }, [onCanStepBackChange, step, tab]);
  // Closing the panel leaves nothing to step back to.
  useEffect(() => () => onCanStepBackChange?.(false), [onCanStepBackChange]);

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

  // Leaving the editor. Either way the host pops the step, putting the tabs
  // back; a saved template additionally lands the user on the templates tab,
  // because that is where it now lives and seeing it there confirms the save.
  // No animation for that jump: the pop is already a transition, and two at
  // once reads as a glitch.
  const handleTemplateEditorDone = useCallback((saved) => {
    onPopStep();
    setTemplateDraft(null);
    if (saved) goToTab(TEMPLATES_TAB, { animated: false });
  }, [goToTab, onPopStep]);

  if (step === 'templateEditor') {
    return (
      <View style={styles.fill}>
        <NotificationTemplateEditorPanel
          notification={templateDraft?.notification}
          template={templateDraft?.template}
          recentNotifications={templateDraft?.recent || []}
          onDone={handleTemplateEditorDone}
          bottomInset={bottomInset}
        />
      </View>
    );
  }

  const renderTab = (key, i) => {
    if (!allMounted && i !== tab) return null;
    const active = i === tab;
    if (key === 'bindings') return <NotificationBindingsContentPanel active={active} bottomInset={bottomInset} />;
    if (key === 'templates') {
      return (
        <NotificationTemplatesContentPanel
          active={active}
          onEdit={handleEditTemplate}
          bottomInset={bottomInset}
        />
      );
    }
    if (key === 'filters') return <NotificationFiltersContentPanel active={active} bottomInset={bottomInset} />;
    return (
      <NotificationProcessingContentPanel
        active={active}
        onCreateTemplate={handleCreateTemplate}
        bottomInset={bottomInset}
      />
    );
  };

  return (
    <View style={styles.fill}>
      <NotificationTabBar
        colors={colors}
        index={tab}
        onSelect={goToTab}
        progress={progress}
        tabs={tabs}
      />
      <View style={styles.pager} onLayout={handlePagerLayout}>
        <GestureDetector gesture={gesture}>
          <Animated.View
            style={[styles.pagerRow, { width: pageWidth * TAB_COUNT }, pagerStyle]}
          >
            {TABS.map((item, i) => (
              <View key={item.key} style={[styles.page, { width: pageWidth }]}>
                {renderTab(item.key, i)}
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

NotificationPanel.propTypes = {
  // 'main' (the tabs) | 'templateEditor'
  step: PropTypes.string,
  onPushStep: PropTypes.func.isRequired,
  onPopStep: PropTypes.func.isRequired,
  onRegisterBack: PropTypes.func.isRequired,
  // Reports whether a back gesture has a level to step up to inside the panel.
  onCanStepBackChange: PropTypes.func,
  // The host panel's swipe-to-dismiss gesture, so the pager can declare
  // priority over it instead of racing it.
  hostSwipeGesture: PropTypes.object,
  bottomInset: PropTypes.number,
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  page: {
    height: '100%',
  },
  pager: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerRow: {
    flex: 1,
    flexDirection: 'row',
  },
});
