export type ThemeFamily = "default" | "claude" | "codex" | "catppuccin" | "dracula" | "tokyonight";
export type AppColorMode = "light" | "dark";

export type ThemeId =
  | "default-light"
  | "default-dark"
  | "claude-light"
  | "claude-dark"
  | "codex-light"
  | "codex-dark"
  | "catppuccin-light"
  | "catppuccin-dark"
  | "dracula-light"
  | "dracula-dark"
  | "tokyonight-light"
  | "tokyonight-dark";

export const ALL_THEME_IDS: ThemeId[] = [
  "default-light",
  "default-dark",
  "claude-light",
  "claude-dark",
  "codex-light",
  "codex-dark",
  "catppuccin-light",
  "catppuccin-dark",
  "dracula-light",
  "dracula-dark",
  "tokyonight-light",
  "tokyonight-dark",
];

export function themeIdToFamily(id: ThemeId): ThemeFamily {
  const parts = id.split("-");
  return parts.slice(0, -1).join("-") as ThemeFamily;
}

export function themeIdToMode(id: ThemeId): AppColorMode {
  const parts = id.split("-");
  return parts[parts.length - 1] as AppColorMode;
}

export function toThemeId(family: ThemeFamily, mode: AppColorMode): ThemeId {
  return `${family}-${mode}` as ThemeId;
}
