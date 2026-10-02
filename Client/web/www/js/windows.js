// Server windows (MKW / WNF / WNL / ENW / CLW): vendors, containers, quests, option lists and
// information windows. Every action is the desktop client's packet: VPI/VSI for vendors,
// ITW/WTI/WTW for containers, WBC for buttons and option-list lines.
//
// Two looks: the game's skin (when converted and the classic look is on), laid out from
// Window.ini exactly like the desktop client's BaseWindow; otherwise simple floating panels.
import { dropTarget, setDrag } from "./dnd.js";
import { LogView } from "./logview.js";
import { WINDOW_BUTTONS, WindowFrame } from "./protocol.js";
import { setTip } from "./tooltip.js";
import { BUTTON_NAMES, CHAR_H, CHAR_W, FONT_SHEET, drawGameText, objectPosition, skinSectionForFrame, wrapText } from "./skin.js";
/** Slot counts of the container frames (Container2 ... Container10 in Window.ini). */
const CONTAINER_SLOTS = {
    [WindowFrame.TwoSlot]: 2, [WindowFrame.FourSlot]: 4, [WindowFrame.SixSlot]: 6,
    [WindowFrame.EightSlot]: 8, [WindowFrame.TenSlot]: 10,
};
const VENDOR_SLOTS = 30; // [Vendor] windim=6,5
/** Bank and trade use slot grids too; the server decides how many lines it sends. */
const SLOT_WINDOW_MIN = { [WindowFrame.Trade]: 10, [WindowFrame.Bank]: 20 };
/** Option-list rows in the skinned look: room for a 26px icon, 8 rows above the buttons. */
const OPTION_ROW_H = 28;
export class Windows {
    constructor(layer, assets, iconFor) {
        this.layer = layer;
        this.assets = assets;
        this.iconFor = iconFor;
        this.session = null;
        this.skin = null;
        this.classic = false;
        this.zTop = 1;
        this.elements = new Map();
        this.logViews = new Map();
        this.positions = new Map();
    }
    attach(session) {
        this.session = session;
        this.render();
    }
    /** Sets the skin and whether to use it; rebuilds the open windows in the new look. */
    setLook(skin, classic) {
        this.skin = skin;
        this.classic = classic && !!skin;
        for (const [id, el] of this.elements) {
            if (this.logViews.has(id))
                continue;
            el.remove();
            this.elements.delete(id);
        }
        this.render();
    }
    render() {
        const s = this.session;
        const shown = new Set();
        for (const w of s?.windows.values() ?? []) {
            if (!w.shown)
                continue;
            shown.add(w.id);
            if (w.log) {
                this.renderLog(w);
                continue;
            }
            const skinned = this.skinFor(w);
            let el = this.elements.get(w.id);
            if (el && el.dataset.frame !== String(w.frame)) {
                el.remove();
                el = undefined;
            }
            if (!el) {
                el = skinned ? this.createSkinned(w, skinned) : this.create(w);
                this.elements.set(w.id, el);
                this.layer.appendChild(el);
                this.focus(w.id);
            }
            if (skinned)
                this.fillSkinned(el, w, skinned);
            else
                this.fill(el, w);
        }
        for (const [id, el] of this.elements) {
            if (shown.has(id))
                continue;
            el.remove();
            this.elements.delete(id);
            this.logViews.delete(id);
        }
    }
    renderLog(w) {
        let view = this.logViews.get(w.id);
        if (view && this.elements.get(w.id) !== view.root)
            view = undefined;
        if (!view) {
            this.elements.get(w.id)?.remove();
            const id = w.id;
            view = new LogView(w.log, {
                search: (filters) => (this.session ? this.session.logSearch(id, filters) : "Not connected."),
                page: (forward) => this.session?.logPage(id, forward),
                close: () => this.session?.windowButton(id, 1),
            }, `log-maps-${id}`);
            const el = view.root;
            const pos = this.positions.get("log-viewer") ?? [16, 16];
            el.style.left = `${pos[0]}px`;
            el.style.top = `${pos[1]}px`;
            el.addEventListener("pointerdown", () => this.focus(id), { capture: true });
            this.makeDraggable(el, view.handle, "log-viewer");
            this.logViews.set(id, view);
            this.elements.set(id, el);
            this.layer.appendChild(el);
            this.focus(id);
        }
        view.update();
    }
    skinFor(w) {
        if (!this.classic || !this.skin)
            return null;
        const section = skinSectionForFrame(w.frame);
        const sw = section ? this.skin.window(section) : null;
        return sw && this.skin.size(sw.name) ? sw : null;
    }
    /**
     * The focused window is drawn opaque and on top (BaseWindow focus alpha, BringToFront).
     * Stacking uses z-index: moving the element in the DOM mid-click would swallow the click.
     */
    focus(id) {
        this.zTop++;
        for (const [wid, el] of this.elements) {
            el.classList.toggle("focused", wid === id);
            if (wid === id)
                el.style.zIndex = String(this.zTop);
        }
    }
    // ---- shared slot behaviour -----------------------------------------------------------
    wireSlot(cell, w, i, line) {
        if (line) {
            setTip(cell, line.text);
            cell.draggable = w.frame !== WindowFrame.Vendor;
            cell.addEventListener("dragstart", (ev) => setDrag(ev, { type: "item", place: { kind: "window", windowId: w.id, slot: i } }));
            cell.addEventListener("contextmenu", (ev) => {
                ev.preventDefault();
                this.session?.itemDetails(line.itemId);
            });
            if (w.frame === WindowFrame.Vendor)
                cell.addEventListener("dblclick", () => this.session?.vendorBuy(w.id, i));
        }
        dropTarget(cell, (payload) => {
            if (payload.type === "item")
                this.session?.moveItem(payload.place, { kind: "window", windowId: w.id, slot: i });
        });
    }
    slotContent(cell, line) {
        const icon = this.iconFor(line.graphic, line.tint[3] ? line.tint : null);
        cell.appendChild(icon);
        if (line.stack > 1) {
            const b = document.createElement("span");
            b.className = "badge";
            b.textContent = String(line.stack);
            cell.appendChild(b);
        }
        return icon.dataset.ready === "1";
    }
    // ---- skinned look ----------------------------------------------------------------------
    createSkinned(w, sw) {
        const skin = this.skin;
        const [width, height] = skin.size(sw.name);
        const el = document.createElement("section");
        el.className = "game-window skinned";
        el.dataset.frame = String(w.frame);
        el.dataset.section = sw.name;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.backgroundImage = `url("${skin.image(sw.image)}")`;
        el.style.setProperty("--unfocused", String(sw.alpha[0] / 255));
        el.style.setProperty("--focused", String(sw.alpha[1] / 255));
        // Saved position per section, otherwise centred (BaseWindow without a winloc).
        const scale = this.scale();
        const pos = this.positions.get(sw.name) ?? [
            Math.max(0, Math.round((this.layer.clientWidth - width * scale) / 2)),
            Math.max(0, Math.round((this.layer.clientHeight - height * scale) / 2)),
        ];
        el.style.left = `${pos[0]}px`;
        el.style.top = `${pos[1]}px`;
        el.addEventListener("pointerdown", () => this.focus(w.id), { capture: true });
        this.makeDraggable(el, el, sw.name);
        const content = document.createElement("div");
        content.className = "content";
        el.appendChild(content);
        if (sw.closeBox) {
            const [x, y, cw, ch] = sw.closeBox;
            const box = document.createElement("button");
            box.type = "button";
            box.className = "close-box";
            box.title = "Close";
            Object.assign(box.style, { left: `${x}px`, top: `${y}px`, width: `${cw}px`, height: `${ch}px` });
            box.addEventListener("click", () => this.session?.windowButton(w.id, 1));
            el.appendChild(box);
        }
        const buttons = document.createElement("div");
        buttons.className = "skin-buttons";
        el.appendChild(buttons);
        return el;
    }
    fillSkinned(el, w, sw) {
        const font = this.assets.sheet(FONT_SHEET);
        const key = JSON.stringify([w.title, w.lines, w.buttons, w.opening, !!font]);
        if (el.dataset.key === key && el.dataset.ready === "1")
            return;
        el.dataset.key = key;
        let ready = !!font;
        const content = el.querySelector(".content");
        content.replaceChildren();
        const [width] = this.skin.size(sw.name);
        if (sw.title && w.title) {
            const title = drawGameText(font, [w.title], "#fff");
            title.className = "text";
            place(title, sw.title[0] + 4, sw.title[1]);
            content.appendChild(title);
        }
        const slotCount = w.frame === WindowFrame.Vendor ? VENDOR_SLOTS : CONTAINER_SLOTS[w.frame];
        if (slotCount) {
            for (let i = 0; i < Math.min(slotCount, sw.rows * sw.columns); i++) {
                const line = w.lines[i] ?? null;
                const cell = document.createElement("div");
                cell.className = `slot${line ? "" : " empty"}`;
                const [x, y] = objectPosition(sw, i);
                place(cell, x, y, sw.objDim[0], sw.objDim[1]);
                if (line && !this.slotContent(cell, line))
                    ready = false;
                this.wireSlot(cell, w, i, line);
                content.appendChild(cell);
            }
        }
        else if (w.frame === WindowFrame.OptionList) {
            // Option list: the opening line, then one clickable row per line (WBC 20 + line).
            let y = sw.objOff[1];
            const textWidth = Math.floor((width - sw.objOff[0] - 10) / CHAR_W);
            if (w.opening) {
                const rows = wrapText(w.opening, textWidth);
                const head = drawGameText(font, rows, "#f8d000");
                head.className = "text";
                place(head, sw.objOff[0] + 5, y);
                content.appendChild(head);
                y += rows.length * CHAR_H + 4;
            }
            w.lines.forEach((line, index) => {
                if (!line)
                    return;
                const row = document.createElement("button");
                row.type = "button";
                row.className = "option";
                place(row, sw.objOff[0] + 2, y, width - 2 * sw.objOff[0] - 8, OPTION_ROW_H - 2);
                let textX = 5;
                if (line.graphic > 0) {
                    const icon = this.iconFor(line.graphic, line.tint[3] ? line.tint : null);
                    if (icon.dataset.ready !== "1")
                        ready = false;
                    icon.classList.add("option-icon");
                    row.appendChild(icon);
                    textX = 36;
                }
                const text = drawGameText(font, [line.text.substring(0, Math.floor((width - textX - 24) / CHAR_W))], "#fff");
                text.className = "text";
                place(text, textX, Math.floor((OPTION_ROW_H - 2 - CHAR_H) / 2));
                row.appendChild(text);
                row.addEventListener("click", () => this.session?.windowLineClick(w.id, index));
                content.appendChild(row);
                y += OPTION_ROW_H;
            });
        }
        else {
            // Text windows (QuestWindow / GenericInfoWindow): line N at objoff + N * objH, wrapped
            // to the window width. The opening line, if any, comes first.
            const textWidth = Math.floor((width - sw.objOff[0] - 10) / CHAR_W);
            const lines = [];
            if (w.opening)
                lines.push({ text: w.opening, colour: "#f8d000", graphic: 0, tint: null });
            w.lines.forEach((line) => lines.push(line ? { text: line.text, colour: "#fff", graphic: line.graphic, tint: line.tint } : { text: "", colour: "#fff", graphic: 0, tint: null }));
            let y = sw.objOff[1];
            for (const line of lines) {
                let x = sw.objOff[0] + 5;
                if (line.graphic > 0) {
                    const icon = this.iconFor(line.graphic, line.tint && line.tint[3] ? line.tint : null);
                    if (icon.dataset.ready !== "1")
                        ready = false;
                    icon.classList.add("line-icon");
                    place(icon, x, y);
                    content.appendChild(icon);
                    x += 36;
                }
                const rows = wrapText(line.text, Math.floor((width - x) / CHAR_W));
                if (line.text.trim()) {
                    const text = drawGameText(font, rows, line.colour);
                    text.className = "text";
                    place(text, x, y + (line.graphic > 0 ? 10 : 0));
                    content.appendChild(text);
                }
                y += Math.max(sw.objDim[1] * rows.length, line.graphic > 0 ? 34 : 0);
            }
            void textWidth;
        }
        // Buttons: the flags MKW turned on that this section has a button_<name> position for.
        const buttons = el.querySelector(".skin-buttons");
        buttons.replaceChildren();
        w.buttons.forEach((on, i) => {
            const name = BUTTON_NAMES[i];
            const pos = sw.buttons[name.toLowerCase()];
            const images = this.skin.button(name);
            if (!on || !pos || !images)
                return;
            const b = document.createElement("button");
            b.type = "button";
            b.className = "skin-button";
            b.title = WINDOW_BUTTONS[i] ?? name;
            b.style.backgroundImage = `url("${images[0]}")`;
            b.style.setProperty("--down", `url("${images[1]}")`);
            place(b, pos[0], pos[1]);
            b.addEventListener("click", () => this.session?.windowButton(w.id, i));
            buttons.appendChild(b);
        });
        el.dataset.ready = ready ? "1" : "0";
    }
    scale() {
        const v = Number.parseFloat(getComputedStyle(this.layer).getPropertyValue("--ui-scale"));
        return Number.isFinite(v) && v > 0 ? v : 1;
    }
    // ---- plain look ------------------------------------------------------------------------
    create(w) {
        const el = document.createElement("section");
        el.className = "game-window";
        el.dataset.frame = String(w.frame);
        const key = `frame:${w.frame}`;
        const pos = this.positions.get(key) ?? [16 + this.elements.size * 24, 16 + this.elements.size * 24];
        el.style.left = `${pos[0]}px`;
        el.style.top = `${pos[1]}px`;
        el.addEventListener("pointerdown", () => this.focus(w.id), { capture: true });
        const head = document.createElement("header");
        const title = document.createElement("span");
        title.className = "title";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "close";
        close.textContent = "×";
        close.title = "Close";
        close.addEventListener("click", () => this.session?.windowButton(w.id, 1));
        head.append(title, close);
        this.makeDraggable(el, head, key);
        const body = document.createElement("div");
        body.className = "body";
        const buttons = document.createElement("footer");
        el.append(head, body, buttons);
        return el;
    }
    fill(el, w) {
        el.querySelector(".title").textContent = w.title;
        const body = el.querySelector(".body");
        const key = JSON.stringify([w.frame, w.lines, w.buttons, w.opening]);
        if (el.dataset.key === key && el.dataset.ready === "1")
            return;
        el.dataset.key = key;
        body.replaceChildren();
        let ready = true;
        const slotCount = w.frame === WindowFrame.Vendor ? VENDOR_SLOTS : CONTAINER_SLOTS[w.frame] ?? SLOT_WINDOW_MIN[w.frame];
        if (slotCount) {
            body.className = `body slots${w.frame === WindowFrame.Vendor ? " vendor" : ""}`;
            for (let i = 0; i < Math.max(slotCount, w.lines.length); i++) {
                const line = w.lines[i] ?? null;
                const cell = document.createElement("div");
                cell.className = `slot${line ? "" : " empty"}`;
                if (line && !this.slotContent(cell, line))
                    ready = false;
                this.wireSlot(cell, w, i, line);
                body.appendChild(cell);
            }
            if (w.frame === WindowFrame.Vendor) {
                const hint = document.createElement("p");
                hint.className = "hint";
                hint.textContent = "Double-click to buy · drop an item from your inventory here to sell it";
                body.appendChild(hint);
            }
        }
        else {
            // Quest, information, option lists and anything else: the lines as text, with icons.
            // Option-list lines are clickable (WBC 20 + line); the server closes the list.
            const options = w.frame === WindowFrame.OptionList;
            body.className = `body lines${options ? " options" : ""}`;
            if (w.opening) {
                const head = document.createElement("p");
                head.className = "opening";
                head.textContent = w.opening;
                body.appendChild(head);
            }
            w.lines.forEach((line, index) => {
                if (!line)
                    return;
                const row = document.createElement(options ? "button" : "div");
                if (options) {
                    row.type = "button";
                    row.className = "option";
                    row.addEventListener("click", () => this.session?.windowLineClick(w.id, index));
                }
                if (line.graphic > 0) {
                    const icon = this.iconFor(line.graphic, line.tint[3] ? line.tint : null);
                    if (icon.dataset.ready !== "1")
                        ready = false;
                    row.appendChild(icon);
                }
                const text = document.createElement("span");
                text.textContent = line.text;
                row.appendChild(text);
                body.appendChild(row);
            });
        }
        el.dataset.ready = ready ? "1" : "0";
        const footer = el.querySelector("footer");
        footer.replaceChildren();
        w.buttons.forEach((on, i) => {
            if (!on || i === 1)
                return; // Close is the × in the title bar
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = WINDOW_BUTTONS[i] ?? `Button ${i + 1}`;
            b.addEventListener("click", () => this.session?.windowButton(w.id, i));
            footer.appendChild(b);
        });
        footer.hidden = footer.childElementCount === 0;
    }
    makeDraggable(el, handle, key) {
        draggable(el, handle, (x, y) => this.positions.set(key, [x, y]));
    }
    /** Brings a client-side skinned window (character, buffs) to the front like a server one. */
    bringToFront(el) {
        this.zTop++;
        el.style.zIndex = String(this.zTop);
        for (const other of this.layer.querySelectorAll(".game-window"))
            other.classList.toggle("focused", other === el);
    }
}
/** Drags `el` by `handle`; buttons, slots and option rows keep their own clicks and drags. */
export function draggable(el, handle, moved) {
    handle.addEventListener("pointerdown", (ev) => {
        const target = ev.target;
        if (target.closest("button, .slot"))
            return;
        const startX = ev.clientX, startY = ev.clientY;
        const left = el.offsetLeft, top = el.offsetTop;
        handle.setPointerCapture(ev.pointerId);
        const move = (e) => {
            const x = Math.max(0, left + e.clientX - startX);
            const y = Math.max(0, top + e.clientY - startY);
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            moved?.(x, y);
        };
        const up = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", up);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
    });
}
export function place(el, x, y, w, h) {
    el.style.position = "absolute";
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    if (w !== undefined)
        el.style.width = `${w}px`;
    if (h !== undefined)
        el.style.height = `${h}px`;
}
