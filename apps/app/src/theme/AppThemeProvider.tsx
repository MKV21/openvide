import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, use, useCallback, useEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { useColorScheme } from "nativewind";
import { vars } from "react-native-css-interop";
import { setAlternateAppIcon, getAppIconName, supportsAlternateIcons } from "expo-alternate-app-icons";
import type { AppColorMode, ThemeFamily, ThemeId } from "./themeTypes";
import { ALL_THEME_IDS, themeIdToFamily, themeIdToMode, toThemeId } from "./themeTypes";
import { resolveThemeCssVariables } from "./colorTokens";
import { setCurrentThemeId } from "./themeRuntime";
import { getAlternateIconName } from "./palettes";

const OLD_STORAGE_KEY = "open-vide/theme-preference";
const STORAGE_KEY = "open-vide/theme-preferences";

interface AppThemeContextValue {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  resolvedMode: AppColorMode;
  themeFamily: ThemeFamily;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function persistThemeId(id: ThemeId): void {
  AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
}

function switchAppIcon(themeId: ThemeId): void {
  if (!supportsAlternateIcons) return;
  const desiredIcon = getAlternateIconName(themeId);
  const currentIcon = getAppIconName();
  if (currentIcon === desiredIcon) return;
  setAlternateAppIcon(desiredIcon as any).catch(() => {});
}

export function AppThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const { setColorScheme } = useColorScheme();
  const [themeId, setThemeIdState] = useState<ThemeId>("default-dark");

  // Load persisted theme on mount (with migration from old formats)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;

        if (raw) {
          // Case 1: New format — bare ThemeId string
          if ((ALL_THEME_IDS as string[]).includes(raw)) {
            applyTheme(raw as ThemeId);
            return;
          }
          // Case 2: Old JSON format { family, mode }
          try {
            const parsed = JSON.parse(raw);
            if (parsed.family && parsed.mode) {
              const family = isThemeFamily(parsed.family) ? parsed.family : "default";
              const mode = parsed.mode === "light" || parsed.mode === "dark"
                ? parsed.mode
                : (Appearance.getColorScheme() === "dark" ? "dark" : "light");
              const id = toThemeId(family, mode);
              applyTheme(id);
              persistThemeId(id); // upgrade storage format
              return;
            }
          } catch { /* not JSON */ }
        }

        // Case 3: Ancient single-string key
        const oldRaw = await AsyncStorage.getItem(OLD_STORAGE_KEY);
        if (cancelled) return;
        if (oldRaw) {
          const mode = oldRaw === "light" || oldRaw === "dark"
            ? oldRaw
            : (Appearance.getColorScheme() === "dark" ? "dark" : "light");
          const id = toThemeId("claude", mode as AppColorMode);
          applyTheme(id);
          persistThemeId(id);
          AsyncStorage.removeItem(OLD_STORAGE_KEY).catch(() => {});
          return;
        }

        // Fresh install
        applyTheme("default-dark");
      } catch {
        if (!cancelled) applyTheme("default-dark");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTheme(id: ThemeId): void {
    setThemeIdState(id);
    setCurrentThemeId(id);
    try { setColorScheme(themeIdToMode(id)); } catch {}
  }

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    setCurrentThemeId(id);
    try { setColorScheme(themeIdToMode(id)); } catch {}
    switchAppIcon(id);
    persistThemeId(id);
  }, [setColorScheme]);

  const resolvedMode = themeIdToMode(themeId);
  const themeFamily = themeIdToFamily(themeId);

  const variableStyle = useMemo(
    () => vars(resolveThemeCssVariables(themeFamily, resolvedMode)),
    [themeFamily, resolvedMode],
  );

  const value = useMemo<AppThemeContextValue>(() => ({
    themeId,
    setThemeId,
    resolvedMode,
    themeFamily,
  }), [themeId, setThemeId, resolvedMode, themeFamily]);

  return (
    <AppThemeContext value={value}>
      <View className={resolvedMode === "dark" ? "flex-1 dark" : "flex-1"} style={variableStyle}>
        {children}
      </View>
    </AppThemeContext>
  );
}

export function useAppTheme(): AppThemeContextValue {
  const value = use(AppThemeContext);
  if (!value) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }
  return value;
}

function isThemeFamily(value: string): value is ThemeFamily {
  return value === "default" || value === "claude" || value === "codex";
}
