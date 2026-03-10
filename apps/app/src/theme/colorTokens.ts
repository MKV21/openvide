import type { ThemeFamily, AppColorMode, ThemeId } from "./themeTypes";
import { themeIdToFamily, themeIdToMode } from "./themeTypes";
import { getPalette, type ThemeColors } from "./palettes";

// Re-export types so existing imports still work
export type { AppColorMode } from "./themeTypes";

export function resolveThemeColors(family: ThemeFamily, mode: AppColorMode): ThemeColors {
  return getPalette(family, mode);
}

export function resolveThemeColorsById(themeId: ThemeId): ThemeColors {
  return resolveThemeColors(themeIdToFamily(themeId), themeIdToMode(themeId));
}

export function resolveThemeCssVariables(family: ThemeFamily, mode: AppColorMode): Record<`--${string}`, string> {
  const colors = resolveThemeColors(family, mode);
  return {
    "--background": colors.background,
    "--foreground": colors.foreground,
    "--card": colors.card,
    "--muted": colors.muted,
    "--muted-foreground": colors.mutedForeground,
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--accent": colors.accent,
    "--destructive": colors.destructive,
    "--success": colors.success,
    "--warning": colors.warning,
    "--error": colors.error,
    "--error-bg": colors.errorBg,
    "--info": colors.accent,
    "--border": colors.border,
    "--ring": colors.ring,
    "--dimmed": colors.dimmed,
  };
}

export function resolveThemeCssVariablesById(themeId: ThemeId): Record<`--${string}`, string> {
  return resolveThemeCssVariables(themeIdToFamily(themeId), themeIdToMode(themeId));
}
