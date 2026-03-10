import { useAppTheme } from "../theme/AppThemeProvider";
import { resolveThemeColors } from "../theme/colorTokens";
import { getResolvedThemeMode, getThemeFamily } from "../theme/themeRuntime";
import type { ThemeColors } from "../theme/palettes";

/** Backward-compatible color object for non-hook contexts. */
export const colors = new Proxy({} as ThemeColors, {
  get(_target, prop) {
    if (typeof prop !== "string") return undefined;
    const resolved = resolveThemeColors(getThemeFamily(), getResolvedThemeMode());
    return resolved[prop as keyof ThemeColors];
  },
}) as ThemeColors;

/** Hook that returns theme-aware colors + scheme controls */
export function useThemeColors() {
  const { themeId, setThemeId, resolvedMode, themeFamily } = useAppTheme();

  return {
    ...resolveThemeColors(themeFamily, resolvedMode),
    themeId,
    setThemeId,
    resolvedColorScheme: resolvedMode,
    themeFamily,
  };
}
