import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import PropTypes from 'prop-types';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useAccountsData } from '../../contexts/AccountsDataContext';
import { useCategories } from '../../contexts/CategoriesContext';
import { useOperationsData } from '../../contexts/OperationsDataContext';
import { useThemeConfig } from '../../contexts/ThemeConfigContext';
import { BORDER_RADIUS, COLD_START, FONT_SIZE, SPACING, Z_INDEX } from '../../styles/designTokens';
import { BRAND } from '../../styles/semanticColors';
import PennyMark from './PennyMark';
import { ARM_RAISED, ARM_REST, WAVE_BACK, WAVE_OUT } from './pennyArm';

const T = COLD_START;

// Geometry, in dp. These are one-off to this screen and only mean anything
// together, so they live here rather than in the token scale.
//
// MARK_SIZE must stay equal to `imageWidth` in the expo-splash-screen plugin
// config (app.config.js): the whole point of the screen is that the mark does
// not move or resize when the native splash hands over.
export const MARK_SIZE = 200;
const COIN_WIDTH = 120;
const COIN_HEIGHT = 28;
const COIN_STEP = 24;   // stacked coins overlap by 4 dp
const STACK_HEIGHT = COIN_STEP * 2 + COIN_HEIGHT;
const STACK_GAP = 64;   // between the mark's lower edge and the stack
const COIN_RISE = 52;   // how far above its resting place a coin starts

// STACK_GAP is larger than COIN_RISE, so a coin's whole fall happens below the
// mark: the two never overlap in any frame.

// A wave is a rock back and forth, so it wants an easing that is slow at both
// ends of every swing; the raise is a single gesture and gets a little overshoot.
const SWING_EASING = Easing.inOut(Easing.sin);
const RAISE_EASING = Easing.out(Easing.back(1.4));

/**
 * Whether the cold-start sequence has already run in this launch.
 *
 * Deliberately module scope rather than component state or a ref: the sequence
 * belongs to the process, not to a mounted component. Returning from the
 * background, switching tabs and re-mounting a screen must all leave it alone,
 * and module scope lives for exactly as long as the JS runtime does.
 */
let played = false;

export const hasColdStartPlayed = () => played;

/**
 * What to do with the coins when the data lands while they are still falling.
 *
 * Pure, and separated from the component on purpose: it is the subtle part of
 * the screen, and this way it can be checked against real numbers rather than
 * through mocked animations.
 *
 * The arm is not in here. It has no state to resolve — wherever the wave has
 * got to, it is animated back to rest, and that ride happens underneath the
 * cross-fade rather than delaying it. A coin is different: it is mid-fall with
 * nothing beneath it, and cutting to a fade would drop it out of the air.
 *
 * @param {Array<{opacity: number, y: number}>} coins  each coin's live state
 * @returns {{hidden: boolean[], tail: number}}
 *   `hidden[i]` marks a coin that never appeared and so never should, and
 *   `tail` is how long the fall still needs before the cross-fade.
 */
export const planWindDown = (coins) => {
  let tail = 0;

  // A coin that has not appeared never appears; one already in the air is left
  // alone to land, and the screen waits for it.
  const hidden = coins.map((coin) => {
    if (coin.opacity === 0) return true;
    if (coin.y < 0) {
      const remaining = (Math.min(-coin.y, COIN_RISE) / COIN_RISE) * T.coinFall;
      tail = Math.max(tail, remaining + T.coinSquash * 2);
    }
    return false;
  });

  return { hidden, tail };
};

const useCoin = () => {
  const y = useSharedValue(-COIN_RISE);
  const opacity = useSharedValue(0);
  const squash = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }, { scaleY: squash.value }],
  }));
  return { y, opacity, squash, style };
};

/**
 * The screen shown while the first database reads of a launch are in flight.
 *
 * It continues the native splash rather than replacing it — same mark, same
 * size, same position, same background — has Penny raise her arm and wave,
 * drops three coins into a stack beneath her, then cross-fades into the app.
 *
 * The whole sequence is handed to the UI thread as one set of delayed
 * animations at mount. That is the point of the screen: the JS thread is busy
 * reading the database, so nothing about the motion may depend on it. Only the
 * wind-down runs on JS timers, and by then the reads have finished.
 */
