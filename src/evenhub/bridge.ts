/**
 * Even Hub SDK bridge wrapper — matches Solitaire's pattern.
 *
 * Manages the SDK lifecycle: init, page setup, event subscription, text updates.
 */

import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  RebuildPageContainer,
  ImageRawDataUpdate,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk';

export class EvenHubBridge {
  private bridge: EvenAppBridge | null = null;
  private unsubEvents: (() => void) | null = null;

  async init(): Promise<void> {
    console.log('[bridge] initializing...');
    this.bridge = await waitForEvenAppBridge();
    console.log('[bridge] acquired');
  }

  async setupPage(page: CreateStartUpPageContainer): Promise<boolean> {
    if (!this.bridge) throw new Error('Bridge not initialized');
    const result = await this.bridge.createStartUpPageContainer(page);
    const ok = result === 0;
    if (!ok) console.error('[bridge] setupPage failed:', result);
    return ok;
  }

  async rebuildPage(page: RebuildPageContainer): Promise<void> {
    if (!this.bridge) return;
    await this.bridge.rebuildPageContainer(page);
  }

  async updateImage(containerID: number, containerName: string, imageData: number[]): Promise<void> {
    if (!this.bridge) return;
    const update = new ImageRawDataUpdate({ containerID, containerName, imageData });
    await this.bridge.updateImageRawData(update);
  }

  onEvent(handler: (event: EvenHubEvent) => void): void {
    this.unsubEvents?.();
    if (!this.bridge) return;

    this.unsubEvents = this.bridge.onEvenHubEvent((event: EvenHubEvent) => {
      console.log('[bridge] event received:', JSON.stringify(event));
      handler(event);
    });

    console.log('[bridge] event subscription active');
  }

  dispose(): void {
    this.unsubEvents?.();
    this.unsubEvents = null;
    this.bridge = null;
  }
}
