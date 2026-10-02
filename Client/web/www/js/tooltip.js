// Hover tooltips, as the desktop client draws them (GUIElements/Tooltip.cs):
// - slots (inventory, equipment, spellbook, hotkeys, buffs, vendor and container windows):
//   the slot's name in white on black with a white border, its top-left at the mouse
//   x and (mouse y - CharHeight - 10) (BaseSlot / HotkeySlot);
// - items on the ground: "name (stack)" on dark blue, centred under the mouse (Map.OnMouseOverMap).
// Text uses the game's bitmap font; sizes follow the game screen's scale like the rest of the UI.
//
// Any element with a data-tip attribute gets the slot tooltip.
import { CHAR_H, CHAR_W, drawGameText } from "./skin.js";
/** Tooltip.cs: Padding = 6, height = CharHeight + 4, text at y + 3. */
export const TIP_PADDING = 6;
export const TIP_HEIGHT = CHAR_H + 4;
const SLOT_BG = "rgb(1,1,1)"; // Colour.Black
const MAP_BG = "rgb(0,4,120)"; // Map tooltip background
/** Tooltip size in game pixels (Tooltip.W / H). */
export function tipSize(text) {
    return [CHAR_W * text.length + TIP_PADDING * 2, TIP_HEIGHT];
}
/** Text of the ground-item tooltip (Map.OnMouseOverMap). */
export function groundItemTip(name, stack) {
    return name + (stack > 1 ? ` (${stack})` : "");
}
/**
 * Where a tooltip goes, in page pixels. `kind` "slot": top-left at (x, y - CharHeight - 10);
 * "map": centred on x, y + 5. Kept inside the viewport's right edge like Tooltip.SetPosition.
 */
export function tipPosition(kind, mouseX, mouseY, text, scale, viewportW) {
    const [w] = tipSize(text);
    let x = kind === "slot" ? mouseX : mouseX - (w * scale) / 2;
    const y = kind === "slot" ? mouseY - (CHAR_H + 10) * scale : mouseY + 5 * scale;
    if (x + w * scale > viewportW)
        x = viewportW - w * scale;
    return [Math.max(0, Math.round(x)), Math.max(0, Math.round(y))];
}
export class Tooltips {
    constructor(font) {
        this.font = font;
        this.shownText = "";
        this.shownKind = "";
        this.fontWasReady = false;
        this.mapTip = null;
        this.el = document.createElement("div");
        this.el.id = "tooltip";
        this.el.hidden = true;
        this.el.setAttribute("role", "tooltip");
        document.body.appendChild(this.el);
        document.addEventListener("pointermove", (ev) => this.onMove(ev), { passive: true });
        // Pressing or dragging hides it, like the desktop client while an item is picked up.
        document.addEventListener("pointerdown", () => this.hide(), true);
        document.addEventListener("dragstart", () => this.hide(), true);
        document.addEventListener("scroll", () => this.hide(), true);
        window.addEventListener("blur", () => this.hide());
    }
    /** The ground item under the mouse on the game screen, or null (set by the map's mousemove). */
    setMapTip(text, x = 0, y = 0) {
        this.mapTip = text ? { text, x, y } : null;
        if (this.mapTip)
            this.show("map", this.mapTip.text, x, y);
        else if (this.shownKind === "map")
            this.hide();
    }
    onMove(ev) {
        const target = ev.target?.closest?.("[data-tip]");
        const text = target?.dataset.tip ?? "";
        if (text)
            this.show("slot", text, ev.clientX, ev.clientY);
        else if (this.shownKind === "slot")
            this.hide();
    }
    show(kind, text, x, y) {
        const font = this.font();
        if (text !== this.shownText || kind !== this.shownKind || (!!font && !this.fontWasReady)) {
            this.el.replaceChildren(font ? drawGameText(font, [text], "#fff") : document.createTextNode(text));
            this.el.classList.toggle("text", !font);
            this.el.style.background = kind === "map" ? MAP_BG : SLOT_BG;
            const [w, h] = tipSize(text);
            this.el.style.width = `${w}px`;
            this.el.style.height = `${h}px`;
            this.shownText = text;
            this.shownKind = kind;
            this.fontWasReady = !!font;
        }
        const scale = uiScale();
        const [left, top] = tipPosition(kind, x, y, text, scale, document.documentElement.clientWidth);
        this.el.style.left = `${left}px`;
        this.el.style.top = `${top}px`;
        this.el.style.transform = `scale(${scale})`;
        this.el.hidden = false;
    }
    hide() {
        this.el.hidden = true;
        this.shownText = "";
        this.shownKind = "";
    }
}
function uiScale() {
    const v = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
    return Number.isFinite(v) && v > 0 ? v : 1;
}
/** Sets or clears an element's slot tooltip (and drops the browser's own slow title tooltip). */
export function setTip(el, text) {
    el.removeAttribute("title");
    if (text)
        el.dataset.tip = text;
    else
        delete el.dataset.tip;
}
