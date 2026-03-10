export type ThemeFamily = "default" | "claude" | "codex";
export type AppColorMode = "light" | "dark";

export type ThemeId =
  | "default-light"
  | "default-dark"
  | "claude-light"
  | "claude-dark"
  | "codex-light"
  | "codex-dark";

export const ALL_THEME_IDS: ThemeId[] = [
  "default-light",
  "default-dark",
  "claude-light",
  "claude-dark",
  "codex-light",
  "codex-dark",
];

export function themeIdToFamily(id: ThemeId): ThemeFamily {
  return id.split("-")[0] as ThemeFamily;
}

export function themeIdToMode(id: ThemeId): AppColorMode {
  return id.split("-")[1] as AppColorMode;
}

export function toThemeId(family: ThemeFamily, mode: AppColorMode): ThemeId {
  return `${family}-${mode}` as ThemeId;
}
