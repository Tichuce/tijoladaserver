// The game's own skin (skins/<Skin>/Window.ini + Button.ini, converted by convert-assets):
// window backgrounds, slot grids, buttons and the bitmap font, laid out with the same ini
// values the desktop client reads (BaseWindow.cs, StatBarWindow.cs, FontRenderer.cs).
// Purely visual. Without the converted skin the client keeps its plain look.

import { WindowFrame } from "./protocol.js";

export type IniSections = Record<string, Record<string, string>>;

/** One Window.ini section with the numbers BaseWindow reads. */
export interface SkinWindow {
  name: string;
  image: string;
  image2: string | null;
  /** windim: rows x columns of objects (BaseWindow: rows = windim[0], columns = windim[1]). */
  rows: number;
  columns: number;
  objOff: [number, number];
  objDim: [number, number];
  /** focus=unfocused,focused alpha (0-255). */
  alpha: [number, number];
  closeBox: [number, number, number, number] | null;
  title: [number, number] | null;
  /** button_<name> positions (WindowButtons names, lower case). */
  buttons: Record<string, [number, number]>;
  raw: Record<string, string>;
}

/** WindowButtons.cs order, as MKW sends the flags. */
export const BUTTON_NAMES = ["Combine", "Close", "Back", "Next", "OK"] as const;

/** GameScreen.OnMakeWindow: which skin section draws which server window frame. */
export function skinSectionForFrame(frame: number): string | null {
  switch (frame) {
    case WindowFrame.Vendor: return "Vendor";
    case WindowFrame.GenericInfo: return "BlankMessage3";
    case WindowFrame.Quest: return "BlankMessage";
    // Option lists are quest-style text windows whose lines can be clicked.
    case WindowFrame.OptionList: return "BlankMessage";
    case WindowFrame.TwoSlot: return "Container2";
    case WindowFrame.FourSlot: return "Container4";
    case WindowFrame.SixSlot: return "Container6";
    case WindowFrame.EightSlot: return "Container8";
    case WindowFrame.TenSlot: return "Container10";
    default: return null;
  }
}

/** "a,b" -> [a, b] (IniFile GetCoords); null when missing or malformed. */
export function coords(value: string | undefined, count: number): number[] | null {
  if (value === undefined) return null;
  const parts = value.split(",").map((v) => Number.parseInt(v.trim(), 10));
  if (parts.length < count || parts.slice(0, count).some((n) => !Number.isFinite(n))) return null;
  return parts.slice(0, count);
}

export function parseSkinWindow(name: string, raw: Record<string, string> | undefined): SkinWindow | null {
  if (!raw || !raw.image) return null;
  const windim = coords(raw.windim, 2) ?? [1, 1];
  const objOff = coords(raw.objoff, 2) ?? [0, 0];
  const objDim = coords(raw.objdim, 2) ?? [32, 32];
  const focus = coords(raw.focus, 2) ?? [255, 255];
  const cbOff = coords(raw.cboff, 2);
  const cbDim = coords(raw.cbdim, 2);
  const buttons: Record<string, [number, number]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith("button_")) continue;
    const c = coords(value, 2);
    if (c) buttons[key.substring(7).toLowerCase()] = [c[0], c[1]];
  }
  return {
    name,
    image: raw.image.trim(),
    image2: raw.image2?.trim() || null,
    rows: windim[0], columns: windim[1],
    objOff: [objOff[0], objOff[1]],
    objDim: [objDim[0], objDim[1]],
    alpha: [focus[0], focus[1]],
    closeBox: cbOff && cbDim ? [cbOff[0], cbOff[1], cbDim[0], cbDim[1]] : null,
    title: (coords(raw.title, 2) as [number, number] | null),
    buttons,
    raw,
  };
}

/** Top-left of object `index` (BaseWindow: row-major over rows x columns). */
export function objectPosition(w: SkinWindow, index: number): [number, number] {
  const r = Math.floor(index / w.columns), c = index % w.columns;
  return [w.objOff[0] + c * w.objDim[0], w.objOff[1] + r * w.objDim[1]];
}

/** The Window.ini sections the browser draws (others, like [LoginScreen], are not loaded). */
export const USED_SECTIONS = [
  "Vendor", "BlankMessage", "BlankMessage3", "Container2", "Container4", "Container6", "Container8", "Container10",
  "Inventory", "SpellBook", "HotButtons", "HPbar", "MPbar", "SPbar", "XPbar", "Group", "Character", "SpellEffects", "Chat",
];

