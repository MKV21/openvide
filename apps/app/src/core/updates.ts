import { AppState, type AppStateStatus } from "react-native";
import * as Updates from "expo-updates";

const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let lastCheckTime = 0;

export type OtaStatus = "checking" | "downloading" | null;

/**
 * Check for OTA update at startup. If an update is available, fetch and reload.
 * Returns after update is applied (reload) or after timeout — whichever comes first.
 * Call this while the splash screen is visible.
 * Optional `onStatus` callback reports progress stages for UI display.
 */
export async function checkForUpdateOnLaunch(
  timeoutMs = 5000,
  onStatus?: (status: OtaStatus) => void,
): Promise<void> {
  if (__DEV__) return;

  let timedOut = false;
  const showStart = Date.now();
  const MIN_VISIBLE_MS = 1200; // keep bar visible long enough to read

  const clearStatus = () => {
    const elapsed = Date.now() - showStart;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
    if (delay > 0) {
      setTimeout(() => onStatus?.(null), delay);
    } else {
      onStatus?.(null);
    }
  };

  try {
    await Promise.race([
      (async () => {
        onStatus?.("checking");
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable || timedOut) {
          clearStatus();
          return;
        }
        onStatus?.("downloading");
        await Updates.fetchUpdateAsync();
        // Update is downloaded — it will apply on next cold start.
        // Don't call reloadAsync() here: it restarts the JS bundle which
        // re-mounts the splash animation, causing it to play twice.
      })(),
      new Promise<void>((resolve) =>
        setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs),
      ),
    ]);
    clearStatus();
  } catch {
    clearStatus();
  }
}

/**
 * Start a background update checker that runs on app foreground.
 * Checks at most every 5 minutes. Update applies on next cold start.
 * Skipped in development mode (__DEV__).
 *
 * Returns a cleanup function to remove the AppState listener.
 */
export function startUpdateChecker(): () => void {
  if (__DEV__) {
    return () => {};
  }

  let lastState: AppStateStatus = AppState.currentState;

  const sub = AppState.addEventListener("change", (nextState) => {
    if (lastState.match(/inactive|background/) && nextState === "active") {
      void checkForUpdate();
    }
    lastState = nextState;
  });

  // Also check on initial mount
  void checkForUpdate();

  return () => sub.remove();
}

async function checkForUpdate(): Promise<void> {
  const now = Date.now();
  if (now - lastCheckTime < MIN_CHECK_INTERVAL_MS) {
    return;
  }
  lastCheckTime = now;

  try {
    const check = await Updates.checkForUpdateAsync();
    if (check.isAvailable) {
      await Updates.fetchUpdateAsync();
      // Will apply on next cold start
    }
  } catch {
    // Silently fail
  }
}
