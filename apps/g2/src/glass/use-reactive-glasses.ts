import { useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { mapGlassEvent } from 'even-toolkit/action-map';
import { EvenHubBridge, type ColumnConfig } from 'even-toolkit/bridge';
import { bindKeyboard } from 'even-toolkit/keyboard';
import { activateKeepAlive, deactivateKeepAlive } from 'even-toolkit/keep-alive';
import type { SplashHandle } from 'even-toolkit/splash';
import {
  renderTextPageLines,
  type ColumnData,
  type DisplayData,
  type GlassAction,
  type GlassNavState,
  type SplitData,
} from 'even-toolkit/types';

export interface UseReactiveGlassesConfig<S> {
  getSnapshot: () => S;
  toDisplayData: (snapshot: S, nav: GlassNavState) => DisplayData;
  toColumns?: (snapshot: S, nav: GlassNavState) => ColumnData;
  toSplit?: (snapshot: S, nav: GlassNavState) => SplitData;
  onGlassAction: (action: GlassAction, nav: GlassNavState, snapshot: S) => GlassNavState;
  deriveScreen: (path: string) => string;
  appName: string;
  getPageMode?: (screen: string) => 'text' | 'columns' | 'split' | 'home';
  shutdownOnHomeBack?: boolean;
  shutdownMode?: 0 | 1;
  columns?: ColumnConfig[];
  homeImageTiles?: { id: number; name: string; bytes: Uint8Array; x: number; y: number; w: number; h: number }[];
  splash?: SplashHandle;
  /**
   * Forces a display refresh when React already knows state changed. The
   * simulator can miss interval-driven refreshes while still accepting input
   * events, so OpenVide passes its memoized snapshot here.
   */
  refreshKey?: unknown;
}

function showDebugOverlay(message: string): void {
  if (!(window as any).__glassesDebug) return;
  (window as any).__glassesDebugLastMessage = message;
}

export function useReactiveGlasses<S>(config: UseReactiveGlassesConfig<S>): void {
  const location = useLocation();

  const hubRef = useRef<EvenHubBridge | null>(null);
  const navRef = useRef<GlassNavState>({ highlightedIndex: 0, screen: '' });
  const lastSnapshotRef = useRef<S | null>(null);

  const configRef = useRef(config);
  configRef.current = config;

  const lastHadImagesRef = useRef(false);
  const textBusyRef = useRef(false);
  const textPendingRef = useRef(false);
  const imageBusyRef = useRef(false);

  const sendImages = useCallback((tiles: { id: number; name: string; bytes: Uint8Array }[]) => {
    if (imageBusyRef.current || !hubRef.current) return;
    imageBusyRef.current = true;

    const hub = hubRef.current;
    void (async () => {
      try {
        for (const tile of tiles) {
          if (!hubRef.current) break;
          await hub.sendImage(tile.id, tile.name, tile.bytes);
        }
      } catch {
        // Text updates are allowed to continue even if image upload stalls.
      } finally {
        imageBusyRef.current = false;
      }
    })();
  }, []);

  const sendText = useCallback(async () => {
    if (textBusyRef.current || !hubRef.current) {
      textPendingRef.current = true;
      return;
    }

    textBusyRef.current = true;
    textPendingRef.current = false;

    try {
      const hub = hubRef.current;
      const snapshot = configRef.current.getSnapshot();
      const nav = navRef.current;
      const getMode = configRef.current.getPageMode ?? (() => 'text' as const);
      const mode = getMode(nav.screen);

      if (mode === 'columns' && configRef.current.toColumns) {
        const cols = configRef.current.toColumns(snapshot, nav);
        if (hub.currentMode === 'columns') {
          await hub.updateColumns(cols.columns);
        } else {
          await hub.showColumnPage(cols.columns);
        }
        return;
      }

      if (mode === 'split' && configRef.current.toSplit) {
        const split = configRef.current.toSplit(snapshot, nav);
        if (hub.currentMode === 'split') {
          await hub.updateSplitPage(split.header, split.panes, split.layout);
        } else {
          await hub.showSplitPage(split.header, split.panes, split.layout);
        }
        return;
      }

      const data = configRef.current.toDisplayData(snapshot, nav);
      const text = renderTextPageLines(data.lines);
      const tiles = mode === 'home' ? configRef.current.homeImageTiles : undefined;
      const imageTiles = tiles?.map((tile) => ({
        id: tile.id,
        name: tile.name,
        x: tile.x,
        y: tile.y,
        w: tile.w,
        h: tile.h,
      }));
      const hasImages = !!imageTiles?.length;
      const needsRebuild = hub.currentMode !== 'home' || hasImages !== lastHadImagesRef.current;

      if (needsRebuild) {
        await hub.showHomePage(text, imageTiles);
        if (tiles) sendImages(tiles);
      } else {
        await hub.updateHomeText(text);
      }
      lastHadImagesRef.current = hasImages;
    } catch {
      // SDK unavailable or simulator update failed. Web UI still works.
    } finally {
      textBusyRef.current = false;
      if (textPendingRef.current) {
        textPendingRef.current = false;
        void sendText();
      }
    }
  }, [sendImages]);

  const flushDisplay = useCallback(() => {
    void sendText();
  }, [sendText]);

  const maybeHandleHomeShutdown = useCallback(async (action: GlassAction): Promise<boolean> => {
    if (action.type !== 'GO_BACK') return false;
    if (configRef.current.shutdownOnHomeBack === false) return false;

    const nav = navRef.current;
    const getMode = configRef.current.getPageMode ?? (() => 'text' as const);
    if (getMode(nav.screen) !== 'home') return false;

    const hub = hubRef.current;
    if (!hub) return false;
    return hub.showShutdownContainer(configRef.current.shutdownMode ?? 1);
  }, []);

  const handleAction = useCallback((action: GlassAction) => {
    void (async () => {
      if (await maybeHandleHomeShutdown(action)) return;
      const snapshot = configRef.current.getSnapshot();
      const newNav = configRef.current.onGlassAction(action, navRef.current, snapshot);
      navRef.current = newNav;
      flushDisplay();
    })();
  }, [flushDisplay, maybeHandleHomeShutdown]);

  useEffect(() => {
    const nextScreen = configRef.current.deriveScreen(location.pathname);
    if (nextScreen === navRef.current.screen) return;
    navRef.current = { highlightedIndex: 0, screen: nextScreen };
    flushDisplay();
  }, [location.pathname, flushDisplay]);

  useEffect(() => {
    if (config.refreshKey === undefined) return;
    flushDisplay();
  }, [config.refreshKey, flushDisplay]);

  useEffect(() => {
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let disposed = false;

    const hub = new EvenHubBridge(configRef.current.columns);
    hubRef.current = hub;
    navRef.current = {
      highlightedIndex: 0,
      screen: configRef.current.deriveScreen(location.pathname),
    };

    async function initBridge() {
      showDebugOverlay('initBridge: starting');

      try {
        await hub.init();
        showDebugOverlay('initBridge: ready');
        (window as any).__evenBridge = hub;
        if (disposed) return;

        const splash = configRef.current.splash;
        if (splash) {
          await splash.show(hub);
          if (disposed) return;

          hub.onEvent((event) => {
            const action = mapGlassEvent(event);
            if (action) handleAction(action);
          });

          await splash.waitMinTime();
          if (disposed) return;
          await splash.clearExtras(hub);
          lastHadImagesRef.current = !!configRef.current.homeImageTiles?.length;
        } else {
          await hub.showTextPage(`\n\n      ${configRef.current.appName}`);
          if (disposed) return;

          hub.onEvent((event) => {
            const action = mapGlassEvent(event);
            if (action) handleAction(action);
          });
        }
      } catch (error) {
        showDebugOverlay(`Bridge init failed: ${error instanceof Error ? error.message : String(error)}`);
      }

      if (disposed) return;

      flushDisplay();
      pollTimer = setInterval(() => {
        const snapshot = configRef.current.getSnapshot();
        if (snapshot === lastSnapshotRef.current) return;
        lastSnapshotRef.current = snapshot;
        flushDisplay();
      }, 100);
    }

    void initBridge();
    const unbindKeyboard = bindKeyboard(handleAction);
    activateKeepAlive(`${configRef.current.appName}_keep_alive`);

    return () => {
      disposed = true;
      if (pollTimer) clearInterval(pollTimer);
      unbindKeyboard();
      hub.dispose();
      hubRef.current = null;
      (window as any).__evenBridge = null;
      deactivateKeepAlive();
    };
    // The bridge lifetime is intentionally tied to the mounted app, matching
    // even-toolkit/useGlasses. Dynamic data is read through configRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
