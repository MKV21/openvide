import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, use, useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Appearance, View } from "react-native";
import { useColorScheme } from "nativewind";
import { vars } from "react-native-css-interop";
import { setAlternateAppIcon, getAppIconName, supportsAlternateIcons } from "expo-alternate-app-icons";
import type { AppColorMode, ThemeFamily, ThemeId } from "./themeTypes";
import { ALL_THEME_IDS, themeIdToFamily, themeIdToMode, toThemeId } from "./themeTypes";
import { resolveThemeCssVariables } from "./colorTokens";
import { setCurrentThemeId } from "./themeRuntime";
import { getAlternateIconName } from "./palettes";
import { getCachedThemeId } from "./splashTheme";

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

  // Initialize from the cache that preloadThemeFamily() already populated.
  // This avoids a flash-inducing re-render from "default-dark" → actual theme.
  const [themeId, setThemeIdState] = useState<ThemeId>(() => {
    const id = getCachedThemeId();
    setCurrentThemeId(id);
    return id;
  });

  // Sync NativeWind color scheme before first paint
  useLayoutEffect(() => {
    try { setColorScheme(themeIdToMode(themeId)); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist migrated storage formats (old JSON / ancient key → bare ThemeId)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && !(ALL_THEME_IDS as string[]).includes(raw)) {
          // Old format detected — persist as bare ThemeId
          persistThemeId(themeId);
        }
        // Clean up ancient key if present
        const oldRaw = await AsyncStorage.getItem(OLD_STORAGE_KEY);
        if (oldRaw) {
          persistThemeId(themeId);
          AsyncStorage.removeItem(OLD_STORAGE_KEY).catch(() => {});
        }
      } catch { /* ignore */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  return value === "default" || value === "claude" || value === "codex"
    || value === "catppuccin" || value === "dracula" || value === "tokyonight";
}
