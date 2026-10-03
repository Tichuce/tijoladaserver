import { encodeText } from "./protocol.js";
export const MAX_ENTRIES = 10;
export const MAX_RANGE = 12;
export const MAX_DISTANCE = 12;
export const LISTS = { atk: "attack", buf: "buff", heal: "heal" };
export const STATUS_LABELS = {
    off: "Off",
    paused: "Paused",
    active: "Active",
    waiting: "Waiting",
    moving: "Moving",
    casting: "Casting",
    pulling: "Pulling",
    healing: "Healing",
    repositioning: "Repositioning",
};
const AREA_NAMES = ["Single target", "Line", "Cross (X)", "Plus (+)", "Random area", "Area", "Cone"];
export function emptySettings() {
    return { v: 1, atk: [], buf: [], heal: [], min: 0, max: 1, melee: true };
}
function clampInt(value, min, max, fallback) {
    const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
    return Math.max(min, Math.min(max, n));
}
function normalizeEntry(raw) {
    return {
        id: clampInt(raw.id, 0, Number.MAX_SAFE_INTEGER, 0),
        on: raw.on !== false,
        mp: clampInt(raw.mp, 0, 100, 0),
        hp: clampInt(raw.hp, 0, 100, 0),
        rng: clampInt(raw.rng, 1, MAX_RANGE, 8),
        aoe: clampInt(raw.aoe, 1, 9, 1),
        re: clampInt(raw.re, 0, 600, 0),
    };
}
export function normalizeSettings(raw) {
    const s = raw ?? {};
    const list = (v) => (Array.isArray(v) ? v.slice(0, MAX_ENTRIES).map((e) => normalizeEntry(e ?? {})) : []);
    const max = clampInt(s.max, 1, MAX_DISTANCE, 1);
    return {
        v: 1,
        atk: list(s.atk),
        buf: list(s.buf),
        heal: list(s.heal),
        min: clampInt(s.min, 0, max, 0),
        max,
        melee: s.melee !== false,
    };
}
export function parseConfig(json) {
    try {
        const raw = JSON.parse(json);
        if (!raw || typeof raw !== "object")
            return null;
        return {
            cfg: normalizeSettings(raw.cfg),
            spells: Array.isArray(raw.spells) ? raw.spells.filter((s) => s && typeof s.id === "number") : [],
            radius: typeof raw.radius === "number" ? raw.radius : 12,
            minhp: typeof raw.minhp === "number" ? raw.minhp : 5,
            step: typeof raw.step === "number" ? raw.step : 350,
        };
    }
    catch {
        return null;
    }
}
export function configCommand(settings) {
    return "/autohunt config " + encodeText(JSON.stringify(settings));
}
export function isArea(spell) {
    return spell.area !== 0;
}
export function isGroup(spell) {
    return spell.tgt === 2;
}
export function defaultEntry(key, spell) {
    const entry = normalizeEntry({ id: spell.id });
    if (key === "heal") {
        entry.hp = 60;
        entry.aoe = isGroup(spell) || isArea(spell) ? 2 : 1;
    }
    else if (key === "atk") {
        entry.rng = spell.tgt === 1 ? 1 : 8;
        entry.aoe = isArea(spell) && spell.size > 0 ? 2 : 1;
    }
    else {
        entry.re = 0;
    }
    return entry;
}
export function candidates(config, settings, key) {
    const used = new Set(settings[key].map((e) => e.id));
    return config.spells.filter((s) => s.cat === LISTS[key] && !used.has(s.id));
}
export function spellFor(config, id) {
    return config.spells.find((s) => s.id === id);
}
export function addEntry(settings, key, spell) {
    const list = settings[key];
    if (list.length >= MAX_ENTRIES || list.some((e) => e.id === spell.id))
        return false;
    list.push(defaultEntry(key, spell));
    return true;
}
export function removeEntry(settings, key, index) {
    settings[key].splice(index, 1);
}
export function moveEntry(settings, key, index, delta) {
    const list = settings[key];
    const to = index + delta;
    if (index < 0 || index >= list.length || to < 0 || to >= list.length)
        return false;
    [list[index], list[to]] = [list[to], list[index]];
    return true;
}
export function describeSpell(spell) {
    const parts = [];
    if (spell.tgt === 2)
        parts.push("Group");
    else if (spell.tgt === 1)
        parts.push(spell.area === 0 ? "Self" : `Around you · ${AREA_NAMES[spell.area] ?? "Area"} ${spell.size}`);
    else
        parts.push(spell.area === 0 ? "Single target" : `${AREA_NAMES[spell.area] ?? "Area"} ${spell.size}`);
    if (spell.mp > 0)
        parts.push(`${spell.mp} MP`);
    if (spell.aether > 0)
        parts.push(`${formatSeconds(spell.aether)} cooldown`);
    if (spell.dur > 0)
        parts.push(`lasts ${formatSeconds(spell.dur * 1000)}`);
    return parts.join(" · ");
}
export function formatSeconds(ms) {
    const s = ms / 1000;
    if (s >= 60) {
        const m = Math.floor(s / 60);
        const rest = Math.round(s - m * 60);
        return rest ? `${m}m ${rest}s` : `${m}m`;
    }
    return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
}
export function statusLabel(state) {
    return STATUS_LABELS[state] ?? state;
}
