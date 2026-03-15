import type { ThemeFamily, AppColorMode, ThemeId } from "./themeTypes";
import { themeIdToFamily, themeIdToMode } from "./themeTypes";

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  muted: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  destructive: string;
  success: string;
  warning: string;
  error: string;
  border: string;
  ring: string;
  accent: string;
  headerBg: string;
  pressedPrimary: string;
  dimmed: string;
  white: string;
  black: string;
  lightForeground: string;
  errorBg: string;
  errorLight: string;
  errorBright: string;
  warningLight: string;
  neutral: string;
  toolClaude: string;
  toolCodex: string;
  toolGemini: string;
  timeout: string;
}

// ---------------------------------------------------------------------------
// Default (green) palette
// ---------------------------------------------------------------------------

const defaultLight: ThemeColors = {
  background: "#FFFFFF",
  foreground: "#1A1A1A",
  card: "#F5F5F5",
  muted: "#F0F0F0",
  mutedForeground: "#8E8E93",
  primary: "#1A1A1A",
  primaryForeground: "#FFFFFF",
  destructive: "#E74C3C",
  success: "#34C759",
  warning: "#F5A623",
  error: "#E74C3C",
  border: "#E5E5EA",
  ring: "#2EAD56",
  accent: "#2EAD56",
  headerBg: "#FFFFFF",
  pressedPrimary: "#3A3A3C",
  dimmed: "#AEAEB2",
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#1A1A1A",
  errorBg: "#FEF2F2",
  errorLight: "#fca5a5",
  errorBright: "#f87171",
  warningLight: "#F5A623",
  neutral: "#8E8E93",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ea580c",
};

const defaultDark: ThemeColors = {
  background: "#1E1E1E",
  foreground: "#F5F5F7",
  card: "#2C2C2E",
  muted: "#3A3A3C",
  mutedForeground: "#8E8E93",
  primary: "#F5F5F7",
  primaryForeground: "#1E1E1E",
  destructive: "#FF6E5F",
  success: "#45D08C",
  warning: "#F4C86E",
  error: "#FF6E5F",
  border: "#3A3A3C",
  ring: "#2EAD56",
  accent: "#2EAD56",
  headerBg: "#1E1E1E",
  pressedPrimary: "#636366",
  dimmed: "#636366",
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#F5F5F7",
  errorBg: "#3C2824",
  errorLight: "#fca5a5",
  errorBright: "#f87171",
  warningLight: "#F4C86E",
  neutral: "#8E8E93",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ea580c",
};

// ---------------------------------------------------------------------------
// Claude (terracotta) palette — matches the existing theme
// ---------------------------------------------------------------------------

const claudeLight: ThemeColors = {
  background: "#FAF7F2",
  foreground: "#1A1A1A",
  card: "#FFFFFF",
  muted: "#F0EDE8",
  mutedForeground: "#8E8E93",
  primary: "#1A1A1A",
  primaryForeground: "#FFFFFF",
  destructive: "#E74C3C",
  success: "#34C759",
  warning: "#F5A623",
  error: "#E74C3C",
  border: "#E5E2DD",
  ring: "#C4704B",
  accent: "#C4704B",
  headerBg: "#FAF7F2",
  pressedPrimary: "#3A3A3C",
  dimmed: "#AEAEB2",
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#1A1A1A",
  errorBg: "#FEF2F2",
  errorLight: "#fca5a5",
  errorBright: "#f87171",
  warningLight: "#F5A623",
  neutral: "#8E8E93",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ea580c",
};

const claudeDark: ThemeColors = {
  background: "#171614",
  foreground: "#F2EEE8",
  card: "#23211F",
  muted: "#2E2B28",
  mutedForeground: "#AAA59C",
  primary: "#F2EEE8",
  primaryForeground: "#171614",
  destructive: "#FF6E5F",
  success: "#45D08C",
  warning: "#F4C86E",
  error: "#FF6E5F",
  border: "#4A4640",
  ring: "#D4836B",
  accent: "#D4836B",
  headerBg: "#171614",
  pressedPrimary: "#636366",
  dimmed: "#6D6860",
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#F2EEE8",
  errorBg: "#3C2824",
  errorLight: "#fca5a5",
  errorBright: "#f87171",
  warningLight: "#F4C86E",
  neutral: "#AAA59C",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ea580c",
};

