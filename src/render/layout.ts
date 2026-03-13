/**
 * G2 display layout — single full-screen text container.
 */

export const DISPLAY_W = 576;
export const DISPLAY_H = 288;

export const CONTAINER_IDS = [1, 2, 3] as const;

export const MAIN_SLOT = {
  id: 1,
  name: 'main',
  x: 12,
  y: 0,
  w: 552,
  h: DISPLAY_H,
};

export function dummySlot(index: number) {
  return {
    id: CONTAINER_IDS[index],
    name: `d-${index + 1}`,
    x: 0,
    y: DISPLAY_H,
    w: 1,
    h: 1,
  };
}

export const BORDER_COLOR = 5;
export const BORDER_RADIUS = 6;
export const PADDING = 4;
