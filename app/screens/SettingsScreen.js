import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
// ToastAndroid is intentional: this is an Android-only app, so the platform-split lint rule
// doesn't apply here.
// eslint-disable-next-line react-native/split-platform-components
import { View, StyleSheet, TouchableOpacity, BackHandler, AppState, ToastAndroid } from 'react-native';
import { HORIZONTAL_PADDING, SPACING } from '../styles/designTokens';
import { Text, Divider, Menu } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';
import useSettingsPanelStack from '../hooks/useSettingsPanelStack';
import SettingsList from '../components/settings/SettingsList';
import LanguagePanel from '../components/settings/LanguagePanel';
import UpdatePanel from '../components/settings/UpdatePanel';
import ExportPanel from '../components/settings/ExportPanel';
import ImportPanel from '../components/settings/ImportPanel';
import NotificationPanel from '../components/settings/NotificationPanel';
import LogsPanel from '../components/settings/LogsPanel';
import ResetPanel from '../components/settings/ResetPanel';
import { useThemeColors } from '../contexts/ThemeColorsContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { appEvents, EVENTS } from '../services/eventEmitter';
import AccountsScreen from './AccountsScreen';
import CategoriesScreen from './CategoriesScreen';

export default function SettingsScreen({ setSubPanelActive }) {
  const insets = useSafeAreaInsets();
  // Bottom padding applied to each subpanel's scrollable content so the last
  // items clear the floating tab bar while the scroll viewport itself still
  // extends to the screen bottom — letting content scroll behind the
  // translucent bar exactly like the operations list does.
  const scrollBottomInset = insets.bottom + 80;
  const { colors } = useThemeColors();
  const { t } = useLocalization();
  // Subpanel navigation. The stack owns which panel is open and how deep into
  // its nested views the user has stepped, so "can we go back?", the header
  // title and the back handler all derive from one place instead of from four
  // parallel conditional chains. The names below read the current step off it,
  // keeping the render body's existing shape.
  const panelStack = useSettingsPanelStack();
  const {
    open: openStack,
    swapPanel: swapStackPanel,
    push: pushStep,
    replace: replaceStep,
    pop: popStep,
    popToRoot: popToRootStep,
    close: closeStack,
  } = panelStack;
  const activeSubPanel = panelStack.panel;
  // Nested view within the notification-processing subpanel: 'main' shows the
  // review queue + feed, 'filters' shows access/toggle/app-filter controls,
  // 'bindings' the learned associations, 'templates' the parser list, and
  // 'templateEditor' the field-marking editor.
  const notificationView = panelStack.stepOf('notificationProcessing');
  // Controls the notification-processing header overflow (three-dots) menu.
  const [notificationMenuVisible, setNotificationMenuVisible] = useState(false);
  // Measured size of the settings container. The subpanel overlay is sized in
  // explicit pixels from this rather than relying on `absoluteFillObject`'s
  // top+bottom inset stretch, which collapses to zero height under Reanimated 4 /
  // RN 0.85's Yoga (leaving the panel invisible / seemingly not opening).
  const [containerSize, setContainerSize] = useState(null);
  const exportStep = panelStack.stepOf('export');
  const importStep = panelStack.stepOf('import');


  // Back navigation is locked while the open panel says it is mid-flight — a
  // Sheets export/import stage, or a database wipe. Only one panel is mounted at
  // a time and each releases the flag on unmount, so a single flag is enough and
  // the screen no longer has to know which panels have long operations.
  const [panelBusy, setPanelBusy] = useState(false);
  const isBackDisabled = panelBusy;

  // A panel can hook the back gesture to release state its current step owns
  // (a finished Sheets run, a chosen backup, a template draft). The hook runs
  // before the host pops; returning true claims the gesture outright, which is
  // what the embedded screens do when they still have a level of their own.
  const panelBackRef = useRef(null);
  const registerPanelBack = useCallback((fn) => {
    panelBackRef.current = typeof fn === 'function' ? fn : null;
  }, []);

  // A panel can name itself in the header when its title depends on something
  // only it knows — the update panel says whether it found anything.
  const [panelTitle, setPanelTitle] = useState(null);
  const registerPanelTitle = useCallback((title) => {
    setPanelTitle(title ?? null);
  }, []);

  // A panel can offer the subpanel header an action (currently only the import
  // backup list, which gets a refresh button).
  const [panelRefresh, setPanelRefresh] = useState(null);
  const registerPanelRefresh = useCallback((fn) => {
    setPanelRefresh(() => (typeof fn === 'function' ? fn : null));
  }, []);

  // Resets all subpanel state and unmounts it. Called once the slide-away
  // animation has played (or immediately when another flow takes over).
  const closeSubPanel = useCallback(() => {
    closeStack();
    // Drop whatever the closing panel registered. Panels clear their own hooks
    // on unmount, but the embedded screens do not, and a stale handler would
    // swallow the next panel's back gesture.
    registerPanelBack(null);
    registerPanelRefresh(null);
    registerPanelTitle(null);
    setPanelBusy(false);
    setEmbeddedCanGoBack(false);
    // Everything else the panels used to leave behind now unmounts with them.
    setNotificationMenuVisible(false);
  }, [closeStack, registerPanelBack, registerPanelRefresh, registerPanelTitle]);

  // The wipe finished: close the panel and say so. The toast lives here rather
  // than in ResetPanel because acknowledging a completed subpanel is the host's
  // job — the panel is gone by the time the message shows.
  const handleResetDone = useCallback(() => {
    closeSubPanel();
    ToastAndroid.show(t('database_reset_done') || 'Database reset', ToastAndroid.SHORT);
  }, [closeSubPanel, t]);

  // Embedded screens (Accounts/Categories) report whether they can navigate back
  // one level internally (edit form open, subcategory drill, picker, …) so a swipe
  // / hardware-back steps up there before closing the whole panel.
  const [embeddedCanGoBack, setEmbeddedCanGoBack] = useState(false);
  const handleEmbeddedBackStateChange = useCallback((goBack) => {
    setEmbeddedCanGoBack(!!goBack);
    // Folded into the same registration the extracted panels use. An embedded
    // screen that can still pop claims the gesture, so the host leaves its own
    // stack alone.
    registerPanelBack(typeof goBack === 'function' ? () => { goBack(); return true; } : null);
  }, [registerPanelBack]);

  // Capture the container's pixel size so the subpanel overlay can be sized
  // explicitly (see containerSize above). Only update on real changes to avoid
  // an extra render loop.
  const handleContainerLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  // Whether a completed swipe (or hardware-back) should step one level up rather
  // than dismiss the whole panel: nested Import/Export steps, or an embedded
  // Accounts/Categories screen that still has an internal level to pop.
  const canSwipeStepBack = useMemo(() => {
    if (activeSubPanel === 'accounts' || activeSubPanel === 'categories') return embeddedCanGoBack;
    return panelStack.canStepBack;
  }, [activeSubPanel, embeddedCanGoBack, panelStack.canStepBack]);

  // Unified back navigation for the swipe, hardware-back, and the header arrow.
  // The resolver is defined further down (it depends on dismissPanel, which this
  // hook returns), so reach it through a ref kept current each render. It pops one
  // level when possible (embedded screen / nested step) and otherwise closes.
  const subPanelBackRef = useRef(null);
  const navigateBack = useCallback(() => {
    subPanelBackRef.current?.();
  }, []);

  // Telegram-style interactive swipe: drag the subpanel right and it follows the
  // finger, sliding away to reveal the main settings list behind it. Every panel
  // is swipeable from anywhere on its surface; inside the Accounts/Categories
  // reorder lists, vertical drags/scroll yield to those gestures via failOffsetY,
  // and the drag handle is long-press activated, so the swipe never steals a
  // reorder.
  const { gesture: swipeGesture, animatedStyle: swipeStyle, open: openPanelAnim, dismiss: dismissPanel } =
    useSwipeDismiss({
      onDismiss: closeSubPanel,
      onStepBack: navigateBack,
      canStepBack: canSwipeStepBack,
      enabled: !isBackDisabled,
    });

  const openSubPanel = useCallback((panel) => {
    // Panels own their own entry state now: each mounts fresh at the step the
    // stack starts it on. Only the header's own menu is reset here.
    setNotificationMenuVisible(false);
    openStack(panel);
    openPanelAnim();
  }, [openPanelAnim, openStack]);

  useEffect(() => {
    setSubPanelActive(activeSubPanel !== null);
  }, [activeSubPanel, setSubPanelActive]);

  // Android hardware back: step one level up when possible (nested step / embedded
  // screen), otherwise close the panel — mirroring the swipe and the back arrow.
  useEffect(() => {
    if (!activeSubPanel) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isBackDisabled) return true;
      navigateBack();
      return true;
    });
    return () => subscription.remove();
  }, [activeSubPanel, isBackDisabled, navigateBack]);

  // When the app is backgrounded while a subpanel is open, reset back to the main
  // settings list so returning to the app lands on the settings root rather than
  // mid-flow. Skipped while a long async step (Sheets export/import) is running so
  // it isn't yanked out from under an in-flight operation.
  const closeSubPanelRef = useRef(closeSubPanel);
  closeSubPanelRef.current = closeSubPanel;
  const isBackDisabledRef = useRef(isBackDisabled);
  isBackDisabledRef.current = isBackDisabled;
  const activeSubPanelRef = useRef(activeSubPanel);
  activeSubPanelRef.current = activeSubPanel;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'background') return;
      if (!activeSubPanelRef.current || isBackDisabledRef.current) return;
      closeSubPanelRef.current();
    });
    return () => subscription.remove();
  }, []);

  // A tapped "transactions to review" notification now routes to the operations
  // page, so a subpanel left open here would stay "active" behind the user's back:
  // it keeps swipe navigation disabled and its hardware-back handler mounted while
  // they are on another tab. Close it on the same event (with the in-flight-async
  // guard the backgrounding reset uses), leaving Settings on its root list.
  useEffect(() => {
    const unsubscribe = appEvents.on(EVENTS.OPEN_PENDING_OPERATIONS, () => {
      if (!activeSubPanelRef.current || isBackDisabledRef.current) return;
      closeSubPanelRef.current();
    });
    return unsubscribe;
  }, []);

  // When Sheets import dead-ends on "no spreadsheet configured", this CTA sends the user
  // straight to the export subpanel to set one up. The subpanel is already slid in, so we
  // just swap its content instead of re-opening (QoL-13).
  const handleSetupSheetsExport = useCallback(() => {
    swapStackPanel('export');
  }, [swapStackPanel]);

  // ─── Subpanel title resolver ───
  // A panel that named itself wins; the rest are named from their panel and step.
  const subPanelTitle = useMemo(() => {
    if (panelTitle) return panelTitle;
    if (activeSubPanel === 'accounts') return t('accounts') || 'Accounts';
    if (activeSubPanel === 'categories') return t('categories') || 'Categories';
    if (activeSubPanel === 'language') return t('language');
    if (activeSubPanel === 'export') {
      return exportStep === 'sheets-progress' ? 'Google Sheets' : (t('export_format') || 'Export Format');
    }
    if (activeSubPanel === 'import') {
      if (importStep === 'source') return t('import') || 'Import';
      if (importStep === 'sheets-progress') return t('google_sheets_import') || 'Import from Sheets';
      if (importStep === 'local-list') return t('local_backups') || 'Local Backups';
      return t('restore_database') || 'Restore Database';
    }
    if (activeSubPanel === 'logs') return t('logs') || 'Logs';
    if (activeSubPanel === 'notificationProcessing') {
      if (notificationView === 'filters') return t('notification_filters') || 'Filters';
      if (notificationView === 'bindings') return t('notification_bindings') || 'Bindings';
      if (notificationView === 'templates') return t('notification_templates') || 'Templates';
      if (notificationView === 'templateEditor') {
        return panelStack.params?.editing
          ? (t('notification_template_edit') || 'Edit template')
          : (t('notification_template_new') || 'New template');
      }
      return t('notification_processing') || 'Notification processing';
    }
    if (activeSubPanel === 'reset') return t('reset_database') || 'Reset Database';
    return '';
  }, [panelTitle, activeSubPanel, exportStep, importStep, notificationView, panelStack.params, t]);

  // Resolver behind navigateBack — the single answer for all three back paths
  // (swipe, hardware back, header arrow). An embedded Accounts/Categories screen
  // that can still pop a level (form, picker, subcategory) gets first refusal;
  // otherwise a nested step steps up, and the panel's root step dismisses.
  // Because the stack records how the user got here, the template editor returns
  // to whichever view opened it without anyone having to remember which.
  subPanelBackRef.current = () => {
    if (isBackDisabled) return;
    // The open panel gets first refusal. An embedded Accounts/Categories screen
    // claims the gesture outright while it still has a level of its own; the
    // extracted panels only release state and hand navigation back.
    if (panelBackRef.current?.()) return;
    if (panelStack.canStepBack) {
      popStep();
      return;
    }
    dismissPanel();
  };


  // ─── RENDER ───
  // Header action slot (opposite the back arrow). A panel that wants a refresh
  // button registers one (the import backup list does, while it is showing); the
  // notification-processing main view gets a three-dots overflow menu, which is
  // header chrome and stays here because all it does is push a step. Everything
  // else gets an empty spacer so the title stays centered.
  let headerRightSlot = <View style={styles.backButton} />;
  if (panelRefresh) {
    headerRightSlot = (
      <TouchableOpacity onPress={panelRefresh} style={styles.backButton}>
        <Ionicons name="refresh-outline" size={22} color={colors.text} />
      </TouchableOpacity>
    );
  } else if (activeSubPanel === 'notificationProcessing' && notificationView === 'main') {
    headerRightSlot = (
      <Menu
        visible={notificationMenuVisible}
        onDismiss={() => setNotificationMenuVisible(false)}
        anchor={(
          <TouchableOpacity
            onPress={() => setNotificationMenuVisible(true)}
            style={styles.backButton}
            testID="notification-overflow-button"
            accessibilityRole="button"
            accessibilityLabel={t('notification_filters') || 'Filters'}
          >
            <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
      >
        <Menu.Item
          onPress={() => {
            setNotificationMenuVisible(false);
            pushStep('bindings');
          }}
          title={t('notification_bindings') || 'Bindings'}
          leadingIcon="link-variant"
          testID="notification-bindings-menu-item"
        />
        <Menu.Item
          onPress={() => {
            setNotificationMenuVisible(false);
            pushStep('templates');
          }}
          title={t('notification_templates') || 'Templates'}
          leadingIcon="text-search"
          testID="notification-templates-menu-item"
        />
        <Menu.Item
          onPress={() => {
            setNotificationMenuVisible(false);
            pushStep('filters');
          }}
          title={t('notification_filters') || 'Filters'}
          leadingIcon="filter-variant"
          testID="notification-filters-menu-item"
        />
      </Menu>
    );
  }

  // The subpanel is an overlay that slides over the main settings list. Keeping
  // the list mounted behind it lets a rightward swipe (or the back arrow) reveal
  // it Telegram-style as the panel follows the finger off the right edge.
  const subPanelOverlay = activeSubPanel !== null ? (
    // Positioning/stacking live on a plain View (absolute fill + zIndex): under
    // Reanimated 4 / RN 0.85's Yoga, an `absoluteFillObject` stretch (top+bottom)
    // applied directly to the gesture-driven, transform-animated Animated.View is
    // dropped — the panel collapses to its header height and falls into normal
    // flow below the list. The inner Animated.View instead fills this concretely
    // sized parent with flex:1 and carries only the swipe transform + background.
    <View style={[
      styles.subPanelOverlay,
      containerSize && { width: containerSize.width, height: containerSize.height },
    ]}>
      <GestureDetector gesture={swipeGesture}>
        <Animated.View
          style={[styles.subPanelFill, { backgroundColor: colors.background }, swipeStyle]}
        >
          {/* Subpanel header */}
          <View style={styles.subPanelHeader}>
            <TouchableOpacity
              onPress={navigateBack}
              style={styles.backButton}
              testID="settings-subpanel-back"
              disabled={isBackDisabled}
            >
              <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text variant="titleLarge" style={[styles.subPanelTitle, { color: colors.text }]}>
              {subPanelTitle}
            </Text>
            {headerRightSlot}
          </View>

          <Divider />

          {/* Subpanel body — fills to the screen bottom so list content can scroll
            behind the translucent floating tab bar. The bottom padding that keeps
            the last items reachable lives on each scrollable's contentContainerStyle
            instead, mirroring the operations list. */}
          <View style={[
            styles.subPanelBody,
            (activeSubPanel === 'accounts' || activeSubPanel === 'categories') && styles.subPanelBodyFlush,
          ]}>
            {activeSubPanel === 'accounts' && <AccountsScreen onBackStateChange={handleEmbeddedBackStateChange} />}
            {activeSubPanel === 'categories' && <CategoriesScreen onBackStateChange={handleEmbeddedBackStateChange} />}

            {activeSubPanel === 'language' && (
              <LanguagePanel onSelected={dismissPanel} bottomInset={scrollBottomInset} />
            )}

            {activeSubPanel === 'export' && (
              <ExportPanel
                step={exportStep}
                onPushStep={pushStep}
                onPopToRoot={popToRootStep}
                onBusyChange={setPanelBusy}
                onRegisterBack={registerPanelBack}
                bottomInset={scrollBottomInset}
              />
            )}

            {activeSubPanel === 'reset' && (
              <ResetPanel onDone={handleResetDone} onBusyChange={setPanelBusy} />
            )}

            {activeSubPanel === 'import' && (
              <ImportPanel
                step={importStep}
                onPushStep={pushStep}
                onPopToRoot={popToRootStep}
                onBusyChange={setPanelBusy}
                onRegisterBack={registerPanelBack}
                onRegisterRefresh={registerPanelRefresh}
                onDone={closeSubPanel}
                onSetUpSheetsExport={handleSetupSheetsExport}
                bottomInset={scrollBottomInset}
              />
            )}

            {activeSubPanel === 'logs' && (
              <LogsPanel bottomInset={scrollBottomInset} />
            )}

            {activeSubPanel === 'update' && (
              <UpdatePanel
                onRegisterTitle={registerPanelTitle}
                onDone={closeSubPanel}
                bottomInset={scrollBottomInset}
              />
            )}

            {activeSubPanel === 'notificationProcessing' && (
              <NotificationPanel
                step={notificationView}
                parentStep={panelStack.parentStep}
                onPushStep={pushStep}
                onPopStep={popStep}
                onReplaceStep={replaceStep}
                onRegisterBack={registerPanelBack}
                bottomInset={scrollBottomInset}
              />
            )}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  ) : null;

  // ─── Main settings list (base layer) + subpanel overlay ───
  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
      onLayout={handleContainerLayout}
    >
      <SettingsList onOpenPanel={openSubPanel} />
      {subPanelOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  container: {
    flex: 1,
  },
  subPanelBody: {
    flex: 1,
  },
  subPanelBodyFlush: {
    paddingBottom: 0,
  },
  subPanelFill: {
    // Fills the absolutely-positioned overlay above. Carries the swipe transform
    // and the opaque background so a rightward swipe slides this layer off to
    // reveal the (transparent overlay →) settings list behind it.
    flex: 1,
  },
  subPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingVertical: SPACING.lg,
  },
  subPanelOverlay: {
    // Plain, transparent positioning + stacking layer covering the settings list
    // while a subpanel is open. Anchored top-left and sized in explicit pixels
    // (from the measured container) rather than `absoluteFillObject`'s top+bottom
    // inset stretch, which collapses to zero size under Reanimated 4 / RN 0.85's
    // Yoga — that left the panel invisible / seemingly not opening. Both elevation
    // and zIndex lift it above the base ScrollView: under the New Architecture
    // (Fabric) Android stacking follows the CSS model, where paint order among
    // positioned siblings is governed by zIndex while elevation only drives the
    // native shadow.
    elevation: 8,
    left: 0,
    position: 'absolute',
    top: 0,
    zIndex: 10,
  },
  subPanelTitle: {
    fontWeight: '600',
  },
});

SettingsScreen.propTypes = {
  setSubPanelActive: PropTypes.func.isRequired,
};
