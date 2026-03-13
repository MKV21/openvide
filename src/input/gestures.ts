/**
 * Gesture debouncing — matches Solitaire's pattern.
 *
 * Prevents rapid-fire events from the G2 touch bar.
 */

const TAP_COOLDOWN_MS = 220;
const TAP_DUPLICATE_DEBOUNCE_MS = 90;
const DOUBLE_TAP_DUPLICATE_DEBOUNCE_MS = 140;
const SCROLL_SUPPRESS_AFTER_TAP_MS = 110;

const SAME_DIRECTION_DEBOUNCE_MS = 56;
const DIRECTION_CHANGE_DEBOUNCE_MS = 20;

// ── Tap state ──

let lastTapTime = 0;
let lastTapKind: 'tap' | 'double' | null = null;

export function tryConsumeTap(kind: 'tap' | 'double'): boolean {
  const now = Date.now();
  const elapsed = now - lastTapTime;
  const duplicateMs =
    kind === 'double' ? DOUBLE_TAP_DUPLICATE_DEBOUNCE_MS : TAP_DUPLICATE_DEBOUNCE_MS;

  // Reject duplicate of same kind
  if (kind === lastTapKind && elapsed < duplicateMs) {
    console.log(`[gesture] REJECTED ${kind}: duplicate (${elapsed}ms < ${duplicateMs}ms)`);
    return false;
  }

  // Reject any tap within cooldown
  if (elapsed < TAP_COOLDOWN_MS && lastTapKind !== null) {
    console.log(`[gesture] REJECTED ${kind}: cooldown (${elapsed}ms < ${TAP_COOLDOWN_MS}ms, last=${lastTapKind})`);
    return false;
  }

  console.log(`[gesture] ACCEPTED ${kind} (elapsed=${elapsed}ms, last=${lastTapKind})`);
  lastTapTime = now;
  lastTapKind = kind;
  return true;
}

export function isScrollSuppressed(): boolean {
  return Date.now() - lastTapTime < SCROLL_SUPPRESS_AFTER_TAP_MS;
}

// ── Scroll state ──

let lastScrollTime = 0;
let lastScrollDir: 'prev' | 'next' | null = null;

export function isScrollDebounced(direction: 'prev' | 'next'): boolean {
  const now = Date.now();
  const threshold =
    direction === lastScrollDir ? SAME_DIRECTION_DEBOUNCE_MS : DIRECTION_CHANGE_DEBOUNCE_MS;

  if (now - lastScrollTime < threshold) return true;

  lastScrollTime = now;
  lastScrollDir = direction;
  return false;
}
