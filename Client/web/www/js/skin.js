// The game's own skin (skins/<Skin>/Window.ini + Button.ini, converted by convert-assets):
// window backgrounds, slot grids, buttons and the bitmap font, laid out with the same ini
// values the desktop client reads (BaseWindow.cs, StatBarWindow.cs, FontRenderer.cs).
// Purely visual. Without the converted skin the client keeps its plain look.
import { WindowFrame } from "./protocol.js";
/** WindowButtons.cs order, as MKW sends the flags. */
export const BUTTON_NAMES = ["Combine", "Close", "Back", "Next", "OK"];
/** GameScreen.OnMakeWindow: which skin section draws which server window frame. */
export function skinSectionForFrame(frame) {
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
export function coords(value, count) {
    if (value === undefined)
        return null;
    const parts = value.split(",").map((v) => Number.parseInt(v.trim(), 10));
    if (parts.length < count || parts.slice(0, count).some((n) => !Number.isFinite(n)))
        return null;
    return parts.slice(0, count);
}
export function parseSkinWindow(name, raw) {
    if (!raw || !raw.image)
        return null;
    const windim = coords(raw.windim, 2) ?? [1, 1];
    const objOff = coords(raw.objoff, 2) ?? [0, 0];
    const objDim = coords(raw.objdim, 2) ?? [32, 32];
    const focus = coords(raw.focus, 2) ?? [255, 255];
    const cbOff = coords(raw.cboff, 2);
    const cbDim = coords(raw.cbdim, 2);
    const buttons = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!key.startsWith("button_"))
            continue;
        const c = coords(value, 2);
        if (c)
            buttons[key.substring(7).toLowerCase()] = [c[0], c[1]];
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
        title: coords(raw.title, 2),
        buttons,
        raw,
    };
}
/** Top-left of object `index` (BaseWindow: row-major over rows x columns). */
export function objectPosition(w, index) {
    const r = Math.floor(index / w.columns), c = index % w.columns;
    return [w.objOff[0] + c * w.objDim[0], w.objOff[1] + r * w.objDim[1]];
}
/** The Window.ini sections the browser draws (others, like [LoginScreen], are not loaded). */
export const USED_SECTIONS = [
    "Vendor", "BlankMessage", "BlankMessage3", "Container2", "Container4", "Container6", "Container8", "Container10",
    "Inventory", "SpellBook", "HotButtons", "HPbar", "MPbar", "SPbar", "XPbar", "Group", "Character", "SpellEffects", "Chat",
];
export class Skin {
    constructor(name, baseUrl, windowIni, buttonIni) {
        this.name = name;
        this.baseUrl = baseUrl;
        this.buttonIni = buttonIni;
        this.windows = new Map();
        this.sizes = new Map();
        for (const [section, raw] of Object.entries(windowIni)) {
            const w = parseSkinWindow(section, raw);
            if (w)
                this.windows.set(section, w);
        }
    }
    /** Reads game.json (Game.ini [INIT] Skin=) and that skin's Window/Button ini files. */
    static async load(assetsUrl) {
        try {
            const game = await fetchJson(`${assetsUrl}/game.json`);
            const name = game.INIT?.Skin?.trim();
            if (!name)
                return null;
            const base = `${assetsUrl}/skins/${encodeURIComponent(name)}`;
            const [windowIni, buttonIni] = await Promise.all([
                fetchJson(`${base}/Window.json`),
                fetchJson(`${base}/Button.json`).catch(() => ({})),
            ]);
            const skin = new Skin(name, base, windowIni, buttonIni);
            await skin.measure();
            return skin;
        }
        catch {
            return null;
        }
    }
    window(section) {
        return this.windows.get(section) ?? null;
    }
    /** URL of a skin bitmap (converted to PNG with black as the colour key). */
    image(file) {
        return `${this.baseUrl}/${file.trim().replace(/\.bmp$/i, ".png")}`;
    }
    /** [up, down] images of a Button.ini section (e.g. "OK", "Next"). */
    button(name) {
        const files = this.buttonIni[name]?.image?.split(",").map((s) => s.trim()).filter(Boolean);
        if (!files || files.length === 0)
            return null;
        return [this.image(files[0]), this.image(files[1] ?? files[0])];
    }
    /** Pixel size of a section's background image (the window size, like BaseWindow). */
    size(section) {
        return this.sizes.get(section) ?? null;
    }
    async measure() {
        const used = [...this.windows.values()].filter((w) => USED_SECTIONS.includes(w.name));
        await Promise.all(used.map(async (w) => {
            const size = await imageSize(this.image(w.image));
            if (size)
                this.sizes.set(w.name, size);
        }));
    }
}
async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error(`${url}: HTTP ${response.status}`);
    return (await response.json());
}
function imageSize(url) {
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
export function glyphOffset(ch) {
    const i = LETTERS.indexOf(ch);
    return i < 0 ? -1 : i * CHAR_W;
}
/** Word wrap at `maxChars` per line, like FontRenderer.RenderWrapped (breaks long words). */
export function wrapText(text, maxChars) {
    if (maxChars <= 0)
        return [text];
    const out = [];
    for (const paragraph of text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(" ")) {
            let w = word;
            while (w.length > maxChars) {
                if (line) {
                    out.push(line);
                    line = "";
                }
                out.push(w.substring(0, maxChars));
                w = w.substring(maxChars);
            }
            const candidate = line ? `${line} ${w}` : w;
            if (candidate.length > maxChars) {
                out.push(line);
                line = w;
            }
            else
                line = candidate;
        }
        out.push(line);
    }
    return out;
}
/**
 * Draws text with the game font into a canvas sized to the text. The glyphs are white in
 * the sheet and coloured the way SDL's colour mod does it.
 */
export function drawGameText(sheet, lines, colour) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.max(...lines.map((l) => l.length)) * CHAR_W);
    canvas.height = Math.max(1, lines.length * CHAR_H);
    const ctx = canvas.getContext("2d");
    if (!sheet)
        return canvas;
    lines.forEach((line, row) => {
        for (let i = 0; i < line.length; i++) {
            const x = glyphOffset(line[i]);
            if (x >= 0)
                ctx.drawImage(sheet, x, 0, CHAR_W, CHAR_H, i * CHAR_W, row * CHAR_H, CHAR_W, CHAR_H);
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
