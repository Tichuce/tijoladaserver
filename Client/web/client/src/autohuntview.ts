import {
  AutoHuntConfig, AutoHuntEntry, AutoHuntSettings, AutoHuntSpell, ListKey, MAX_DISTANCE, MAX_ENTRIES, MAX_RANGE,
  addEntry, candidates, describeSpell, isArea, isGroup, moveEntry, normalizeSettings, removeEntry, spellFor, statusLabel,
} from "./autohuntconfig.js";

export interface AutoHuntViewActions {
  save(settings: AutoHuntSettings): void;
  refresh(): void;
  toggle(): void;
  stop(): void;
  close(): void;
  icon(graphic: number): HTMLCanvasElement;
}

type Tab = ListKey;

const TABS: Array<[Tab, string, string]> = [
  ["atk", "AS", "Attack spells"],
  ["buf", "BS", "Buff spells"],
  ["heal", "HS", "Healing spells"],
];

const SAVE_DELAY_MS = 500;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function button(text: string, title: string, onClick: () => void, className?: string): HTMLButtonElement {
  const b = el("button", className, text);
  b.type = "button";
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

export class AutoHuntView {
  readonly root: HTMLElement;
  readonly handle: HTMLElement;
  private readonly statusDot = el("span", "ah-dot");
  private readonly statusText = el("span", "ah-state");
  private readonly statusDetail = el("span", "ah-detail");
  private readonly tabBar = el("div", "ah-tabs");
  private readonly body = el("div", "ah-body");
  private readonly saved = el("span", "ah-saved");
  private readonly runButton: HTMLButtonElement;
  private tab: Tab = "atk";
  private config: AutoHuntConfig | null = null;
  private settings: AutoHuntSettings | null = null;
  private spellsKey = "";
  private saveTimer: number | null = null;

  constructor(private readonly actions: AutoHuntViewActions) {
    this.root = el("section", "game-window auto-hunt");
    this.root.hidden = true;

    this.handle = el("header");
    this.handle.append(el("span", "title", "Auto-Hunt"), button("×", "Close", () => this.actions.close(), "close"));

    const status = el("div", "ah-status");
    status.append(this.statusDot, this.statusText, this.statusDetail);

    for (const [key, short, long] of TABS) {
      const b = button(short, long, () => this.showTab(key));
      b.dataset.tab = key;
      b.append(el("small", undefined, long.replace(" spells", "")));
      this.tabBar.appendChild(b);
    }

    const footer = el("footer");
    this.runButton = button("Start", "Start or pause auto-hunt", () => this.actions.toggle());
    footer.append(this.saved, this.runButton, button("Stop", "Stop auto-hunt", () => this.actions.stop()));

    this.root.append(this.handle, status, this.tabBar, this.body, footer);
    this.showTab("atk");
  }

  open(): void {
    this.root.hidden = false;
    this.actions.refresh();
  }

  reset(): void {
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.config = null;
    this.settings = null;
    this.spellsKey = "";
    this.saved.textContent = "";
    this.body.replaceChildren(el("p", "ah-note", "Loading your spells…"));
  }

  refreshIcons(): void {
    if (this.isOpen && this.body.querySelector('canvas[data-ready="0"]')) this.render();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  update(config: AutoHuntConfig | null, status: { state: string; detail: string }, running: string): void {
    this.statusDot.dataset.state = status.state;
    this.statusText.textContent = statusLabel(status.state);
    this.statusDetail.textContent = status.detail;
    this.runButton.textContent = running === "on" ? "Pause" : running === "paused" ? "Resume" : "Start";

    if (!config) {
      if (!this.config) this.body.replaceChildren(el("p", "ah-note", "Loading your spells…"));
      return;
    }
    if (config === this.config) return;
    const spellsKey = config.spells.map((s) => `${s.slot}:${s.id}:${s.ok ? 1 : 0}`).join(",");
    const incoming = normalizeSettings(structuredClone(config.cfg));
    const same = !!this.settings && JSON.stringify(incoming) === JSON.stringify(this.settings) && spellsKey === this.spellsKey;
    this.config = config;
    if (this.saveTimer !== null || same) return;
    this.settings = incoming;
    this.spellsKey = spellsKey;
    this.render();
  }

  private showTab(tab: Tab): void {
    this.tab = tab;
    for (const b of this.tabBar.querySelectorAll<HTMLButtonElement>("button"))
      b.classList.toggle("active", b.dataset.tab === tab);
    this.render();
  }

  private changed(rerender = false): void {
    if (rerender) this.render();
    this.saved.textContent = "Saving…";
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      if (this.settings) this.actions.save(this.settings);
      this.saved.textContent = "Saved";
    }, SAVE_DELAY_MS);
  }

  private render(): void {
    const config = this.config;
    const settings = this.settings;
    if (!config || !settings) return;

    const nodes: HTMLElement[] = [];
    if (this.tab === "atk") nodes.push(this.positioning(settings));

    const list = settings[this.tab];
    const rows = el("ol", "ah-list");
    list.forEach((entry, index) => rows.appendChild(this.row(config, settings, entry, index)));
    if (list.length === 0) rows.appendChild(el("li", "ah-empty", this.emptyText()));
    nodes.push(rows);
    nodes.push(this.adder(config, settings));
    this.body.replaceChildren(...nodes);
  }

  private emptyText(): string {
    if (this.tab === "atk") return "No attack spells: auto-hunt fights in melee.";
    if (this.tab === "buf") return "No buffs: auto-hunt will not cast any.";
    return "No heals: auto-hunt will not heal.";
  }

  private positioning(settings: AutoHuntSettings): HTMLElement {
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
      if (settings.min !== v) min.set(settings.min);
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

  private row(config: AutoHuntConfig, settings: AutoHuntSettings, entry: AutoHuntEntry, index: number): HTMLElement {
    const key = this.tab;
    const spell = spellFor(config, entry.id);
    const li = el("li", "ah-row");
    li.classList.toggle("off", !entry.on);
    if (!spell) li.classList.add("missing");

    const head = el("div", "ah-row-head");
    head.appendChild(el("span", "ah-priority", String(index + 1)));
    const icon = spell ? this.actions.icon(spell.gfx) : el("canvas");
    icon.classList.add("ah-icon");
    head.appendChild(icon);

    const names = el("div", "ah-names");
    names.append(el("b", undefined, spell?.name ?? `Spell #${entry.id}`),
      el("small", undefined, spell ? describeSpell(spell) : "Not in your spellbook"));
    if (spell && !spell.ok) names.appendChild(el("small", "ah-warn", "Your class can't cast this"));
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
    head.append(toggle,
      button("▲", "Higher priority", () => { if (moveEntry(settings, key, index, -1)) this.changed(true); }, "ah-mini"),
      button("▼", "Lower priority", () => { if (moveEntry(settings, key, index, 1)) this.changed(true); }, "ah-mini"),
      button("✕", "Remove", () => { removeEntry(settings, key, index); this.changed(true); }, "ah-mini"));
    li.appendChild(head);

    const controls = el("div", "ah-controls");
    const percent = (v: number) => `${v}%`;
    const mp = this.slider("Min MP", entry.mp, 0, 100, (v) => { entry.mp = v; this.changed(); }, (v) => (v === 0 ? "any" : `${v}%`));

    if (key === "atk") {
      controls.appendChild(mp.row);
      if (spell?.tgt !== 1)
        controls.appendChild(this.slider("Range", entry.rng, 1, MAX_RANGE, (v) => { entry.rng = v; this.changed(); }, (v) => `${v} tiles`).row);
      if (!spell || isArea(spell))
        controls.appendChild(this.slider("Min monsters", entry.aoe, 1, 9, (v) => { entry.aoe = v; this.changed(); }, String).row);
    } else if (key === "buf") {
      controls.append(
        this.slider("Min HP", entry.hp, 0, 100, (v) => { entry.hp = v; this.changed(); }, (v) => (v === 0 ? "any" : `${v}%`)).row,
        mp.row,
        this.slider("Recast", entry.re, 0, 120, (v) => { entry.re = v; this.changed(); }, (v) => (v === 0 ? "when gone" : `${v}s before end`)).row);
    } else {
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

  private adder(config: AutoHuntConfig, settings: AutoHuntSettings): HTMLElement {
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
    for (const spell of options) box.appendChild(this.chip(spell, () => {
      if (addEntry(settings, key, spell)) this.changed(true);
    }));
    return box;
  }

  private chip(spell: AutoHuntSpell, onAdd: () => void): HTMLElement {
    const b = button("", `Add ${spell.name}\n${describeSpell(spell)}`, onAdd, "ah-chip");
    const icon = this.actions.icon(spell.gfx);
    icon.classList.add("ah-icon");
    b.append(icon, el("span", undefined, "+ " + spell.name));
    return b;
  }

  private slider(label: string, value: number, min: number, max: number, onChange: (v: number) => void,
    format: (v: number) => string): { row: HTMLElement; set(v: number): void } {
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
      set(v: number) {
        input.value = String(v);
        out.textContent = format(v);
      },
    };
  }
}
