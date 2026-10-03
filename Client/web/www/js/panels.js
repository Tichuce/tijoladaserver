// Side panels: vitals, auto-hunt button, buffs, inventory, spellbook and the 1-0 hotkey
// bar. Plain DOM, drawn from Session state; every action goes to the server through the
// existing packets (USE, CAST, /autohunt). Nothing here decides game state.
import { statusLabel } from "./autohuntconfig.js";
import { AutoHuntView } from "./autohuntview.js";
import { dropTarget, setDrag } from "./dnd.js";
import { EQUIP_SLOTS, INVENTORY_SLOTS, SPELL_SLOTS } from "./session.js";
import { CHAR_H, CHAR_W, FONT_SHEET, coords, drawGameText, objectPosition } from "./skin.js";
import { draggable } from "./windows.js";
import { setTip } from "./tooltip.js";
/**
 * Paper-doll positions of the 13 character-window slots ([Character] equipN in the skin's
 * Window.ini, Maisemore). Slot 14, if the server uses it, goes underneath.
 */
const EQUIP_LAYOUT = [
    [14, 89], [150, 89], [83, 19], [83, 89], [83, 124], [83, 159], [48, 54],
    [48, 124], [116, 54], [116, 124], [83, 54], [116, 89], [48, 89], [150, 159],
];
const HOTKEYS = 10;
const ICON = 32;
const $ = (id) => document.getElementById(id);
export class Panels {
    constructor(assets) {
        this.assets = assets;
        this.session = null;
        this.hotkeys = new Array(HOTKEYS).fill(null);
        this.hotkeyKey = "";
        this.dirty = true;
        this.inventoryGrid = $("inventory");
        this.spellGrid = $("spells");
        this.hotbar = $("hotbar");
        this.buffRow = $("buffs");
        this.autoHuntButton = $("autohunt");
        this.autoHuntStatus = $("autohunt-status");
        this.equipDoll = $("equipment");
        this.partyBox = $("party");
        this.classic = false;
        this.skin = null;
        this.group = null;
        this.equipCells = [];
        this.layer = null;
        this.windows = null;
        /** Classic look: the floating character window ([Character]) and buff bar ([SpellEffects]). */
        this.characterWindow = null;
        this.characterOpen = false;
        this.characterLabels = "";
        this.buffWindow = null;
        this.buildGrid(this.inventoryGrid, INVENTORY_SLOTS, "item");
        this.buildGrid(this.spellGrid, SPELL_SLOTS, "spell");
        this.buildEquipment();
        this.buildHotbar();
        for (const tab of document.querySelectorAll(".tabs button")) {
            tab.addEventListener("click", () => this.showTab(tab.dataset.tab));
        }
        // The tabs are drop targets too, so items can move between panels that are not shown
        // together: drop on "Equip" to wear an item, on "Inventory" to take it off / take it out.
        dropTarget(document.querySelector('.tabs button[data-tab="equipment"]'), (payload) => {
            if (payload.type === "item")
                this.session?.moveItem(payload.place, { kind: "equipment", slot: 0 });
        });
        dropTarget(document.querySelector('.tabs button[data-tab="inventory"]'), (payload) => {
            if (payload.type !== "item" || !this.session)
                return;
            const free = this.session.inventory.findIndex((item) => item === null);
            this.session.moveItem(payload.place, { kind: "inventory", slot: free >= 0 ? free : 0 });
        });
        this.autoHuntView = new AutoHuntView({
            save: (settings) => this.session?.saveAutoHuntSettings(settings),
            refresh: () => this.session?.syncAutoHunt(),
            toggle: () => this.session?.toggleAutoHunt(),
            stop: () => this.session?.stopAutoHunt(),
            close: () => { this.autoHuntView.root.hidden = true; },
            icon: (graphic) => this.icon(graphic, null),
        });
        $("autohunt-settings").addEventListener("click", () => {
            if (this.autoHuntView.isOpen)
                this.autoHuntView.root.hidden = true;
            else {
                this.autoHuntView.open();
                this.dirty = true;
            }
        });
        this.autoHuntButton.addEventListener("click", () => this.session?.toggleAutoHunt());
        this.autoHuntButton.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            this.session?.stopAutoHunt();
        });
        // Icons appear as their sheets arrive.
        assets.onSheetLoaded(() => {
            this.dirty = true;
            this.autoHuntView.refreshIcons();
        });
    }
    attach(session, characterName, realm) {
        this.session = session;
        this.autoHuntView.reset();
        this.hotkeyKey = `aspereta.hotkeys.${realm}.${characterName.toLowerCase()}`;
        this.hotkeys = this.loadHotkeys();
        this.dirty = true;
    }
    changed() {
        this.dirty = true;
    }
    /**
     * Classic look: the inventory, spellbook, hotkey bar, vital bars and party use the skin's
     * own bitmaps and Window.ini layout ([Inventory], [SpellBook], [HotButtons], [HPbar]...,
     * [Group]); off, or without a converted skin, the plain look.
     */
    /** Where the classic look's floating windows go (the server windows' layer). */
    useWindowLayer(layer, windows) {
        this.layer = layer;
        this.windows = windows;
        const view = this.autoHuntView.root;
        if (!view.parentElement) {
            view.style.left = "16px";
            view.style.top = "16px";
            layer.appendChild(view);
            draggable(view, this.autoHuntView.handle);
        }
    }
    setLook(skin, classic) {
        this.classic = classic && !!skin;
        this.skin = this.classic ? skin : null;
        const use = (el, section) => {
            const sw = this.classic ? skin.window(section) : null;
            const size = sw ? skin.size(section) : null;
            el.classList.toggle("skinned", !!(sw && size));
            if (!sw || !size) {
                for (const prop of ["--skin-image", "--skin-w", "--skin-h", "--obj-x", "--obj-y", "--obj-w", "--obj-h", "--cols", "--bar-image"])
                    el.style.removeProperty(prop);
                return;
            }
            el.style.setProperty("--skin-image", `url("${skin.image(sw.image)}")`);
            el.style.setProperty("--skin-w", `${size[0]}px`);
            el.style.setProperty("--skin-h", `${size[1]}px`);
            el.style.setProperty("--obj-x", `${sw.objOff[0]}px`);
            el.style.setProperty("--obj-y", `${sw.objOff[1]}px`);
            el.style.setProperty("--obj-w", `${sw.objDim[0]}px`);
            el.style.setProperty("--obj-h", `${sw.objDim[1]}px`);
            el.style.setProperty("--cols", String(sw.columns));
            if (sw.image2)
                el.style.setProperty("--bar-image", `url("${skin.image(sw.image2)}")`);
        };
        use(this.inventoryGrid, "Inventory");
        use(this.spellGrid, "SpellBook");
        use(this.hotbar, "HotButtons");
        use(this.partyBox, "Group");
        for (const [id, section] of [["hp", "HPbar"], ["mp", "MPbar"], ["sp", "SPbar"], ["xp", "XPbar"]])
            use($(`${id}-fill`).parentElement, section);
        this.group = this.classic ? skin.window("Group") : null;
        document.body.classList.toggle("classic", this.classic);
        this.buildCharacterWindow();
        this.buildBuffWindow();
        this.dirty = true;
    }
    /** Classic look: Equip / Stats (and E, C) open and close the character window instead. */
    showTab(name) {
        if (this.characterWindow && (name === "equipment" || name === "stats")) {
            this.toggleCharacter();
            return;
        }
        for (const tab of document.querySelectorAll(".tabs button"))
            tab.classList.toggle("active", tab.dataset.tab === name);
        for (const panel of document.querySelectorAll(".tab-panel"))
            panel.hidden = panel.id !== name;
    }
    /** Number keys 1-0 use the matching hotkey (HotkeyBarWindow). */
    useHotkey(index) {
        const link = this.hotkeys[index];
        if (!link || !this.session)
            return;
        if (link.kind === "item")
            this.session.useItem(link.slot);
        else
            this.session.castSpell(link.slot);
    }
    /** Called once per frame; redraws only when something changed. */
    render() {
        if (!this.dirty)
            return;
        this.dirty = false;
        const s = this.session;
        // Vitals and character summary.
        const st = s?.status;
        $("char-name").textContent = s?.world?.player?.displayName ?? "";
        $("char-class").textContent = st ? `Level ${st.level} ${st.className}` : "";
        setBar("hp", st?.hp ?? 0, st?.maxHp ?? 0);
        setBar("mp", st?.mp ?? 0, st?.maxMp ?? 0);
        setBar("sp", st?.sp ?? 0, st?.maxSp ?? 0);
        const xp = s?.experience;
        const xpFill = $("xp-fill");
        xpFill.style.width = `${xp?.percent ?? 0}%`;
        xpFill.style.setProperty("--pct", String((xp?.percent ?? 0) / 100));
        const xpFull = xp ? `${xp.percent}% · ${xp.toNextLevel.toLocaleString()} to level` : "";
        // The skinned bar only has room for the percentage; the rest is in its tooltip.
        $("xp-text").textContent = xp && this.classic ? `${xp.percent}%` : xpFull;
        xpFill.parentElement.title = xpFull;
        $("gold").textContent = st ? st.gold.toLocaleString() : "0";
        $("stats").innerHTML = st ? statsTable(st) : "";
        // Auto-hunt button: the state the server last reported.
        const ah = s?.autoHunt;
        const state = ah?.state ?? "off";
        this.autoHuntButton.dataset.state = state;
        this.autoHuntButton.classList.toggle("pending", !!ah?.pending);
        this.autoHuntButton.textContent = `Auto-hunt ${state.toUpperCase()}`;
        const live = s?.autoHuntStatus ?? { state: "off", detail: "" };
        this.autoHuntStatus.hidden = state === "off" || !s?.autoHuntConfig;
        this.autoHuntStatus.dataset.state = live.state;
        this.autoHuntStatus.textContent = live.detail ? `${statusLabel(live.state)} · ${live.detail}` : statusLabel(live.state);
        if (this.autoHuntView.isOpen)
            this.autoHuntView.update(s?.autoHuntConfig ?? null, live, state);
        // Party: shown while in a group; clicking a member picks them while targeting a spell.
        const members = (s?.party ?? []).filter((m) => !!m);
        this.partyBox.hidden = members.length === 0;
        if (this.group) {
            this.renderSkinnedParty(this.group);
        }
        else
            this.partyBox.replaceChildren(...members.map((m) => {
                const row = document.createElement("div");
                row.className = "member";
                row.title = s?.targeting ? "Click to target" : m.name;
                const name = document.createElement("b");
                name.textContent = m.name;
                const info = document.createElement("span");
                info.textContent = m.level ? `${m.level} ${m.className}` : m.className;
                const bars = document.createElement("div");
                bars.className = "bars";
                bars.innerHTML = `<i class="hp"><i style="width:${clamp(m.hp)}%"></i></i><i class="mp"><i style="width:${clamp(m.mp)}%"></i></i>`;
                row.append(name, info, bars);
                row.addEventListener("click", () => {
                    if (s?.targeting)
                        s.pickTarget(m.loginId);
                });
                return row;
            }));
        // Buffs: double-click removes one, if the server allows it for that buff (KBUF).
        this.buffRow.replaceChildren();
        if (this.buffWindow)
            this.renderBuffWindow(this.buffWindow);
        else
            (s?.buffs ?? []).forEach((buff, slot) => {
                if (!buff)
                    return;
                const icon = this.icon(buff.graphic, null);
                setTip(icon, buff.name);
                icon.addEventListener("dblclick", () => this.session?.killBuff(slot));
                this.buffRow.appendChild(icon);
            });
        if (this.characterWindow)
            this.renderCharacterLabels(this.characterWindow);
        // Inventory and spellbook.
        for (let i = 0; i < INVENTORY_SLOTS; i++) {
            const item = s?.inventory[i] ?? null;
            const cell = this.inventoryGrid.children[i];
            this.fillCell(cell, item ? item.graphic : 0, item?.tint[3] ? item.tint : null, item?.name ?? "", item && item.stack > 1 ? String(item.stack) : "");
        }
        for (let i = 0; i < SPELL_SLOTS; i++) {
            const spell = s?.spells[i] ?? null;
            const cell = this.spellGrid.children[i];
            this.fillCell(cell, spell?.graphic ?? 0, null, spell?.name ?? "", "");
        }
        for (let i = 0; i < EQUIP_SLOTS; i++) {
            const line = s?.equipment[i] ?? null;
            const cell = this.equipCells[i];
            this.fillCell(cell, line?.graphic ?? 0, line?.tint[3] ? line.tint : null, line?.text ?? "", "");
        }
        // Hotkeys follow whatever is in the linked slot now.
        for (let i = 0; i < HOTKEYS; i++) {
            const link = this.hotkeys[i];
            const cell = this.hotbar.children[i];
            if (link?.kind === "item") {
                const item = s?.inventory[link.slot] ?? null;
                this.fillCell(cell, item?.graphic ?? 0, item?.tint[3] ? item.tint : null, item?.name ?? "", item && item.stack > 1 ? String(item.stack) : "");
            }
            else if (link?.kind === "spell") {
                const spell = s?.spells[link.slot] ?? null;
                this.fillCell(cell, spell?.graphic ?? 0, null, spell?.name ?? "", "");
            }
            else {
                this.fillCell(cell, 0, null, "", "");
            }
        }
    }
    /**
     * PartyWindow.Render: the name at objoff + 6, line N lower by objH, with a 1px HP bar
     * (green) and MP bar (blue) of up to 100px under it.
     */
    renderSkinnedParty(sw) {
        const s = this.session;
        const font = this.assets.sheet(FONT_SHEET);
        if (!font)
            this.dirty = true;
        const nodes = [];
        (s?.party ?? []).forEach((m, line) => {
            if (!m || line >= sw.rows * sw.columns)
                return;
            const x = sw.objOff[0] + 6, y = sw.objOff[1] + line * sw.objDim[1];
            const row = document.createElement("div");
            row.className = "member";
            row.title = s?.targeting ? "Click to target" : `${m.name}${m.level ? ` · ${m.level} ${m.className}` : ""}`;
            Object.assign(row.style, { left: `${x}px`, top: `${y}px`, width: `${sw.objDim[0] - 6}px`, height: `${sw.objDim[1]}px` });
            row.appendChild(drawGameText(font, [m.name], "#fff"));
            const bars = document.createElement("div");
            bars.className = "bars";
            Object.assign(bars.style, { left: `${CHAR_W}px`, top: `${CHAR_H}px` });
            bars.innerHTML = `<i class="hp" style="width:${clamp(m.hp)}px"></i><i class="mp" style="width:${clamp(m.mp)}px"></i>`;
            row.appendChild(bars);
            row.addEventListener("click", () => {
                if (s?.targeting)
                    s.pickTarget(m.loginId);
            });
            nodes.push(row);
        });
        this.partyBox.replaceChildren(...nodes);
    }
    // ---- classic look: character window and buff bar -----------------------------------
    /** A floating window on a skin bitmap, in the server windows' layer. */
    skinnedWindow(section, size, where) {
        const el = document.createElement("section");
        el.className = "game-window skinned client-window";
        el.dataset.section = section.name;
        el.style.width = `${size[0]}px`;
        el.style.height = `${size[1]}px`;
        el.style.backgroundImage = `url("${this.skin.image(section.image)}")`;
        el.style.setProperty("--unfocused", String(section.alpha[0] / 255));
        el.style.setProperty("--focused", String(section.alpha[1] / 255));
        el.dataset.where = where;
        el.addEventListener("pointerdown", () => this.windows?.bringToFront(el), { capture: true });
        draggable(el, el);
        const content = document.createElement("div");
        content.className = "content";
        el.appendChild(content);
        if (section.closeBox) {
            const [bx, by, bw, bh] = section.closeBox;
            const box = document.createElement("button");
            box.type = "button";
            box.className = "close-box";
            box.title = "Close";
            Object.assign(box.style, { left: `${bx}px`, top: `${by}px`, width: `${bw}px`, height: `${bh}px` });
            el.appendChild(box);
        }
        return el;
    }
    /** First time a floating window is shown: centred, or top-right (the layer has a size then). */
    placeOnce(el) {
        if (el.dataset.placed || !this.layer || this.layer.clientWidth === 0)
            return;
        const layer = this.layer;
        const scale = Number.parseFloat(getComputedStyle(layer).getPropertyValue("--ui-scale")) || 1;
        const w = el.offsetWidth * scale, h = el.offsetHeight * scale;
        const centre = el.dataset.where === "centre";
        el.style.left = `${Math.max(0, Math.round(centre ? (layer.clientWidth - w) / 2 : layer.clientWidth - w - 8))}px`;
        el.style.top = `${Math.max(0, Math.round(centre ? (layer.clientHeight - h) / 2 : 8))}px`;
        el.dataset.placed = "1";
    }
    /**
     * CharacterWindow: the paper doll at objoff + equipN and the stat labels at their keys, on
     * Character.bmp. The equipment cells are the same ones the plain look uses, moved here.
     */
    buildCharacterWindow() {
        this.characterWindow?.remove();
        this.characterWindow = null;
        this.characterLabels = "";
        const section = this.skin?.window("Character");
        const size = section ? this.skin.size("Character") : null;
        if (!section || !size || !this.layer) {
            // Plain look: the cells go back to the side panel's paper doll.
            this.equipCells.forEach((cell, i) => {
                const [x, y] = EQUIP_LAYOUT[i] ?? [14 + (i % 5) * 34, 200];
                Object.assign(cell.style, { left: `${x}px`, top: `${y}px`, width: "", height: "", display: "" });
                this.equipDoll.appendChild(cell);
            });
            return;
        }
        const el = this.skinnedWindow(section, size, "centre");
        el.classList.add("character");
        el.hidden = !this.characterOpen;
        el.querySelector(".close-box")?.addEventListener("click", () => this.toggleCharacter(false));
        // Maisemore's [Character] cboff (184,4) is not where its bitmap paints the X (top right),
        // so the painted X closes the window too.
        const x = document.createElement("button");
        x.type = "button";
        x.className = "close-box";
        x.title = "Close";
        Object.assign(x.style, { left: `${size[0] - 18}px`, top: "1px", width: "14px", height: "12px" });
        x.addEventListener("click", () => this.toggleCharacter(false));
        el.appendChild(x);
        const content = el.querySelector(".content");
        this.equipCells.forEach((cell, i) => {
            const at = coords(section.raw[`equip${i + 1}`], 2);
            if (!at || i >= section.rows * section.columns) {
                cell.style.display = "none"; // slots this skin has no place for (BaseWindow ignores them)
                content.appendChild(cell);
                return;
            }
            Object.assign(cell.style, {
                left: `${section.objOff[0] + at[0]}px`, top: `${section.objOff[1] + at[1]}px`,
                width: `${section.objDim[0]}px`, height: `${section.objDim[1]}px`, display: "",
            });
            content.appendChild(cell);
        });
        const labels = document.createElement("div");
        labels.className = "labels";
        content.appendChild(labels);
        dropTarget(el, (payload) => {
            if (payload.type === "item")
                this.session?.moveItem(payload.place, { kind: "equipment", slot: 0 });
        });
        this.layer.appendChild(el);
        this.characterWindow = el;
    }
    toggleCharacter(open = !this.characterOpen) {
        this.characterOpen = open;
        if (!this.characterWindow)
            return;
        this.characterWindow.hidden = !open;
        if (open) {
            this.placeOnce(this.characterWindow);
            this.windows?.bringToFront(this.characterWindow);
        }
        this.dirty = true;
    }
    renderCharacterLabels(el) {
        const section = this.skin?.window("Character");
        const st = this.session?.status;
        if (!section)
            return;
        const values = st ? {
            name: this.session?.world?.player?.name ?? "", guild: st.guild, level: String(st.level), class: st.className,
            hp: `${st.hp}/${st.maxHp}`, mp: `${st.mp}/${st.maxMp}`, sp: `${st.sp}/${st.maxSp}`,
            tnl: String(this.session?.experience.experience ?? 0), gold: String(st.gold),
            strength: String(st.str), stamina: String(st.sta), intelligence: String(st.int), dexterity: String(st.dex), ac: String(st.ac),
            // SNF resist order is fire, water, earth, air, spirit.
            fire: String(st.resists[0]), water: String(st.resists[1]), earth: String(st.resists[2]), air: String(st.resists[3]), spirit: String(st.resists[4]),
        } : {};
        const font = this.assets.sheet(FONT_SHEET);
        const key = JSON.stringify([values, !!font]);
        if (key === this.characterLabels)
            return;
        if (!font)
            this.dirty = true;
        else
            this.characterLabels = key;
        const labels = el.querySelector(".labels");
        labels.replaceChildren();
        for (const [name, text] of Object.entries(values)) {
            const at = coords(section.raw[name], 2);
            if (!at || !text)
                continue;
            const canvas = drawGameText(font, [text], "rgb(248,208,0)");
            canvas.className = "text";
            Object.assign(canvas.style, { position: "absolute", left: `${at[0] + 6}px`, top: `${at[1]}px` });
            labels.appendChild(canvas);
        }
    }
    /** BuffBarWindow ([SpellEffects]): shown while there are buffs; double-click removes one. */
    buildBuffWindow() {
        this.buffWindow?.remove();
        this.buffWindow = null;
        const section = this.skin?.window("SpellEffects");
        const size = section ? this.skin.size("SpellEffects") : null;
        this.buffRow.hidden = !!(section && size && this.layer);
        if (!section || !size || !this.layer)
            return;
        const el = this.skinnedWindow(section, size, "top-right");
        el.classList.add("buffs");
        el.hidden = true;
        this.layer.appendChild(el);
        this.buffWindow = el;
    }
    renderBuffWindow(el) {
        const section = this.skin?.window("SpellEffects");
        if (!section)
            return;
        const buffs = this.session?.buffs ?? [];
        el.hidden = !buffs.some((b) => b);
        if (!el.hidden)
            this.placeOnce(el);
        const content = el.querySelector(".content");
        content.replaceChildren();
        buffs.forEach((buff, slot) => {
            if (!buff || slot >= section.rows * section.columns)
                return;
            const cell = document.createElement("div");
            cell.className = "slot";
            const [x, y] = objectPosition(section, slot);
            Object.assign(cell.style, { position: "absolute", left: `${x}px`, top: `${y}px`, width: `${section.objDim[0]}px`, height: `${section.objDim[1]}px` });
            const icon = this.icon(buff.graphic, null);
            if (icon.dataset.ready !== "1")
                this.dirty = true;
            cell.appendChild(icon);
            setTip(cell, buff.name);
            cell.addEventListener("dblclick", () => this.session?.killBuff(slot));
            content.appendChild(cell);
        });
    }
    buildGrid(grid, count, kind) {
        for (let i = 0; i < count; i++) {
            const cell = document.createElement("div");
            cell.className = "slot";
            cell.draggable = true;
            cell.addEventListener("dblclick", () => {
                if (kind === "item")
                    this.session?.useItem(i);
                else
                    this.session?.castSpell(i);
            });
            cell.addEventListener("dragstart", (ev) => {
                if (kind === "item")
                    setDrag(ev, { type: "item", place: { kind: "inventory", slot: i } });
                else
                    setDrag(ev, { type: "spell", slot: i });
            });
            if (kind === "item") {
                cell.addEventListener("contextmenu", (ev) => {
                    ev.preventDefault();
                    const item = this.session?.inventory[i];
                    if (item)
                        this.session?.itemDetails(item.itemId);
                });
                // Inventory to inventory moves (Ctrl splits a stack); also windows and the paper doll.
                dropTarget(cell, (payload, ctrl) => {
                    if (payload.type === "item")
                        this.session?.moveItem(payload.place, { kind: "inventory", slot: i }, ctrl);
                });
            }
            grid.appendChild(cell);
        }
    }
    buildEquipment() {
        for (let i = 0; i < EQUIP_SLOTS; i++) {
            const cell = document.createElement("div");
            cell.className = "slot";
            cell.draggable = true;
            const [x, y] = EQUIP_LAYOUT[i] ?? [14 + (i % 5) * 34, 200];
            cell.style.left = `${x}px`;
            cell.style.top = `${y}px`;
            cell.addEventListener("dblclick", () => this.session?.unequip(i));
            cell.addEventListener("contextmenu", (ev) => {
                ev.preventDefault();
                const line = this.session?.equipment[i];
                if (line)
                    this.session?.itemDetails(line.itemId);
            });
            cell.addEventListener("dragstart", (ev) => setDrag(ev, { type: "item", place: { kind: "equipment", slot: i } }));
            dropTarget(cell, (payload) => {
                if (payload.type === "item")
                    this.session?.moveItem(payload.place, { kind: "equipment", slot: i });
            });
            this.equipDoll.appendChild(cell);
            this.equipCells.push(cell);
        }
        // Dropping anywhere on the doll equips too.
        dropTarget(this.equipDoll, (payload) => {
            if (payload.type === "item")
                this.session?.moveItem(payload.place, { kind: "equipment", slot: 0 });
        });
    }
    buildHotbar() {
        for (let i = 0; i < HOTKEYS; i++) {
            const cell = document.createElement("div");
            cell.className = "slot hotkey";
            cell.dataset.key = String((i + 1) % 10);
            cell.addEventListener("dblclick", () => this.useHotkey(i));
            cell.addEventListener("contextmenu", (ev) => {
                ev.preventDefault();
                this.hotkeys[i] = null;
                this.saveHotkeys();
            });
            dropTarget(cell, (payload) => {
                if (payload.type === "spell")
                    this.hotkeys[i] = { kind: "spell", slot: payload.slot };
                else if (payload.place.kind === "inventory")
                    this.hotkeys[i] = { kind: "item", slot: payload.place.slot };
                else
                    return;
                this.saveHotkeys();
            });
            this.hotbar.appendChild(cell);
        }
    }
    fillCell(cell, graphic, tint, title, badge) {
        const key = `${graphic}|${tint?.join(",") ?? ""}|${badge}`;
        setTip(cell, graphic > 0 ? title : null);
        cell.classList.toggle("empty", graphic <= 0);
        if (cell.dataset.drawn === key && cell.dataset.ready === "1")
            return;
        cell.dataset.drawn = key;
        cell.querySelectorAll("canvas, .badge").forEach((e) => e.remove());
        if (graphic <= 0) {
            cell.dataset.ready = "1";
            return;
        }
        const icon = this.icon(graphic, tint);
        cell.dataset.ready = icon.dataset.ready ?? "0";
        cell.prepend(icon);
        if (badge) {
            const b = document.createElement("span");
            b.className = "badge";
            b.textContent = badge;
            cell.appendChild(b);
        }
    }
    icon(graphic, tint) {
        const canvas = document.createElement("canvas");
        canvas.width = ICON;
        canvas.height = ICON;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const d = this.assets.drawable(graphic, tint);
        canvas.dataset.ready = d ? "1" : "0";
        if (d) {
            // Centre, scaling down anything larger than a slot.
            const scale = Math.min(1, ICON / Math.max(d.w, d.h));
            const w = Math.round(d.w * scale), h = Math.round(d.h * scale);
            ctx.drawImage(d.source, d.sx, d.sy, d.w, d.h, (ICON - w) >> 1, (ICON - h) >> 1, w, h);
        }
        return canvas;
    }
    loadHotkeys() {
        try {
            const raw = localStorage.getItem(this.hotkeyKey);
            const parsed = raw ? JSON.parse(raw) : null;
            if (Array.isArray(parsed))
                return Array.from({ length: HOTKEYS }, (_, i) => parsed[i] ?? null);
        }
        catch { /* storage unavailable */ }
        return new Array(HOTKEYS).fill(null);
    }
    saveHotkeys() {
        this.dirty = true;
        try {
            localStorage.setItem(this.hotkeyKey, JSON.stringify(this.hotkeys));
        }
        catch { /* storage unavailable */ }
    }
}
function clamp(v) {
    return Math.max(0, Math.min(100, Math.round(v)));
}
function setBar(id, value, max) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    const fill = $(`${id}-fill`);
    fill.style.width = `${pct}%`;
    fill.style.setProperty("--pct", String(pct / 100));
    $(`${id}-text`).textContent = max > 0 ? `${value.toLocaleString()} / ${max.toLocaleString()}` : "";
}
function statsTable(st) {
    const rows = [
        ["Guild", st.guild || "—"],
        ["Strength", st.str], ["Stamina", st.sta], ["Intelligence", st.int], ["Dexterity", st.dex],
        ["Armor", st.ac],
        ["Fire / Water", `${st.resists[0]} / ${st.resists[1]}`],
        ["Earth / Air", `${st.resists[2]} / ${st.resists[3]}`],
        ["Spirit", st.resists[4]],
    ];
    return rows.map(([k, v]) => `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(String(v))}</b></div>`).join("");
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
