/**
 * Canvas-based renderer for the G2 display.
 *
 * Draws display content to an off-screen canvas with styled lines:
 * - normal:    green text on black
 * - inverted:  green bg + black text (highlight/button)
 * - tool:      rounded bordered box (tool use lines like >> Read, >> Bash)
 * - meta:      dimmed text (status, separators, thinking)
 * - prompt:    bright text with left accent bar (user prompts)
 * - separator: thin horizontal rule
 */

import type { DisplayData, DisplayLine } from '../state/selectors';
import { MAIN_SLOT } from './layout';
import { canvasToPngBytes } from './png-utils';

/** G2 renders greyscale — light values appear as bright green on the OLED. */
const FG_COLOR = '#e0e0e0';
const BG_COLOR = '#000000';
const DIM_COLOR = '#707070';
const TOOL_BG = '#1a1a1a';
const TOOL_BORDER = '#808080';
const PROMPT_ACCENT = '#e0e0e0';

const FONT_SIZE = 20;
const LINE_HEIGHT = 28;
const PADDING_X = 10;
const PADDING_Y = 6;
const FONT = `${FONT_SIZE}px monospace`;
const FONT_SMALL = `${FONT_SIZE - 2}px monospace`;
const BORDER_RADIUS = 6;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;

function ensureCanvas(): CanvasRenderingContext2D {
  if (canvas && ctx) return ctx;
  canvas = document.createElement('canvas');
  canvas.width = MAIN_SLOT.w;
  canvas.height = MAIN_SLOT.h;
  ctx = canvas.getContext('2d')!;
  return ctx;
}

/** Get the underlying canvas element (for web mode DOM mounting). */
export function getCanvas(): HTMLCanvasElement {
  ensureCanvas();
  return canvas!;
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.arcTo(x + w, y, x + w, y + r, r);
  c.lineTo(x + w, y + h - r);
  c.arcTo(x + w, y + h, x + w - r, y + h, r);
  c.lineTo(x + r, y + h);
  c.arcTo(x, y + h, x, y + h - r, r);
  c.lineTo(x, y + r);
  c.arcTo(x, y, x + r, y, r);
  c.closePath();
}

function drawNormal(c: CanvasRenderingContext2D, line: DisplayLine, y: number, w: number): void {
  c.font = FONT;
  c.fillStyle = FG_COLOR;
  c.fillText(line.text, PADDING_X, y + (LINE_HEIGHT - FONT_SIZE) / 2);
}

function drawInverted(c: CanvasRenderingContext2D, line: DisplayLine, y: number, w: number): void {
  c.fillStyle = FG_COLOR;
  c.fillRect(0, y, w, LINE_HEIGHT);
  c.font = FONT;
  c.fillStyle = BG_COLOR;
  c.fillText(line.text, PADDING_X, y + (LINE_HEIGHT - FONT_SIZE) / 2);
}

function drawTool(c: CanvasRenderingContext2D, line: DisplayLine, y: number, w: number): void {
  const boxX = PADDING_X - 4;
  const boxY = y + 1;
  const boxW = w - PADDING_X * 2 + 8;
  const boxH = LINE_HEIGHT - 2;

  // Border only, no fill
  roundRect(c, boxX, boxY, boxW, boxH, BORDER_RADIUS);
  c.strokeStyle = TOOL_BORDER;
  c.lineWidth = 1;
  c.stroke();

  // Text
  c.font = FONT;
  c.fillStyle = FG_COLOR;
  c.fillText(line.text, PADDING_X, y + (LINE_HEIGHT - FONT_SIZE) / 2);
}

function drawMeta(c: CanvasRenderingContext2D, line: DisplayLine, y: number, _w: number): void {
  c.font = FONT_SMALL;
  c.fillStyle = DIM_COLOR;
  c.fillText(line.text, PADDING_X, y + (LINE_HEIGHT - FONT_SIZE + 2) / 2);
}

function drawPrompt(c: CanvasRenderingContext2D, line: DisplayLine, y: number, _w: number): void {
  // Left accent bar
  c.fillStyle = PROMPT_ACCENT;
  c.fillRect(3, y + 3, 3, LINE_HEIGHT - 6);

  // Bright text
  c.font = FONT;
  c.fillStyle = FG_COLOR;
  c.fillText(line.text, PADDING_X + 4, y + (LINE_HEIGHT - FONT_SIZE) / 2);
}

function drawSeparator(c: CanvasRenderingContext2D, _line: DisplayLine, y: number, w: number): void {
  c.strokeStyle = DIM_COLOR;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(PADDING_X, y + LINE_HEIGHT / 2);
  c.lineTo(w - PADDING_X, y + LINE_HEIGHT / 2);
  c.stroke();
}

function drawThinking(c: CanvasRenderingContext2D, line: DisplayLine, y: number, w: number): void {
  const boxX = PADDING_X - 4;
  const boxY = y + 1;
  const boxW = w - PADDING_X * 2 + 8;
  const boxH = LINE_HEIGHT - 2;

  // Dotted border
  c.setLineDash([3, 3]);
  c.strokeStyle = DIM_COLOR;
  c.lineWidth = 1;
  roundRect(c, boxX, boxY, boxW, boxH, BORDER_RADIUS);
  c.stroke();
  c.setLineDash([]);

  // Text in dimmed color
  c.font = FONT_SMALL;
  c.fillStyle = DIM_COLOR;
  c.fillText(line.text, PADDING_X, y + (LINE_HEIGHT - FONT_SIZE + 2) / 2);
}

/** Draw DisplayData onto the canvas (shared by both render paths). */
function drawToCanvas(data: DisplayData): void {
  const c = ensureCanvas();
  const w = canvas!.width;
  const h = canvas!.height;

  c.fillStyle = BG_COLOR;
  c.fillRect(0, 0, w, h);
  c.textBaseline = 'top';

  let y = PADDING_Y;

  for (const ln of data.lines) {
    if (y + LINE_HEIGHT > h) break;
    const style = ln.style ?? (ln.inverted ? 'inverted' : 'normal');

    switch (style) {
      case 'inverted':
        drawInverted(c, ln, y, w);
        break;
      case 'tool':
        drawTool(c, ln, y, w);
        break;
      case 'meta':
        drawMeta(c, ln, y, w);
        break;
      case 'prompt':
        drawPrompt(c, ln, y, w);
        break;
      case 'separator':
        drawSeparator(c, ln, y, w);
        break;
      case 'thinking':
        drawThinking(c, ln, y, w);
        break;
      default:
        drawNormal(c, ln, y, w);
        break;
    }

    y += LINE_HEIGHT;
  }
}

/**
 * Render DisplayData to a canvas and return PNG bytes (for SDK mode).
 */
export async function renderToImage(data: DisplayData): Promise<number[]> {
  drawToCanvas(data);
  return canvasToPngBytes(canvas!);
}

/**
 * Render DisplayData directly to the canvas (for web mode — no PNG encode).
 */
export function renderToCanvasDirect(data: DisplayData): void {
  drawToCanvas(data);
}