// ---------------------------------------------------------------------------
// Codex (monochrome) palette
// ---------------------------------------------------------------------------

const codexLight: ThemeColors = {
  background: "#FFFFFF",
  foreground: "#000000",
  card: "#F7F7F7",
  muted: "#EFEFEF",
  mutedForeground: "#6B6B6B",
  primary: "#000000",
  primaryForeground: "#FFFFFF",
  destructive: "#E74C3C",
  success: "#34C759",
  warning: "#F5A623",
  error: "#E74C3C",
  border: "#E0E0E0",
  ring: "#000000",
  accent: "#000000",
  headerBg: "#FFFFFF",
  pressedPrimary: "#3A3A3C",
  dimmed: "#AEAEB2",
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#000000",
  errorBg: "#FEF2F2",
  errorLight: "#fca5a5",
  errorBright: "#f87171",
  warningLight: "#F5A623",
  neutral: "#6B6B6B",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ea580c",
};

const codexDark: ThemeColors = {
  background: "#1E1E1E",
  foreground: "#FFFFFF",
  card: "#2A2A2A",
  muted: "#333333",
  mutedForeground: "#999999",
  primary: "#FFFFFF",
  primaryForeground: "#1E1E1E",
  destructive: "#FF6E5F",
  success: "#45D08C",
  warning: "#F4C86E",
  error: "#FF6E5F",
  border: "#444444",
  ring: "#FFFFFF",
  accent: "#FFFFFF",
  headerBg: "#1E1E1E",
  pressedPrimary: "#636366",
  dimmed: "#666666",
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#FFFFFF",
  errorBg: "#3C2824",
  errorLight: "#fca5a5",
  errorBright: "#f87171",
  warningLight: "#F4C86E",
  neutral: "#999999",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ea580c",
};

// ---------------------------------------------------------------------------
// Catppuccin — Latte (light) / Mocha (dark)
// https://catppuccin.com/palette/
// ---------------------------------------------------------------------------

const catppuccinLight: ThemeColors = {
  background: "#eff1f5",    // Latte Base
  foreground: "#4c4f69",    // Latte Text
  card: "#e6e9ef",          // Latte Mantle
  muted: "#ccd0da",         // Latte Surface 0
  mutedForeground: "#6c6f85", // Latte Subtext 0
  primary: "#4c4f69",       // Latte Text
  primaryForeground: "#eff1f5", // Latte Base
  destructive: "#d20f39",   // Latte Red
  success: "#40a02b",       // Latte Green
  warning: "#df8e1d",       // Latte Yellow
  error: "#d20f39",         // Latte Red
  border: "#bcc0cc",        // Latte Surface 1
  ring: "#8839ef",          // Latte Mauve
  accent: "#8839ef",        // Latte Mauve
  headerBg: "#eff1f5",      // Latte Base
  pressedPrimary: "#5c5f77", // Latte Subtext 1
  dimmed: "#9ca0b0",        // Latte Overlay 0
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#4c4f69",
  errorBg: "#f5e0dc",       // Latte Rosewater
  errorLight: "#dd7878",    // Latte Flamingo
  errorBright: "#d20f39",   // Latte Red
  warningLight: "#df8e1d",  // Latte Yellow
  neutral: "#8c8fa1",       // Latte Overlay 1
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#fe640b",       // Latte Peach
};

const catppuccinDark: ThemeColors = {
  background: "#1e1e2e",    // Mocha Base
  foreground: "#cdd6f4",    // Mocha Text
  card: "#181825",          // Mocha Mantle
  muted: "#313244",         // Mocha Surface 0
  mutedForeground: "#a6adc8", // Mocha Subtext 0
  primary: "#cdd6f4",       // Mocha Text
  primaryForeground: "#1e1e2e", // Mocha Base
  destructive: "#f38ba8",   // Mocha Red
  success: "#a6e3a1",       // Mocha Green
  warning: "#f9e2af",       // Mocha Yellow
  error: "#f38ba8",         // Mocha Red
  border: "#45475a",        // Mocha Surface 1
  ring: "#cba6f7",          // Mocha Mauve
  accent: "#cba6f7",        // Mocha Mauve
  headerBg: "#1e1e2e",      // Mocha Base
  pressedPrimary: "#585b70", // Mocha Surface 2
  dimmed: "#6c7086",        // Mocha Overlay 0
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#cdd6f4",
  errorBg: "#31222c",
  errorLight: "#eba0ac",    // Mocha Maroon
  errorBright: "#f38ba8",   // Mocha Red
  warningLight: "#f9e2af",  // Mocha Yellow
  neutral: "#7f849c",       // Mocha Overlay 1
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#fab387",       // Mocha Peach
};

