import { MAX_DISTANCE, MAX_ENTRIES, MAX_RANGE, TAUNT_SLOTS, addEntry, candidates, describeSpell, isArea, isGroup, monsterMode, moveEntry, nextMonsterMode, normalizeSettings, removeEntry, setMonsterMode, setTauntSlot, spellFor, statusLabel, tauntOptions, } from "./autohuntconfig.js";
const TABS = [
    ["atk", "AS", "Attack spells"],
    ["buf", "BS", "Buff spells"],
    ["heal", "HS", "Healing spells"],
    ["mt", "MT", "Monster Taunt"],
];
const MODE_LABELS = { normal: "Normal", priority: "Priority", ignore: "Ignore" };
const SAVE_DELAY_MS = 500;
function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className)
        e.className = className;
    if (text !== undefined)
        e.textContent = text;
    return e;
}
function button(text, title, onClick, className) {
    const b = el("button", className, text);
    b.type = "button";
    b.title = title;
    b.addEventListener("click", onClick);
    return b;
}
export class AutoHuntView {
    constructor(actions) {
        this.actions = actions;
        this.statusDot = el("span", "ah-dot");
        this.statusText = el("span", "ah-state");
        this.statusDetail = el("span", "ah-detail");
        this.tabBar = el("div", "ah-tabs");
        this.body = el("div", "ah-body");
        this.saved = el("span", "ah-saved");
        this.tab = "atk";
        this.config = null;
        this.settings = null;
        this.spellsKey = "";
        this.saveTimer = null;
        this.root = el("section", "game-window auto-hunt");
        this.root.hidden = true;
        this.handle = el("header");
        this.handle.append(el("span", "title", "Auto-Hunt"), button("×", "Close", () => this.actions.close(), "close"));
        const status = el("div", "ah-status");
        status.append(this.statusDot, this.statusText, this.statusDetail);
        for (const [key, short, long] of TABS) {
            const b = button(short, long, () => this.showTab(key));
            b.dataset.tab = key;
            b.append(el("small", undefined, long.replace(" spells", "").replace("Monster ", "")));
            this.tabBar.appendChild(b);
        }
        const footer = el("footer");
        this.runButton = button("Start", "Start or pause auto-hunt", () => this.actions.toggle());
        footer.append(this.saved, this.runButton, button("Stop", "Stop auto-hunt", () => this.actions.stop()));
        this.root.append(this.handle, status, this.tabBar, this.body, footer);
        this.showTab("atk");
    }
    open() {
        this.root.hidden = false;
        this.actions.refresh();
    }
    reset() {
        if (this.saveTimer !== null)
            window.clearTimeout(this.saveTimer);
        this.saveTimer = null;
        this.config = null;
        this.settings = null;
        this.spellsKey = "";
        this.saved.textContent = "";
        this.body.replaceChildren(el("p", "ah-note", "Loading your spells…"));
    }
    refreshIcons() {
        if (this.isOpen && this.body.querySelector('canvas[data-ready="0"]'))
            this.render();
    }
    get isOpen() {
        return !this.root.hidden;
    }
    update(config, status, running) {
        this.statusDot.dataset.state = status.state;
        this.statusText.textContent = statusLabel(status.state);
        this.statusDetail.textContent = status.detail;
        this.runButton.textContent = running === "on" ? "Pause" : running === "paused" ? "Resume" : "Start";
        if (!config) {
            if (!this.config)
                this.body.replaceChildren(el("p", "ah-note", "Loading your spells…"));
            return;
        }
        if (config === this.config)
            return;
        const spellsKey = config.spells.map((s) => `${s.slot}:${s.id}:${s.ok ? 1 : 0}`).join(",") + "|" +
            config.mobs.map((m) => `${m.tid}:${m.n}`).join(",");
        const incoming = normalizeSettings(structuredClone(config.cfg));
        const same = !!this.settings && JSON.stringify(incoming) === JSON.stringify(this.settings) && spellsKey === this.spellsKey;
        this.config = config;
        if (this.saveTimer !== null || same)
            return;
        this.settings = incoming;
        this.spellsKey = spellsKey;
        this.render();
    }
    showTab(tab) {
        if (tab === "mt" && this.tab !== "mt" && this.isOpen)
            this.actions.refresh();
        this.tab = tab;
        for (const b of this.tabBar.querySelectorAll("button"))
            b.classList.toggle("active", b.dataset.tab === tab);
        this.render();
    }
    changed(rerender = false) {
        if (rerender)
            this.render();
        this.saved.textContent = "Saving…";
        if (this.saveTimer !== null)
            window.clearTimeout(this.saveTimer);
        this.saveTimer = window.setTimeout(() => {
            this.saveTimer = null;
            if (this.settings)
                this.actions.save(this.settings);
            this.saved.textContent = "Saved";
        }, SAVE_DELAY_MS);
    }
    render() {
        const config = this.config;
        const settings = this.settings;
        if (!config || !settings)
            return;
        if (this.tab === "mt") {
            this.body.replaceChildren(...this.tauntTab(config, settings));
            return;
        }
        const nodes = [];
        if (this.tab === "atk")
            nodes.push(this.positioning(settings));
        const list = settings[this.tab];
        const rows = el("ol", "ah-list");
        list.forEach((entry, index) => rows.appendChild(this.row(config, settings, entry, index)));
        if (list.length === 0)
            rows.appendChild(el("li", "ah-empty", this.emptyText()));
        nodes.push(rows);
        nodes.push(this.adder(config, settings));
        this.body.replaceChildren(...nodes);
    }
    emptyText() {
        if (this.tab === "atk")
            return "No attack spells: auto-hunt fights in melee.";
        if (this.tab === "buf")
            return "No buffs: auto-hunt will not cast any.";
        return "No heals: auto-hunt will not heal.";
    }
    positioning(settings) {
        const box = el("fieldset", "ah-position");
        box.appendChild(el("legend", undefined, "Distance (tiles)"));
        const melee = el("input");
        melee.type = "checkbox";
        melee.checked = settings.melee;
        const meleeLabel = el("label", "ah-check");
        meleeLabel.append(melee, el("span", undefined, "Melee when no spell is ready"));
        const keep = this.slider("Keep within", settings.max, 1, MAX_DISTANCE, (v) => {
            settings.max = v;
            if (settings.min > v) {
                settings.min = v;
                min.set(v);
            }
            this.changed();
        }, (v) => `${v} ${v === 1 ? "tile" : "tiles"}`);
        const min = this.slider("Stay at least", settings.min, 0, MAX_DISTANCE, (v) => {
            settings.min = Math.min(v, settings.max);
            if (settings.min !== v)
                min.set(settings.min);
            this.changed();
        }, (v) => (v === 0 ? "off" : `${v} ${v === 1 ? "tile" : "tiles"}`));
        const sync = () => {
            keep.row.hidden = settings.melee;
            min.row.hidden = settings.melee;
        };
        melee.addEventListener("change", () => {
            settings.melee = melee.checked;
            if (!settings.melee && settings.max < 2) {
                settings.max = 5;
                keep.set(5);
            }
            sync();
            this.changed();
        });
        sync();
        box.append(meleeLabel, keep.row, min.row);
        return box;
    }
    tauntTab(config, settings) {
        const mt = settings.mt;
        const nodes = [];
        const head = el("div", "ah-mt-head");
        head.append(this.checkbox("Auto-Taunt", mt.on, (v) => { mt.on = v; this.changed(true); }), this.checkbox("Progressive Pull", mt.pull, (v) => { mt.pull = v; this.changed(true); }));
        nodes.push(head);
        const slots = el("fieldset", "ah-slots");
        slots.appendChild(el("legend", undefined, "Taunt spells (slot 1, then slot 2)"));
        for (const area of [false, true]) {
            const options = tauntOptions(config, area);
            const chosen = area ? mt.area : mt.st;
            const row = el("div", "ah-slot-row");
            row.appendChild(el("span", "ah-slot-label", area ? "Area" : "Single"));
            for (let i = 0; i < TAUNT_SLOTS; i++)
                row.appendChild(this.tauntSlot(config, settings, area, i, chosen[i] ?? 0, options));
            slots.appendChild(row);
            if (options.length === 0)
                slots.appendChild(el("small", "ah-note", area ? "You don't know any area taunts." : "You don't know any single-target taunts."));
        }
        nodes.push(slots);
        const pull = el("fieldset", "ah-pull");
        pull.appendChild(el("legend", undefined, "Pull"));
        pull.hidden = !mt.on;
        const tiles = (v) => `${v} ${v === 1 ? "tile" : "tiles"}`;
        const want = this.slider("Desired", mt.want, 1, 20, (v) => {
            mt.want = v;
            if (mt.cap < v) {
                mt.cap = v;
                cap.set(v);
            }
            this.changed();
        }, (v) => `${v} monsters`);
        const cap = this.slider("Maximum", mt.cap, 1, 30, (v) => {
            mt.cap = Math.max(v, mt.want);
            if (mt.cap !== v)
                cap.set(mt.cap);
            this.changed();
        }, (v) => `${v} monsters`);
        const near = this.slider("Min distance", mt.min, 0, MAX_RANGE, (v) => {
            mt.min = Math.min(v, mt.max);
            if (mt.min !== v)
                near.set(mt.min);
            this.changed();
        }, (v) => (v === 0 ? "any" : tiles(v)));
        const far = this.slider("Taunt range", mt.max, 1, MAX_RANGE, (v) => {
            mt.max = v;
            if (mt.min > v) {
                mt.min = v;
                near.set(v);
            }
            this.changed();
        }, tiles);
        pull.append(this.slider("Pull radius", mt.rad, 1, 20, (v) => { mt.rad = v; this.changed(); }, tiles).row, want.row, cap.row, near.row, far.row, this.slider("Area needs", mt.amin, 1, 9, (v) => { mt.amin = v; this.changed(); }, (v) => `${v} monsters`).row, this.slider("Re-taunt", mt.re, 0, 120, (v) => { mt.re = v; this.changed(); }, (v) => (v === 0 ? "never" : `after ${v}s`)).row);
        nodes.push(pull);
        const mobs = el("fieldset", "ah-mobs");
        mobs.appendChild(el("legend", undefined, "Monsters on this map"));
        mobs.appendChild(el("small", "ah-note", "Click to cycle: Normal → Priority → Ignore. Used by the whole auto-hunt; an ignored monster is still fought when it attacks you."));
        if (config.mobs.length === 0)
            mobs.appendChild(el("p", "ah-note", "No monsters on this map."));
        const list = el("ul", "ah-mob-list");
        for (const mob of config.mobs)
            list.appendChild(this.monsterRow(settings, mob));
        mobs.appendChild(list);
        nodes.push(mobs);
        return nodes;
    }
    tauntSlot(config, settings, area, index, id, options) {
        const box = el("label", "ah-slot");
        const spell = id ? spellFor(config, id) : undefined;
        const icon = spell ? this.actions.icon(spell.gfx) : el("canvas");
        icon.classList.add("ah-icon");
        const select = el("select");
        const none = el("option", undefined, `Slot ${index + 1}: none`);
        none.value = "0";
        select.appendChild(none);
        for (const option of options) {
            const o = el("option", undefined, option.ok ? option.name : `${option.name} (wrong class)`);
            o.value = String(option.id);
            o.title = describeSpell(option);
            select.appendChild(o);
        }
        if (id && !spell) {
            const o = el("option", undefined, `Spell #${id} (not known)`);
            o.value = String(id);
            select.appendChild(o);
        }
        select.value = String(id);
        select.title = spell ? describeSpell(spell) : "";
        select.addEventListener("change", () => {
            setTauntSlot(settings, area, index, Number(select.value));
            this.changed(true);
        });
        box.append(icon, select);
        return box;
    }
    monsterRow(settings, mob) {
        const li = el("li", "ah-mob");
        const mode = monsterMode(settings, mob.tid);
        li.dataset.mode = mode;
        const pic = this.actions.portrait(mob);
        pic.classList.add("ah-portrait");
        const names = el("div", "ah-names");
        names.append(el("b", undefined, mob.name), el("small", undefined, `Level ${mob.lvl} · ${mob.n} alive`));
        const toggle = button(MODE_LABELS[mode], "Normal → Priority → Ignore", () => {
            setMonsterMode(settings, mob.tid, nextMonsterMode(monsterMode(settings, mob.tid)));
            this.changed(true);
        }, "ah-mode");
        toggle.dataset.mode = mode;
        li.append(pic, names, toggle);
        return li;
    }
    checkbox(label, checked, onChange) {
        const input = el("input");
        input.type = "checkbox";
        input.checked = checked;
        input.addEventListener("change", () => onChange(input.checked));
        const l = el("label", "ah-check");
        l.append(input, el("span", undefined, label));
        return l;
    }
    row(config, settings, entry, index) {
        const key = this.tab;
        const spell = spellFor(config, entry.id);
        const li = el("li", "ah-row");
        li.classList.toggle("off", !entry.on);
        if (!spell)
            li.classList.add("missing");
        const head = el("div", "ah-row-head");
        head.appendChild(el("span", "ah-priority", String(index + 1)));
        const icon = spell ? this.actions.icon(spell.gfx) : el("canvas");
        icon.classList.add("ah-icon");
        head.appendChild(icon);
        const names = el("div", "ah-names");
        names.append(el("b", undefined, spell?.name ?? `Spell #${entry.id}`), el("small", undefined, spell ? describeSpell(spell) : "Not in your spellbook"));
        if (spell && !spell.ok)
            names.appendChild(el("small", "ah-warn", "Your class can't cast this"));
        head.appendChild(names);
        const toggle = el("input");
        toggle.type = "checkbox";
        toggle.checked = entry.on;
        toggle.title = "Enabled";
        toggle.addEventListener("change", () => {
            entry.on = toggle.checked;
            li.classList.toggle("off", !entry.on);
            this.changed();
        });
        head.append(toggle, button("▲", "Higher priority", () => { if (moveEntry(settings, key, index, -1))
            this.changed(true); }, "ah-mini"), button("▼", "Lower priority", () => { if (moveEntry(settings, key, index, 1))
            this.changed(true); }, "ah-mini"), button("✕", "Remove", () => { removeEntry(settings, key, index); this.changed(true); }, "ah-mini"));
        li.appendChild(head);
        const controls = el("div", "ah-controls");
        const percent = (v) => `${v}%`;
        const mp = this.slider("Min MP", entry.mp, 0, 100, (v) => { entry.mp = v; this.changed(); }, (v) => (v === 0 ? "any" : `${v}%`));
        if (key === "atk") {
            controls.appendChild(mp.row);
            if (spell?.tgt !== 1)
                controls.appendChild(this.slider("Range", entry.rng, 1, MAX_RANGE, (v) => { entry.rng = v; this.changed(); }, (v) => `${v} tiles`).row);
            if (!spell || isArea(spell))
                controls.appendChild(this.slider("Min monsters", entry.aoe, 1, 9, (v) => { entry.aoe = v; this.changed(); }, String).row);
        }
        else if (key === "buf") {
            controls.append(this.slider("Min HP", entry.hp, 0, 100, (v) => { entry.hp = v; this.changed(); }, (v) => (v === 0 ? "any" : `${v}%`)).row, mp.row, this.slider("Recast", entry.re, 0, 120, (v) => { entry.re = v; this.changed(); }, (v) => (v === 0 ? "when gone" : `${v}s before end`)).row);
        }
        else {
            controls.appendChild(this.slider("Heal below", entry.hp, 0, 100, (v) => { entry.hp = v; this.changed(); }, percent).row);
            controls.appendChild(mp.row);
            if (spell && spell.tgt === 0 && !isArea(spell))
                controls.appendChild(this.slider("Range", entry.rng, 1, MAX_RANGE, (v) => { entry.rng = v; this.changed(); }, (v) => `${v} tiles`).row);
            if (!spell || isGroup(spell) || isArea(spell))
                controls.appendChild(this.slider("Min allies", entry.aoe, 1, 9, (v) => { entry.aoe = v; this.changed(); }, String).row);
        }
        li.appendChild(controls);
        return li;
    }
    adder(config, settings) {
        const key = this.tab;
        const box = el("div", "ah-add");
        const options = candidates(config, settings, key);
        if (settings[key].length >= MAX_ENTRIES) {
            box.appendChild(el("span", "ah-note", `Up to ${MAX_ENTRIES} spells per list.`));
            return box;
        }
        if (options.length === 0) {
            box.appendChild(el("span", "ah-note", config.spells.some((s) => s.cat === (key === "atk" ? "attack" : key === "buf" ? "buff" : "heal"))
                ? "All your spells of this kind are in the list."
                : "You don't know any spells of this kind."));
            return box;
        }
        for (const spell of options)
            box.appendChild(this.chip(spell, () => {
                if (addEntry(settings, key, spell))
                    this.changed(true);
            }));
        return box;
    }
    chip(spell, onAdd) {
        const b = button("", `Add ${spell.name}\n${describeSpell(spell)}`, onAdd, "ah-chip");
        const icon = this.actions.icon(spell.gfx);
        icon.classList.add("ah-icon");
        b.append(icon, el("span", undefined, "+ " + spell.name));
        return b;
    }
    slider(label, value, min, max, onChange, format) {
        const row = el("label", "ah-slider");
        const input = el("input");
        input.type = "range";
        input.min = String(min);
        input.max = String(max);
        input.value = String(value);
        const out = el("output", undefined, format(value));
        input.addEventListener("input", () => {
            const v = Number(input.value);
            out.textContent = format(v);
            onChange(v);
        });
        row.append(el("span", undefined, label), input, out);
        return {
            row,
            set(v) {
                input.value = String(v);
                out.textContent = format(v);
            },
        };
    }
}
