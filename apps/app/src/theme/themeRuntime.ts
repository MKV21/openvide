import type { AppColorMode, ThemeFamily, ThemeId } from "./themeTypes";
import { themeIdToFamily, themeIdToMode } from "./themeTypes";

let currentThemeId: ThemeId = "default-dark";

export function setCurrentThemeId(id: ThemeId): void {
  currentThemeId = id;
}

export function getCurrentThemeId(): ThemeId {
  return currentThemeId;
}

/** Derived — used by the `colors` Proxy in constants/colors.ts */
export function getResolvedThemeMode(): AppColorMode {
  return themeIdToMode(currentThemeId);
}

/** Derived — used by the `colors` Proxy in constants/colors.ts */
export function getThemeFamily(): ThemeFamily {
  return themeIdToFamily(currentThemeId);
}