// ---------------------------------------------------------------------------
// Dracula — https://draculatheme.com
// Light variant inspired by Dracula's palette with inverted luminance
// ---------------------------------------------------------------------------

const draculaLight: ThemeColors = {
  background: "#F8F8F2",    // Dracula Foreground as bg
  foreground: "#282a36",    // Dracula Background as fg
  card: "#EEEEE8",
  muted: "#E4E4DE",
  mutedForeground: "#6272a4", // Dracula Comment
  primary: "#282a36",
  primaryForeground: "#F8F8F2",
  destructive: "#ff5555",   // Dracula Red
  success: "#50fa7b",       // Dracula Green
  warning: "#f1fa8c",       // Dracula Yellow
  error: "#ff5555",
  border: "#D4D4CE",
  ring: "#bd93f9",          // Dracula Purple
  accent: "#bd93f9",        // Dracula Purple
  headerBg: "#F8F8F2",
  pressedPrimary: "#44475a",
  dimmed: "#6272a4",        // Dracula Comment
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#282a36",
  errorBg: "#FFE5E5",
  errorLight: "#ff7979",
  errorBright: "#ff5555",
  warningLight: "#f1fa8c",
  neutral: "#6272a4",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ffb86c",       // Dracula Orange
};

const draculaDark: ThemeColors = {
  background: "#282a36",    // Dracula Background
  foreground: "#f8f8f2",    // Dracula Foreground
  card: "#21222c",
  muted: "#44475a",         // Dracula Current Line
  mutedForeground: "#6272a4", // Dracula Comment
  primary: "#f8f8f2",
  primaryForeground: "#282a36",
  destructive: "#ff5555",   // Dracula Red
  success: "#50fa7b",       // Dracula Green
  warning: "#f1fa8c",       // Dracula Yellow
  error: "#ff5555",
  border: "#44475a",        // Dracula Selection
  ring: "#bd93f9",          // Dracula Purple
  accent: "#bd93f9",        // Dracula Purple
  headerBg: "#282a36",
  pressedPrimary: "#6272a4",
  dimmed: "#6272a4",        // Dracula Comment
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#f8f8f2",
  errorBg: "#3C2228",
  errorLight: "#ff7979",
  errorBright: "#ff5555",
  warningLight: "#f1fa8c",
  neutral: "#6272a4",
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ffb86c",       // Dracula Orange
};

// ---------------------------------------------------------------------------
// Tokyo Night — Night (dark) / Day (light)
// https://github.com/folke/tokyonight.nvim
// ---------------------------------------------------------------------------

const tokyonightLight: ThemeColors = {
  background: "#e1e2e7",    // Day bg
  foreground: "#3760bf",    // Day fg
  card: "#d0d5e3",          // Day bg_dark
  muted: "#c4c8da",         // Day bg_highlight
  mutedForeground: "#848cb5", // Day comment
  primary: "#3760bf",
  primaryForeground: "#e1e2e7",
  destructive: "#c64343",   // Day error
  success: "#587539",       // Day green
  warning: "#8c6c3e",       // Day yellow
  error: "#c64343",
  border: "#b4b5b9",        // Day border
  ring: "#2e7de9",          // Day blue
  accent: "#2e7de9",        // Day blue
  headerBg: "#e1e2e7",
  pressedPrimary: "#6172b0", // Day fg_dark
  dimmed: "#a8aecb",        // Day fg_gutter
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#3760bf",
  errorBg: "#f5dce0",
  errorLight: "#f52a65",    // Day red
  errorBright: "#c64343",
  warningLight: "#b15c00",  // Day orange
  neutral: "#8990b3",       // Day dark3
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#b15c00",       // Day orange
};

