/**
 * Page composition for the G2 display.
 *
 * Uses an image container for pixel-perfect rendering (inverted highlights)
 * plus a transparent text container overlay for event capture.
 */

import {
  CreateStartUpPageContainer,
  RebuildPageContainer,
  ImageContainerProperty,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk';
import { MAIN_SLOT, dummySlot, DISPLAY_H } from './layout';

/** Image container — full screen, displays canvas-rendered content. */
function imageContainer(): ImageContainerProperty {
  return new ImageContainerProperty({
    containerID: MAIN_SLOT.id,
    containerName: MAIN_SLOT.name,
    xPosition: MAIN_SLOT.x,
    yPosition: MAIN_SLOT.y,
    width: MAIN_SLOT.w,
    height: MAIN_SLOT.h,
  });
}

/** Transparent text container overlay — captures tap/scroll events. */
function eventCaptureContainer(): TextContainerProperty {
  return new TextContainerProperty({
    containerID: 2,
    containerName: 'events',
    xPosition: MAIN_SLOT.x,
    yPosition: MAIN_SLOT.y,
    width: MAIN_SLOT.w,
    height: MAIN_SLOT.h,
    borderWidth: 0,
    borderColor: 0,
    borderRdaius: 0,
    paddingLength: 0,
    content: '',
    isEventCapture: 1,
  });
}

/** Off-screen dummy to fill the 3-container minimum. */
function dummy(): TextContainerProperty {
  const s = dummySlot(2);
  return new TextContainerProperty({
    containerID: s.id,
    containerName: s.name,
    xPosition: s.x,
    yPosition: s.y,
    width: s.w,
    height: s.h,
    borderWidth: 0,
    borderColor: 0,
    borderRdaius: 0,
    paddingLength: 0,
    content: '',
    isEventCapture: 0,
  });
}

export function composeStartupPage(): CreateStartUpPageContainer {
  return new CreateStartUpPageContainer({
    containerTotalNum: 3,
    imageObject: [imageContainer()],
    textObject: [eventCaptureContainer(), dummy()],
  });
}

export function composeRebuildPage(): RebuildPageContainer {
  return new RebuildPageContainer({
    containerTotalNum: 3,
    imageObject: [imageContainer()],
    textObject: [eventCaptureContainer(), dummy()],
  });
}