export class Skin {
  private readonly windows = new Map<string, SkinWindow>();
  private readonly sizes = new Map<string, [number, number]>();

  constructor(readonly name: string, private readonly baseUrl: string,
              windowIni: IniSections, private readonly buttonIni: IniSections) {
    for (const [section, raw] of Object.entries(windowIni)) {
      const w = parseSkinWindow(section, raw);
      if (w) this.windows.set(section, w);
    }
  }

  /** Reads game.json (Game.ini [INIT] Skin=) and that skin's Window/Button ini files. */
  static async load(assetsUrl: string): Promise<Skin | null> {
    try {
      const game = await fetchJson<IniSections>(`${assetsUrl}/game.json`);
      const name = game.INIT?.Skin?.trim();
      if (!name) return null;
      const base = `${assetsUrl}/skins/${encodeURIComponent(name)}`;
      const [windowIni, buttonIni] = await Promise.all([
        fetchJson<IniSections>(`${base}/Window.json`),
        fetchJson<IniSections>(`${base}/Button.json`).catch(() => ({} as IniSections)),
      ]);
      const skin = new Skin(name, base, windowIni, buttonIni);
      await skin.measure();
      return skin;
    } catch {
      return null;
    }
  }

  window(section: string): SkinWindow | null {
    return this.windows.get(section) ?? null;
  }

  /** URL of a skin bitmap (converted to PNG with black as the colour key). */
  image(file: string): string {
    return `${this.baseUrl}/${file.trim().replace(/\.bmp$/i, ".png")}`;
  }

  /** [up, down] images of a Button.ini section (e.g. "OK", "Next"). */
  button(name: string): [string, string] | null {
    const files = this.buttonIni[name]?.image?.split(",").map((s) => s.trim()).filter(Boolean);
    if (!files || files.length === 0) return null;
    return [this.image(files[0]), this.image(files[1] ?? files[0])];
  }

  /** Pixel size of a section's background image (the window size, like BaseWindow). */
  size(section: string): [number, number] | null {
    return this.sizes.get(section) ?? null;
  }

  private async measure(): Promise<void> {
    const used = [...this.windows.values()].filter((w) => USED_SECTIONS.includes(w.name));
    await Promise.all(used.map(async (w) => {
      const size = await imageSize(this.image(w.image));
      if (size) this.sizes.set(w.name, size);
    }));
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

function imageSize(url: string): Promise<[number, number] | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve([img.naturalWidth, img.naturalHeight]);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ---- The game's bitmap font (FontRenderer.cs: ADF file 101, 6x11 glyphs) ----

export const FONT_SHEET = 101;
export const CHAR_W = 6;
export const CHAR_H = 11;
const LETTERS = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

/** Glyph x offset in the font sheet, or -1 for characters the font has no glyph for. */
export function glyphOffset(ch: string): number {
  const i = LETTERS.indexOf(ch);
  return i < 0 ? -1 : i * CHAR_W;
}

/** Word wrap at `maxChars` per line, like FontRenderer.RenderWrapped (breaks long words). */
export function wrapText(text: string, maxChars: number): string[] {
  if (maxChars <= 0) return [text];
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      let w = word;
      while (w.length > maxChars) {
        if (line) { out.push(line); line = ""; }
        out.push(w.substring(0, maxChars));
        w = w.substring(maxChars);
      }
      const candidate = line ? `${line} ${w}` : w;
      if (candidate.length > maxChars) { out.push(line); line = w; }
      else line = candidate;
    }
    out.push(line);
  }
  return out;
}

/**
 * Draws text with the game font into a canvas sized to the text. The glyphs are white in
 * the sheet and coloured the way SDL's colour mod does it.
 */
export function drawGameText(sheet: CanvasImageSource | null, lines: string[], colour: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.max(...lines.map((l) => l.length)) * CHAR_W);
  canvas.height = Math.max(1, lines.length * CHAR_H);
  const ctx = canvas.getContext("2d")!;
  if (!sheet) return canvas;
  lines.forEach((line, row) => {
    for (let i = 0; i < line.length; i++) {
      const x = glyphOffset(line[i]);
      if (x >= 0) ctx.drawImage(sheet, x, 0, CHAR_W, CHAR_H, i * CHAR_W, row * CHAR_H, CHAR_W, CHAR_H);
    }
  });
  if (!/^(#fff|#ffffff|white)$/i.test(colour)) {
    // The glyphs are pure white, so SDL's colour mod (multiply) is just the colour itself.
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "source-over";
  }
  return canvas;
}
