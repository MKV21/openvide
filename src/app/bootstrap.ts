/**
 * App bootstrap — wires daemon polling, voice, output streaming,
 * and the rendering pipeline. Supports both SDK mode (glasses/simulator)
 * and web mode (browser canvas).
 */

import { EvenHubBridge } from '../evenhub/bridge';
import { createStore } from '../state/store';
import type { AppState } from '../state/types';
import type { Action } from '../state/actions';
import { getDisplayData, getThinkingIdAtHighlight } from '../state/selectors';
import { mapEvenHubEvent } from '../input/action-map';
import { composeStartupPage } from '../render/composer';
import { renderToImage, renderToCanvasDirect, getCanvas } from '../render/canvas-renderer';
import { MAIN_SLOT } from '../render/layout';
import { bindKeyboard } from '../input/keyboard';
import { activateKeepAlive } from '../utils/keep-alive';
import { setBridgeUrl } from '../domain/daemon-client';
import { startPolling } from '../domain/daemon-poller';
import { sendPrompt, cancelSession, dismissSession } from '../domain/session-actions';
import { startOutputStream, stopOutputStream } from '../domain/output-stream';
import { startVoiceCapture, stopVoiceCapture, isVoiceAvailable } from '../input/voice';
import { getSessionActions } from '../state/reducer';

let hub: EvenHubBridge | null = null;
let store: ReturnType<typeof createStore>;
let pageCreated = false;
let rendering = false;

let dirty = false;

// ── Display ──

async function flushDisplay(state: AppState): Promise<void> {
  if (rendering) {
    dirty = true;
    return;
  }
  rendering = true;
  dirty = false;
  try {
    const data = getDisplayData(state);

    // Always render to DOM canvas
    renderToCanvasDirect(data);

    // Also push to glasses if SDK is connected
    if (hub) {
      const pngBytes = await renderToImage(data);
      if (pngBytes.length > 0) {
        if (!pageCreated) {
          const page = composeStartupPage();
          pageCreated = await hub.setupPage(page);
        }
        if (pageCreated) {
          await hub.updateImage(MAIN_SLOT.id, MAIN_SLOT.name, pngBytes);
        }
      }
    }
  } catch (err) {
    console.error('[display] render error:', err);
  } finally {
    rendering = false;
    if (dirty) {
      dirty = false;
      flushDisplay(store.getState()).catch((err) => console.error('[display] flush error:', err));
    }
  }
}

function shouldUpdateDisplay(state: AppState, prev: AppState): boolean {
  if (state.screen !== prev.screen) return true;
  if (state.highlightedIndex !== prev.highlightedIndex) return true;
  if (state.selectedSessionId !== prev.selectedSessionId) return true;
  if (state.pendingResult !== prev.pendingResult) return true;
  if (state.connectionStatus !== prev.connectionStatus) return true;
  if (state.voiceText !== prev.voiceText) return true;
  if (state.voiceListening !== prev.voiceListening) return true;
  if (state.outputLines !== prev.outputLines) return true;
  if (state.outputScrollOffset !== prev.outputScrollOffset) return true;
  if (state.chatHighlight !== prev.chatHighlight) return true;
  if (state.expandedThinking !== prev.expandedThinking) return true;
  if (state.screen === 'home' && state.sessions !== prev.sessions) return true;
  return false;
}

// ── Action handling ──

function handleAction(action: Action): void {
  const state = store.getState();

  // Special handling for PRIMARY_ACTION on session-detail
  if (action.type === 'PRIMARY_ACTION' && state.screen === 'session-detail' && state.selectedSessionId) {
    const actions = getSessionActions(state);
    const chosen = actions[state.highlightedIndex];

    if (chosen === 'Cancel') {
      cancelSession(store, state.selectedSessionId);
      return;
    }
    if (chosen === 'Dismiss') {
      dismissSession(store, state.selectedSessionId);
      return;
    }
  }

  // Chat voice flow: click → start listening, click → stop & send
  if (action.type === 'PRIMARY_ACTION' && state.screen === 'live-output' && state.selectedSessionId) {
    if (!state.voiceListening) {
      // First click: start listening
      console.log('[app] Chat voice: start listening');
      store.dispatch({ type: 'VOICE_START' });
      // Try real voice — if it errors, side-effect handler falls back to mock
      if (isVoiceAvailable()) {
        startVoiceCapture(store);
      } else {
        // No Speech API at all → mock immediately
        setTimeout(() => {
          if (store.getState().voiceListening) {
            store.dispatch({ type: 'VOICE_INTERIM', text: 'test voice input' });
          }
        }, 500);
      }
    } else {
      // Second click: stop and send
      console.log('[app] Chat voice: stop and send');
      stopVoiceCapture();
      const text = state.voiceText || 'test voice input';
      store.dispatch({ type: 'VOICE_FINAL', text });
      sendPrompt(store, state.selectedSessionId, text);
      setTimeout(() => store.dispatch({ type: 'VOICE_CLEAR' }), 1500);
    }
    return;
  }

  // Chat tap: toggle thinking if on thinking row, otherwise start/stop voice
  if (action.type === 'CHAT_TAP' && state.screen === 'live-output') {
    const thinkingId = getThinkingIdAtHighlight(state);
    if (thinkingId !== null && !state.voiceListening) {
      store.dispatch({ type: 'TOGGLE_THINKING', thinkingId });
      return;
    }
    // Not on thinking row (or already listening) → start/stop voice
    handleAction({ type: 'PRIMARY_ACTION' });
    return;
  }

  store.dispatch(action);
}