const ColdStartScreen = ({ onFinish }) => {
  const { t, isLoading: languageLoading } = useLocalization() || {};
  const { loading: accountsLoading } = useAccountsData() || {};
  const { loading: categoriesLoading } = useCategories() || {};
  const { loading: operationsLoading } = useOperationsData() || {};
  const { colorScheme, isThemeLoaded } = useThemeConfig() || {};

  const ready = !languageLoading && !accountsLoading && !categoriesLoading && !operationsLoading;

  const armRaise = useSharedValue(ARM_REST);
  const armWave = useSharedValue(ARM_REST);
  const overlayOpacity = useSharedValue(1);
  const captionOpacity = useSharedValue(0);

  // Bottom coin first: it lands first and is drawn last, so it sits in front.
  const coinTop = useCoin();
  const coinMiddle = useCoin();
  const coinBottom = useCoin();
  const coins = useRef([coinBottom, coinMiddle, coinTop]).current;

  const finishing = useRef(false);  // the data has landed; we are winding down
  const done = useRef(false);       // the cross-fade has begun
  const dissolveTimer = useRef(null);
  // Once the surface starts fading the app is visible through it, so taps
  // belong to the app — even if the unmount that follows is late.
  const [dissolving, setDissolving] = useState(false);

  // Reanimated reads the OS setting at startup and hands it back synchronously,
  // so the very first frame already knows which path it is on.
  const reduced = useReducedMotion();

  const onFinishRef = useRef(onFinish);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  // The brand surface and a light app differ more than the brand surface and a
  // dark one, so the same cross-fade would read as a flash on the light theme.
  // Until the stored theme has been read, `colorScheme` is only the OS scheme —
  // so the longer, always-safe fade is used rather than a guess.
  const dissolveMs = isThemeLoaded && colorScheme === 'dark' ? T.dissolve : T.dissolveToLight;

  const startDissolve = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setDissolving(true);
    overlayOpacity.value = withTiming(0, { duration: dissolveMs, easing: Easing.out(Easing.quad) });
    dissolveTimer.current = setTimeout(() => { onFinishRef.current?.(); }, dissolveMs);
  }, [dissolveMs, overlayOpacity]);

  const settleCoin = useCallback((coin) => {
    coin.opacity.value = 1;
    coin.y.value = 0;
    coin.squash.value = 1;
  }, []);

  const stopCoin = useCallback((coin) => {
    cancelAnimation(coin.opacity);
    cancelAnimation(coin.y);
    cancelAnimation(coin.squash);
  }, []);

  // Hand the whole sequence to the UI thread. Runs once: it is tied to the
  // launch, not to a render.
  useEffect(() => {
    played = true;

    if (reduced) {
      // No wave and no fall; Penny and a full stack simply stand there.
      coins.forEach(settleCoin);
    } else {
      armRaise.value = withDelay(
        T.hold,
        withTiming(ARM_RAISED, { duration: T.armRaise, easing: RAISE_EASING }),
      );
      // The wave repeats for as long as the reads take. Nothing here knows how
      // long that is, and an animation that ran out would leave her standing
      // still in front of a screen that is plainly still working.
      armWave.value = withDelay(T.hold + T.armRaise, withRepeat(withSequence(
        withTiming(WAVE_OUT, { duration: T.armSwing, easing: SWING_EASING }),
        withTiming(WAVE_BACK, { duration: T.armSwing, easing: SWING_EASING }),
      ), -1, false));
      coins.forEach((coin, index) => {
        const at = T.firstCoin + index * T.coinStagger;
        coin.opacity.value = withDelay(at, withTiming(1, { duration: T.coinFadeIn }));
        coin.y.value = withDelay(at, withTiming(0, { duration: T.coinFall, easing: Easing.in(Easing.quad) }));
        coin.squash.value = withDelay(at + T.coinFall, withSequence(
          withTiming(0.8, { duration: T.coinSquash }),
          withTiming(1, { duration: T.coinSquash }),
        ));
      });
    }

    // The slow path needs words on both routes: reduced motion makes the wait
    // no shorter.
    captionOpacity.value = withDelay(
      T.captionThreshold,
      withTiming(1, { duration: T.captionFade }),
    );

    return () => {
      if (dissolveTimer.current) clearTimeout(dissolveTimer.current);
      cancelAnimation(armRaise);
      cancelAnimation(armWave);
      cancelAnimation(overlayOpacity);
      cancelAnimation(captionOpacity);
      coins.forEach(stopCoin);
    };
  }, []);

  // The data decides when this ends.
  useEffect(() => {
    if (!ready || finishing.current || done.current) return;
    finishing.current = true;

    // Nothing is worth saying any more.
    if (captionOpacity.value === 0) cancelAnimation(captionOpacity);

    if (reduced) {
      startDissolve();
      return;
    }

    const { hidden, tail } = planWindDown(
      coins.map((coin) => ({ opacity: coin.opacity.value, y: coin.y.value })),
    );

    // The arm comes down from wherever the wave had got to. Assigning over a
    // shared value replaces whatever it was running, the endless repeat
    // included, so there is nothing to cancel first.
    armRaise.value = withTiming(ARM_REST, { duration: T.armLower, easing: Easing.out(Easing.quad) });
    armWave.value = withTiming(ARM_REST, { duration: T.armLower, easing: Easing.out(Easing.quad) });

    hidden.forEach((isHidden, index) => {
      if (isHidden) stopCoin(coins[index]);
    });

    if (tail > 0) {
      dissolveTimer.current = setTimeout(startDissolve, tail);
    } else {
      startDissolve();
    }
  }, [ready, reduced, armRaise, armWave, captionOpacity, coins, startDissolve, stopCoin]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const captionStyle = useAnimatedStyle(() => ({ opacity: captionOpacity.value }));

  const caption = t ? t('loading_operations') : '';

  // Positioning lives on a plain View and the animated surface fills it with
  // flex: 1 — under Reanimated 4 / RN 0.85's Yoga an absolute-fill stretch
  // applied directly to an Animated.View can be dropped (see SettingsScreen).
  return (
    <View
      style={styles.host}
      testID="cold-start-screen"
      pointerEvents={dissolving ? 'none' : 'auto'}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={caption}
    >
      <Animated.View style={[styles.overlay, overlayStyle]}>
        {/* Centred by the overlay, and nothing else shares its flow, so the
            stack below cannot push her off the spot the native splash left
            her in. */}
        <PennyMark size={MARK_SIZE} raise={armRaise} wave={armWave} />
        <View style={styles.stackAnchor} pointerEvents="none">
          <View style={styles.stack}>
            <Animated.View style={[styles.coin, styles.coinTop, coinTop.style]} />
            <Animated.View style={[styles.coin, styles.coinMiddle, coinMiddle.style]} />
            <Animated.View style={[styles.coin, styles.coinBottom, coinBottom.style]} />
          </View>
        </View>
        <Animated.Text
          testID="cold-start-caption"
          style={[styles.caption, captionStyle]}
          numberOfLines={1}
        >
          {caption}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

ColdStartScreen.propTypes = {
  onFinish: PropTypes.func,
};

const styles = StyleSheet.create({
  caption: {
    color: BRAND.coin,
    fontSize: FONT_SIZE.md,
    marginTop: MARK_SIZE / 2 + STACK_GAP + STACK_HEIGHT + SPACING.xxl,
    position: 'absolute',
    textAlign: 'center',
    top: '50%',
  },
  coin: {
    backgroundColor: BRAND.coin,
    borderBottomColor: BRAND.coinEdge,
    borderBottomWidth: 2,
    borderRadius: BORDER_RADIUS.pill,
    height: COIN_HEIGHT,
    left: 0,
    position: 'absolute',
    width: COIN_WIDTH,
  },
  coinBottom: { bottom: 0 },
  coinMiddle: { bottom: COIN_STEP },
  coinTop: { bottom: COIN_STEP * 2 },
  host: {
    ...StyleSheet.absoluteFill,
    zIndex: Z_INDEX.overlay,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: BRAND.surface,
    flex: 1,
    justifyContent: 'center',
  },
  stack: {
    height: STACK_HEIGHT,
    width: COIN_WIDTH,
  },
  stackAnchor: {
    alignItems: 'center',
    left: 0,
    marginTop: MARK_SIZE / 2 + STACK_GAP,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
});

export default ColdStartScreen;
