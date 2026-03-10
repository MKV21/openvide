import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import LottieView from "lottie-react-native";
import { getCachedThemeFamily, getCachedIsDark } from "../theme/splashTheme";
import type { ThemeFamily } from "../theme/themeTypes";

// All animations must be statically require()'d so Metro can bundle them.
// 6 variants: 3 families × 2 modes (light/dark).
const splashAnimations = {
  "default-light": require("../../assets/splash-animations/default-light-splash.json"),
  "default-dark": require("../../assets/splash-animations/default-dark-splash.json"),
  "claude-light": require("../../assets/splash-animations/claude-light-splash.json"),
  "claude-dark": require("../../assets/splash-animations/claude-dark-splash.json"),
  "codex-light": require("../../assets/splash-animations/codex-light-splash.json"),
  "codex-dark": require("../../assets/splash-animations/codex-dark-splash.json"),
  // Variant fallbacks (used if family lookup fails)
  production: require("../../variants/production/splash-animation.json"),
  development: require("../../variants/development/splash-animation.json"),
};

SplashScreen.preventAutoHideAsync();

const SAFETY_TIMEOUT = 6000;
const MIN_DISPLAY_MS = 1800;
const FADE_OUT_MS = 300;
const BG_FADE_MS = 250;

function pickSplashAnimation(family: ThemeFamily, isDark: boolean) {
  const key = `${family}-${isDark ? "dark" : "light"}` as keyof typeof splashAnimations;
  return splashAnimations[key] ?? splashAnimations.production;
}

// Overlay = final visible bg after the dark layer fades out.
// Should match the theme's background color for a seamless transition.
function pickOverlayBg(family: ThemeFamily, isDark: boolean): string {
  if (family === "claude") return isDark ? "#171614" : "#FAF7F2";
  return isDark ? "#1E1E1E" : "#FFFFFF";
}

// Dark layer sits on top and fades to 0 in light mode.
// Matches the dark-mode bg so the native→animated splash handoff is seamless.
function pickDarkLayerBg(family: ThemeFamily): string {
  if (family === "claude") return "#171614";
  return "#1E1E1E";
}

interface Props {
  children: React.ReactNode;
}

export function AnimatedSplash({ children }: Props): JSX.Element {
  const [overlayReady, setOverlayReady] = useState(false);
  const [animationStarted, setAnimationStarted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const bgFadeAnim = useRef(new Animated.Value(1)).current;
  const startTime = useRef(0);
  const hasFinished = useRef(false);

  // Read cached theme family + mode (set by preloadThemeFamily before mount)
  const family = getCachedThemeFamily();
  const isDark = getCachedIsDark();
  const animation = pickSplashAnimation(family, isDark);
  const overlayBg = pickOverlayBg(family, isDark);
  const darkLayerBg = pickDarkLayerBg(family);

  const onOverlayLayout = useCallback(() => {
    if (overlayReady) return;
    setOverlayReady(true);
    SplashScreen.hideAsync().then(() => {
      startTime.current = Date.now();
      setAnimationStarted(true);
      Animated.timing(bgFadeAnim, {
        toValue: 0,
        duration: BG_FADE_MS,
        useNativeDriver: true,
      }).start();
    });
  }, [overlayReady, bgFadeAnim]);

  const fadeOut = useCallback(() => {
    if (hasFinished.current) return;
    hasFinished.current = true;
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => setHidden(true));
  }, [fadeAnim]);

  const onAnimationFinish = useCallback(() => {
    const elapsed = Date.now() - startTime.current;
    const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);
    setTimeout(fadeOut, remaining);
  }, [fadeOut]);

  useEffect(() => {
    if (!animationStarted) return;
    const timer = setTimeout(fadeOut, SAFETY_TIMEOUT);
    return () => clearTimeout(timer);
  }, [animationStarted, fadeOut]);

  return (
    <View style={styles.flex}>
      {children}
      {!hidden && (
        <Animated.View
          style={[styles.overlay, { opacity: fadeAnim, backgroundColor: overlayBg }]}
          onLayout={onOverlayLayout}
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, { backgroundColor: darkLayerBg, opacity: bgFadeAnim }]}
          />
          {animationStarted && (
            <LottieView
              source={animation}
              autoPlay
              loop={false}
              speed={2}
              onAnimationFinish={onAnimationFinish}
              style={styles.lottie}
              resizeMode="contain"
            />
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  lottie: {
    width: 290,
    height: 290,
  },
});