const tokyonightDark: ThemeColors = {
  background: "#1a1b26",    // Night bg
  foreground: "#c0caf5",    // Night fg
  card: "#16161e",          // Night bg_dark
  muted: "#292e42",         // Night bg_highlight
  mutedForeground: "#565f89", // Night comment
  primary: "#c0caf5",
  primaryForeground: "#1a1b26",
  destructive: "#f7768e",   // Night red
  success: "#9ece6a",       // Night green
  warning: "#e0af68",       // Night yellow
  error: "#db4b4b",         // Night error
  border: "#3b4261",        // Night fg_gutter
  ring: "#7aa2f7",          // Night blue
  accent: "#7aa2f7",        // Night blue
  headerBg: "#1a1b26",
  pressedPrimary: "#545c7e", // Night dark3
  dimmed: "#565f89",        // Night comment
  white: "#FFFFFF",
  black: "#000000",
  lightForeground: "#c0caf5",
  errorBg: "#2d2030",
  errorLight: "#f7768e",
  errorBright: "#db4b4b",
  warningLight: "#ff9e64",  // Night orange
  neutral: "#737aa2",       // Night dark5
  toolClaude: "#C4704B",
  toolCodex: "#10A37F",
  toolGemini: "#4285F4",
  timeout: "#ff9e64",       // Night orange
};

// ---------------------------------------------------------------------------
// Palette lookup
// ---------------------------------------------------------------------------

const palettes: Record<ThemeFamily, Record<AppColorMode, ThemeColors>> = {
  default: { light: defaultLight, dark: defaultDark },
  claude: { light: claudeLight, dark: claudeDark },
  codex: { light: codexLight, dark: codexDark },
  catppuccin: { light: catppuccinLight, dark: catppuccinDark },
  dracula: { light: draculaLight, dark: draculaDark },
  tokyonight: { light: tokyonightLight, dark: tokyonightDark },
};

export function getPalette(family: ThemeFamily, mode: AppColorMode): ThemeColors {
  return palettes[family][mode];
}

export function getThemePalette(themeId: ThemeId): ThemeColors {
  return getPalette(themeIdToFamily(themeId), themeIdToMode(themeId));
}

// ---------------------------------------------------------------------------
// Theme metadata for picker UI (12 flat themes)
// ---------------------------------------------------------------------------

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  previewAccent: string;
  previewBg: string;
  isDark: boolean;
}

export const THEME_META: ThemeMeta[] = [
  { id: "default-light", label: "Emerald Light", previewAccent: "#2EAD56", previewBg: "#FFFFFF", isDark: false },
  { id: "default-dark", label: "Emerald Dark", previewAccent: "#2EAD56", previewBg: "#1E1E1E", isDark: true },
  { id: "claude-light", label: "Terracotta Light", previewAccent: "#C4704B", previewBg: "#FAF7F2", isDark: false },
  { id: "claude-dark", label: "Terracotta Dark", previewAccent: "#D4836B", previewBg: "#171614", isDark: true },
  { id: "codex-light", label: "Mono Light", previewAccent: "#000000", previewBg: "#FFFFFF", isDark: false },
  { id: "codex-dark", label: "Mono Dark", previewAccent: "#FFFFFF", previewBg: "#1E1E1E", isDark: true },
  { id: "catppuccin-light", label: "Catppuccin Latte", previewAccent: "#8839ef", previewBg: "#eff1f5", isDark: false },
  { id: "catppuccin-dark", label: "Catppuccin Mocha", previewAccent: "#cba6f7", previewBg: "#1e1e2e", isDark: true },
  { id: "dracula-light", label: "Dracula Light", previewAccent: "#bd93f9", previewBg: "#F8F8F2", isDark: false },
  { id: "dracula-dark", label: "Dracula", previewAccent: "#bd93f9", previewBg: "#282a36", isDark: true },
  { id: "tokyonight-light", label: "Tokyo Night Day", previewAccent: "#2e7de9", previewBg: "#e1e2e7", isDark: false },
  { id: "tokyonight-dark", label: "Tokyo Night", previewAccent: "#7aa2f7", previewBg: "#1a1b26", isDark: true },
];

// ---------------------------------------------------------------------------
// Alternate icon name for a given ThemeId
// New themes (catppuccin, dracula, tokyonight) use default icons.
// ---------------------------------------------------------------------------

const FAMILY_LABEL: Record<ThemeFamily, string> = {
  default: "Default",
  claude: "Claude",
  codex: "Codex",
  catppuccin: "Default",
  dracula: "Default",
  tokyonight: "Default",
};

export function getAlternateIconName(themeId: ThemeId): string {
  const family = themeIdToFamily(themeId);
  const mode = themeIdToMode(themeId);
  return `${FAMILY_LABEL[family]}${mode === "dark" ? "Dark" : "Light"}`;
}
