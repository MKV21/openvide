import type { GlassScreen } from 'even-toolkit/glass-screen-router';
import { line } from 'even-toolkit/types';
import { compactHeader } from '../header';
import { buildScrollableList, slidingWindowStart } from 'even-toolkit/glass-display-builders';
import { kvLine } from 'even-toolkit/glass-format';
import type { OpenVideSnapshot, OpenVideActions } from '../types';
import { APP_VERSION } from '@/lib/app-meta';

const LANGUAGES = ['en', 'it', 'es', 'fr', 'de', 'pt', 'zh', 'ja'];
const VOICE_LANGS = ['en-US', 'it-IT', 'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'zh-CN', 'ja-JP'];
const POLL_VALUES = [1000, 2500, 5000, 10000];
const EDIT_MODE_BASE = 100;

type SettingsItem = { label: string; value: string; key: string; editable?: boolean };

function getSettingsItems(snap: OpenVideSnapshot): SettingsItem[] {
  const s = snap.settings;
  return [
    { label: 'Language', value: s.language.toUpperCase(), key: 'language', editable: true },
    { label: 'Voice', value: s.voiceLang, key: 'voiceLang', editable: true },
    { label: 'Tool Details', value: s.showToolDetails ? 'ON' : 'OFF', key: 'showToolDetails', editable: true },
    { label: 'Poll Interval', value: `${s.pollInterval / 1000}s`, key: 'pollInterval', editable: true },
    { label: 'Hidden Files', value: s.showHiddenFiles ? 'SHOW' : 'HIDE', key: 'showHiddenFiles', editable: true },
  ];
}

function isEditingValue(highlightedIndex: number): boolean {
  return highlightedIndex >= EDIT_MODE_BASE;
}

function decodeEditingRow(highlightedIndex: number): number {
  return Math.max(0, highlightedIndex - EDIT_MODE_BASE);
}

function encodeEditingRow(rowIndex: number): number {
  return EDIT_MODE_BASE + rowIndex;
}

function armImmediateValueScroll(): void {
  if (typeof window === 'undefined') return;
  (window as Window & { __evenAllowImmediateScrollOnce?: boolean }).__evenAllowImmediateScrollOnce = true;
}

/** Cycle a setting value in the requested direction. */
function cycleSettingValue(settings: any, key: string, direction: 'up' | 'down'): Record<string, any> {
  const s = { ...settings };
  const delta = direction === 'down' ? 1 : -1;
  switch (key) {
    case 'language': {
      const idx = LANGUAGES.indexOf(s.language);
      const next = ((idx >= 0 ? idx : 0) + delta + LANGUAGES.length) % LANGUAGES.length;
      s.language = LANGUAGES[next];
      break;
    }
    case 'voiceLang': {
      const idx = VOICE_LANGS.indexOf(s.voiceLang);
      const next = ((idx >= 0 ? idx : 0) + delta + VOICE_LANGS.length) % VOICE_LANGS.length;
      s.voiceLang = VOICE_LANGS[next];
      break;
    }
    case 'showToolDetails':
      s.showToolDetails = !s.showToolDetails;
      break;
    case 'pollInterval': {
      const idx = POLL_VALUES.indexOf(s.pollInterval);
      const next = ((idx >= 0 ? idx : 0) + delta + POLL_VALUES.length) % POLL_VALUES.length;
      s.pollInterval = POLL_VALUES[next];
      break;
    }
    case 'showHiddenFiles':
      s.showHiddenFiles = !s.showHiddenFiles;
      break;
  }
  return s;
}

export const settingsScreen: GlassScreen<OpenVideSnapshot, OpenVideActions> = {
  display: (snap, nav) => {
    const items = getSettingsItems(snap);
    const editing = isEditingValue(nav.highlightedIndex);
    const selectedRow = editing ? decodeEditingRow(nav.highlightedIndex) : nav.highlightedIndex;
    const lines = [...compactHeader(editing ? 'SETTINGS · EDIT' : 'SETTINGS', `v${APP_VERSION}`)];

    if (editing) {
      const start = slidingWindowStart(selectedRow, items.length, 8);
      const visibleItems = items.slice(start, start + 8);
      lines.push(...visibleItems.map((item, visibleIndex) => {
        const idx = start + visibleIndex;
        if (!item.value) return line(` ${item.label}`);
        const value = idx === selectedRow ? `\u25B6${item.value}\u25C0` : item.value;
        return line(kvLine(item.label, value));
      }));
    } else {
      lines.push(...buildScrollableList({
        items,
        highlightedIndex: selectedRow,
        maxVisible: 8,
        formatter: (item) => {
          if (!item.value) return ` ${item.label}`;
          return kvLine(item.label, item.value);
        },
      }));
    }

    return { lines };
  },

  action: (action, nav, snap, ctx) => {
    const items = getSettingsItems(snap);
    const editing = isEditingValue(nav.highlightedIndex);
    const selectedRow = editing ? decodeEditingRow(nav.highlightedIndex) : nav.highlightedIndex;

    if (editing) {
      const item = items[selectedRow];
      if (!item) return { ...nav, highlightedIndex: 0 };

      if (action.type === 'HIGHLIGHT_MOVE') {
        if (!item.editable) return nav;
        const updated = cycleSettingValue(snap.settings, item.key, action.direction);
        armImmediateValueScroll();
        void ctx.rpc('settings.set', { settings: updated });
        return { ...nav, highlightedIndex: encodeEditingRow(selectedRow) };
      }
      if (action.type === 'SELECT_HIGHLIGHTED' || action.type === 'GO_BACK') {
        return { ...nav, highlightedIndex: selectedRow };
      }
      return nav;
    }

    if (action.type === 'HIGHLIGHT_MOVE') {
      const max = items.length - 1;
      const idx = action.direction === 'down'
        ? Math.min(nav.highlightedIndex + 1, max)
        : Math.max(nav.highlightedIndex - 1, 0);
      return { ...nav, highlightedIndex: idx };
    }
    if (action.type === 'SELECT_HIGHLIGHTED') {
      const item = items[nav.highlightedIndex];
      if (!item) return nav;

      armImmediateValueScroll();
      return { ...nav, highlightedIndex: encodeEditingRow(nav.highlightedIndex) };
    }
    if (action.type === 'GO_BACK') {
      ctx.navigate('/');
      return { ...nav, highlightedIndex: 0 };
    }
    return nav;
  },
};