// ── Side effects ──

function handleSideEffects(state: AppState, prev: AppState): void {
  if (state.screen !== prev.screen) {
    if (state.screen === 'voice-input') {
      if (isVoiceAvailable()) {
        startVoiceCapture(store);
      } else {
        store.dispatch({ type: 'VOICE_ERROR', error: 'Voice not available' });
      }
    }
    if (prev.screen === 'voice-input') {
      stopVoiceCapture();
    }
    if (state.screen === 'live-output' && state.selectedSessionId) {
      startOutputStream(store, state.selectedSessionId);
    }
    if (prev.screen === 'live-output') {
      stopOutputStream();
    }
  }

  // Voice error on live-output → recover to mock listening state
  if (
    state.screen === 'live-output' &&
    !state.voiceListening &&
    prev.voiceListening &&
    state.voiceText?.startsWith('Error:')
  ) {
    console.log('[app] Voice failed, switching to mock mode');
    store.dispatch({ type: 'VOICE_START' });
    setTimeout(() => {
      if (store.getState().voiceListening) {
        store.dispatch({ type: 'VOICE_INTERIM', text: 'test voice input' });
      }
    }, 500);
  }

  // Voice final → auto-send prompt (voice-input screen only)
  if (
    prev.voiceListening &&
    !state.voiceListening &&
    state.voiceText &&
    !state.voiceText.startsWith('Error:') &&
    state.selectedSessionId &&
    state.screen === 'voice-input'
  ) {
    sendPrompt(store, state.selectedSessionId, state.voiceText);
  }
}

// ── SDK detection ──


// ── Web mode setup ──

function mountWebCanvas(): void {
  const root = document.getElementById('app');
  if (!root) return;

  root.innerHTML = '';
  root.style.display = 'flex';
  root.style.justifyContent = 'center';
  root.style.alignItems = 'center';
  root.style.minHeight = '100vh';
  root.style.background = '#111';

  const cvs = getCanvas();
  cvs.style.border = '2px solid #333';
  cvs.style.borderRadius = '8px';
  // Scale up 2x for visibility on desktop
  cvs.style.width = `${cvs.width * 2}px`;
  cvs.style.height = `${cvs.height * 2}px`;
  cvs.style.imageRendering = 'pixelated';
  root.appendChild(cvs);
}

// ── Init ──

export async function initApp(): Promise<void> {
  console.log('[app] Open Vide G2 starting...');

  const params = new URLSearchParams(window.location.search);
  const bridgeParam = params.get('bridge');
  if (bridgeParam) {
    setBridgeUrl(bridgeParam);
  }

  // Always mount web canvas for browser preview
  mountWebCanvas();

  // Try to connect SDK in background (for simulator/glasses)
  // Don't await — if it connects, it'll push to glasses too
  const sdkHub = new EvenHubBridge();
  sdkHub.init().then(() => {
    console.log('[app] SDK bridge connected — dual mode (web + glasses)');
    hub = sdkHub;
    // Re-render to push current state to glasses
    flushDisplay(store.getState()).catch(() => {});
    // Subscribe to SDK events
    hub.onEvent((event) => {
      const action = mapEvenHubEvent(event, store.getState());
      if (action) {
        console.log('[app] dispatching:', action.type);
        handleAction(action);
      }
    });
  }).catch(() => {
    console.log('[app] SDK bridge not available — web-only mode');
  });

  store = createStore();

  // Initial render
  await flushDisplay(store.getState());

  // State → display + side effects
  store.subscribe((state, prev) => {
    if (shouldUpdateDisplay(state, prev)) {
      flushDisplay(state).catch((err) => console.error('[display] flush error:', err));
    }
    handleSideEffects(state, prev);
  });

  bindKeyboard(store, handleAction);
  startPolling(store);
  activateKeepAlive();

  store.dispatch({ type: 'APP_INIT' });
  console.log('[app] Open Vide G2 ready');
}
