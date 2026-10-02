// On-demand access to the converted game assets (see tools/AsperetaWeb).
//
// Only index.json is fetched up front. Sprite sheets are fetched the first time something
// on screen needs a frame from them, and maps when the server sends us to one.

export const TILE_SIZE = 32;

export interface FrameInfo {
  file: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AnimationInfo {
  /** Seconds per frame, as ResourceManager.GetAnimation: 1 / interval / 2. */
  secondsPerFrame: number;
  frames: number[];
}

/** AnimationType from CompiledEnc.cs. */
export enum AnimationType { Body = 0, Hair = 1, Hand = 2, Chest = 3, Helm = 4, Legs = 5, Feet = 6 }

export interface MapData {
  number: number;
  width: number;
  height: number;
  blocked: Uint8Array;
  /** 4 layers per tile, row major: layers[(y * width + x) * 4 + layer] */
  layers: Int32Array;
}

interface IndexJson {
  version: number;
  frames: Record<string, [number, number, number, number, number]>;
  animations: Record<string, number[]>;
  compiled: number[][];
}

/** A colour tint as sent by the server: r, g, b, a (a == 0 means no tint). */
export type Tint = readonly [number, number, number, number] | null;

export class Assets {
  private frames = new Map<number, FrameInfo>();
  private animations = new Map<number, AnimationInfo>();
  private compiled = new Map<string, number[]>();
  private sheets = new Map<number, HTMLImageElement | "loading" | "failed">();
  private tinted = new Map<string, HTMLCanvasElement>();
  private loadListeners: Array<() => void> = [];

  constructor(private readonly baseUrl: string) {}

  async loadIndex(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/index.json`);
    if (!response.ok) throw new Error(`index.json: HTTP ${response.status}. Run convert-assets.bat first.`);
    const index = (await response.json()) as IndexJson;

    for (const [id, [file, x, y, w, h]] of Object.entries(index.frames))
      this.frames.set(Number(id), { file, x, y, w, h });

    for (const [id, values] of Object.entries(index.animations)) {
      const interval = values[0];
      this.animations.set(Number(id), {
        secondsPerFrame: interval > 0 ? 1 / interval / 2 : 0.1,
        frames: values.slice(1),
      });
    }

    for (const entry of index.compiled)
      this.compiled.set(`${entry[0]}:${entry[1]}`, entry.slice(2));
  }

  /** Called whenever a sprite sheet finishes loading, so the renderer can redraw. */
  onSheetLoaded(listener: () => void): void {
    this.loadListeners.push(listener);
  }

  frame(id: number): FrameInfo | undefined {
    return this.frames.get(id);
  }

  animation(id: number): AnimationInfo | undefined {
    return this.animations.get(id);
  }

  compiledAnimation(type: AnimationType, id: number): number[] | undefined {
    return this.compiled.get(`${type}:${id}`);
  }

  /** The sheet image if it is loaded; otherwise starts loading it and returns null. */
  sheet(file: number): HTMLImageElement | null {
    const entry = this.sheets.get(file);
    if (entry instanceof HTMLImageElement) return entry;
    if (entry === undefined) {
      this.sheets.set(file, "loading");
      const image = new Image();
      image.onload = () => {
        this.sheets.set(file, image);
        for (const listener of this.loadListeners) listener();
      };
      image.onerror = () => {
        this.sheets.set(file, "failed");
        console.warn(`Missing sprite sheet gfx/${file}.png`);
      };
      image.src = `${this.baseUrl}/gfx/${file}.png`;
    }
    return null;
  }

  /**
   * Returns something drawable for a frame: the sheet itself with the frame rect for
   * untinted frames, or a cached tinted copy of just that frame.
   */
  drawable(frameId: number, tint: Tint): { source: CanvasImageSource; sx: number; sy: number; w: number; h: number } | null {
    const frame = this.frames.get(frameId);
    if (!frame) return null;
    const sheet = this.sheet(frame.file);
    if (!sheet) return null;

    if (!tint || tint[3] === 0) return { source: sheet, sx: frame.x, sy: frame.y, w: frame.w, h: frame.h };

    const key = `${frameId}:${tint.join(",")}`;
    let canvas = this.tinted.get(key);
    if (!canvas) {
      canvas = tintFrame(sheet, frame, tint);
      this.tinted.set(key, canvas);
    }
    return { source: canvas, sx: 0, sy: 0, w: frame.w, h: frame.h };
  }

  async loadMap(number: number): Promise<MapData> {
    const response = await fetch(`${this.baseUrl}/maps/${number}.bin`);
    if (!response.ok) throw new Error(`Map ${number}: HTTP ${response.status}`);
    return parseMap(number, await response.arrayBuffer());
  }
}

/** Parses the "AMAP" v1 format written by the converter. */
export function parseMap(number: number, buffer: ArrayBuffer): MapData {
  const view = new DataView(buffer);
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== "AMAP") throw new Error(`Map ${number}: not an AMAP file`);
  const version = view.getUint16(4, true);
  if (version !== 1) throw new Error(`Map ${number}: unsupported version ${version}`);
  const width = view.getUint16(6, true);
  const height = view.getUint16(8, true);

  const count = width * height;
  const blocked = new Uint8Array(count);
  const layers = new Int32Array(count * 4);
  let offset = 10;
  for (let i = 0; i < count; i++) {
    blocked[i] = view.getUint8(offset);
    offset += 1;
    for (let l = 0; l < 4; l++) {
      layers[i * 4 + l] = view.getInt32(offset, true);
      offset += 4;
    }
  }
  return { number, width, height, blocked, layers };
}

/**
 * The desktop client's tint (ResourceManager.TintSurface), applied per pixel to the
 * opaque pixels of one frame. Values wrap like the C# byte casts do.
 */
export function tintPixel(c: number, t: number, a: number): number {
  return ((((a * ((t + 256) - c)) >> 8) + c - a) & 0xff);
}

function tintFrame(sheet: HTMLImageElement, frame: FrameInfo, tint: readonly [number, number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, frame.w);
  canvas.height = Math.max(1, frame.h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  const [tr, tg, tb, ta] = tint;
  for (let i = 0; i < d.length; i += 4) {
    // TintSurface leaves pure black alone (both its paletted and 24-bit paths).
    if (d[i + 3] === 0 || (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0)) continue;
    d[i] = tintPixel(d[i], tr, ta);
    d[i + 1] = tintPixel(d[i + 1], tg, ta);
    d[i + 2] = tintPixel(d[i + 2], tb, ta);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Where a frame is drawn relative to its tile's top-left corner (Texture.cs offsets).
 * Map graphics are bottom aligned; character graphics are centred and lifted.
 */
export function frameOffset(w: number, h: number, kind: "map" | "character" | "spell"): [number, number] {
  const x = TILE_SIZE / 2 - Math.trunc(w / 2);
  let y = 0;
  if (kind === "map") y = -h + TILE_SIZE;
  else if (kind === "spell") y = -Math.max(Math.trunc((h - 48) / 2), 0) - 8;
  else if (h > TILE_SIZE) y = -Math.max(Math.trunc((h - 48) / 2), 0) - 16;
  return [x, y];
}
