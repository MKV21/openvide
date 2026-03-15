import AsyncStorage from "@react-native-async-storage/async-storage";
import { Appearance } from "react-native";
import type { ThemeFamily, ThemeId } from "./themeTypes";
import { ALL_THEME_IDS, themeIdToFamily, themeIdToMode, toThemeId } from "./themeTypes";

const STORAGE_KEY = "open-vide/theme-preferences";
const OLD_STORAGE_KEY = "open-vide/theme-preference";

let cachedThemeId: ThemeId = "catppuccin-dark";

/**
 * Read the persisted ThemeId from AsyncStorage before React mounts.
 * Must be called once at app startup (before AnimatedSplash renders).
 */
export async function preloadThemeFamily(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      // New format: bare ThemeId string (e.g. "claude-dark")
      if ((ALL_THEME_IDS as string[]).includes(raw)) {
        cachedThemeId = raw as ThemeId;
        return;
      }
      // Old JSON format: { family, mode }
      try {
        const parsed = JSON.parse(raw);
        if (parsed.family && parsed.mode) {
          const family = parsed.family as ThemeFamily;
          const mode = parsed.mode === "light" || parsed.mode === "dark"
            ? parsed.mode
            : (Appearance.getColorScheme() === "dark" ? "dark" : "light");
          cachedThemeId = toThemeId(family, mode as "light" | "dark");
          return;
        }
      } catch { /* not JSON, ignore */ }
      return;
    }
    // Migration: old single-string key → existing user defaults to claude family
    const oldRaw = await AsyncStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const mode = oldRaw === "light" || oldRaw === "dark"
        ? oldRaw
        : (Appearance.getColorScheme() === "dark" ? "dark" : "light");
      cachedThemeId = toThemeId("claude", mode as "light" | "dark");
      return;
    }
    cachedThemeId = "default-dark";
  } catch {
    cachedThemeId = "default-dark";
  }
}

export function getCachedThemeFamily(): ThemeFamily {
  return themeIdToFamily(cachedThemeId);
}

/** Returns the resolved dark/light mode from the cached ThemeId. */
export function getCachedIsDark(): boolean {
  return themeIdToMode(cachedThemeId) === "dark";
}

export function getCachedThemeId(): ThemeId {
  return cachedThemeId;
}
