import { ClientPackets, decodeBytes, utf8Length } from "./protocol.js";
export const LOG_PRESETS = [
    ["hour", "Last hour"],
    ["day", "Previous 24 hours"],
    ["week", "Previous 7 days"],
    ["month", "Previous 30 days"],
    ["custom", "Custom (UTC)"],
];
const HOUR = 3600000;
const DAY = 24 * HOUR;
const PRESET_SPAN = { hour: HOUR, day: DAY, week: 7 * DAY, month: 30 * DAY };
export const MAX_RANGE_MS = 31 * DAY;
export const MAX_TEXT_RANGE_MS = 7 * DAY;
export const MAX_PARTICIPANT_BYTES = 64;
export const MAX_TEXT_BYTES = 4096;
export const PAGE_ROWS = 50;
export const MAX_STAGED_CHARS = 4194304;
const TOKEN = /^[A-Za-z0-9_-]{22}$/;
export function emptyFilters() {
    return { preset: "day", customStart: "", customEnd: "", participant: "", map: "", typeIds: [], text: "" };
}
export function parseUtcInput(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
    if (!m)
        return null;
    const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
    return Number.isFinite(ms) ? ms : null;
}
export function utcInputValue(ms) {
    return new Date(ms).toISOString().substring(0, 16);
}
export function formatUtc(ms) {
    return new Date(ms).toISOString().replace("T", " ").substring(0, 19);
}
export function isoUtc(ms) {
    return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
export function mapLabel(id, name) {
    return `${name} (#${id})`;
}
export function resolveMap(input, maps) {
    const text = input.trim();
    if (!text || /^all( maps)?$/i.test(text))
        return 0;
    const byId = /#(\d+)\)?$/.exec(text);
    if (byId) {
        const id = Number(byId[1]);
        return id > 0 && id <= 2147483647 ? id : null;
    }
    for (const [id, name] of maps)
        if (name.toLowerCase() === text.toLowerCase())
            return id;
    return null;
}
export function buildFreshQuery(filters, now, maps) {
    let startMs, endMs;
    if (filters.preset === "custom") {
        const start = parseUtcInput(filters.customStart);
        const end = parseUtcInput(filters.customEnd);
        if (start === null || end === null)
            return { ok: false, error: "Enter a custom start and end (UTC)." };
        startMs = start;
        endMs = end;
    }
    else {
        endMs = now;
        startMs = now - PRESET_SPAN[filters.preset];
    }
    if (startMs >= endMs)
        return { ok: false, error: "Start must be before end." };
    if (endMs - startMs > MAX_RANGE_MS)
        return { ok: false, error: "A search can cover at most 31 days." };
    const text = filters.text;
    if (text.includes("\0"))
        return { ok: false, error: "Text contains a NUL character." };
    if (utf8Length(text) > MAX_TEXT_BYTES)
        return { ok: false, error: "Text is too long." };
    if (text.length > 0 && endMs - startMs > MAX_TEXT_RANGE_MS)
        return { ok: false, error: "A text search can cover at most 7 days." };
    const participant = filters.participant.trim();
    if (participant.includes("\0"))
        return { ok: false, error: "Participant contains a NUL character." };
    if (utf8Length(participant) > MAX_PARTICIPANT_BYTES)
        return { ok: false, error: "Participant is too long." };
    if (participant.startsWith("#") && !/^#[1-9]\d{0,9}$/.test(participant))
        return { ok: false, error: "Use #<player id>, e.g. #12." };
    const mapId = resolveMap(filters.map, maps);
    if (mapId === null)
        return { ok: false, error: "Unknown map. Pick one from the list or type #<map id>." };
    const typeIds = [...new Set(filters.typeIds)].sort((a, b) => a - b);
    const query = { startMs, endMs, participant, mapId, typeIds, text };
    return { ok: true, query, applied: describeQuery(filters.preset, query, maps) };
}
export function describeQuery(preset, q, maps) {
    const parts = [];
    const label = LOG_PRESETS.find(([p]) => p === preset)?.[1];
    parts.push(preset === "custom" || !label ? `${formatUtc(q.startMs)} to ${formatUtc(q.endMs)} UTC` : label);
    if (q.participant)
        parts.push(`participant ${q.participant}`);
    if (q.mapId)
        parts.push(`map ${maps.has(q.mapId) ? mapLabel(q.mapId, maps.get(q.mapId)) : `#${q.mapId}`}`);
    parts.push(q.typeIds.length ? `${q.typeIds.length} event type${q.typeIds.length === 1 ? "" : "s"}` : "all events");
    if (q.text)
        parts.push(`text "${q.text}"`);
    return parts.join(" · ");
}
export class LogViewerState {
    constructor(windowId) {
        this.windowId = windowId;
        this.types = new Map();
        this.maps = new Map();
        this.defaultRange = null;
        this.rows = [];
        this.hasMore = false;
        this.pageIndex = -1;
        this.status = "waiting";
        this.error = "";
        this.applied = "";
        this.version = 0;
        this.pages = [];
        this.nextToken = "";
        this.pending = null;
        this.lastRequestId = 0;
    }
    get ready() {
        return this.defaultRange !== null;
    }
    get busy() {
        return this.pending !== null;
    }
    get canPrevious() {
        return !this.busy && this.pageIndex > 0;
    }
    get canNext() {
        return !this.busy && this.hasMore && this.nextToken !== "";
    }
    groups() {
        const groups = new Map();
        for (const [id, t] of [...this.types].sort((a, b) => a[0] - b[0])) {
            if (!groups.has(t.group))
                groups.set(t.group, []);
            groups.get(t.group).push([id, t.label]);
        }
        return [...groups];
    }
    fresh(filters, now) {
        if (!this.ready)
            return { error: "The viewer is still loading." };
        if (this.busy)
            return { error: "A search is already running." };
        const built = buildFreshQuery(filters, now, this.maps);
        if (!built.ok)
            return { error: built.error };
        const requestId = this.begin("fresh", built.applied);
        return { packet: ClientPackets.logSearchFresh(this.windowId, requestId, built.query) };
    }
    next() {
        if (!this.canNext)
            return null;
        const requestId = this.begin("next", this.applied);
        return ClientPackets.logSearchPage(this.windowId, requestId, this.nextToken);
    }
    previous() {
        if (!this.canPrevious)
            return null;
        const requestId = this.begin("prev", this.applied);
        return ClientPackets.logSearchPage(this.windowId, requestId, this.pages[this.pageIndex - 1]);
    }
    clearResults() {
        if (this.busy)
            return;
        this.rows = [];
        this.pages = [];
        this.pageIndex = -1;
        this.hasMore = false;
        this.nextToken = "";
        this.applied = "";
        this.error = "";
        this.status = this.ready ? "idle" : "waiting";
        this.version++;
    }
    handle(p) {
        if (p.windowId !== this.windowId)
            return false;
        switch (p.type) {
            case "logType":
                this.types.set(p.typeId, { group: p.group, label: p.label });
                break;
            case "logMap":
                this.maps.set(p.mapId, p.name);
                break;
            case "logRange":
                this.defaultRange = [p.startMs, p.endMs];
                if (this.status === "waiting")
                    this.status = "idle";
                break;
            case "logBegin": {
                const pending = this.match(p.requestId);
                if (!pending || pending.begun)
                    return false;
                pending.begun = true;
                break;
            }
            case "logChunk":
                return this.chunk(p);
            case "logFinish":
                return this.finish(p);
            case "logError": {
                if (!this.match(p.requestId))
                    return false;
                this.fail(p.message || "Log search failed.");
                break;
            }
        }
        this.version++;
        return true;
    }
    begin(nav, applied) {
        this.lastRequestId = this.lastRequestId >= 2147483647 ? 1 : this.lastRequestId + 1;
        this.pending = { requestId: this.lastRequestId, nav, applied, begun: false, rows: new Map(), chars: 0 };
        this.status = "loading";
        this.error = "";
        this.version++;
        return this.lastRequestId;
    }
    match(requestId) {
        return this.pending && this.pending.requestId === requestId ? this.pending : null;
    }
    chunk(p) {
        const pending = this.match(p.requestId);
        if (!pending)
            return false;
        if (!pending.begun || p.ordinal < 0 || p.ordinal >= PAGE_ROWS || p.count < 1 || p.index < 0 || p.index >= p.count) {
            this.fail("The server sent a malformed result.");
        }
        else {
            const entry = pending.rows.get(p.ordinal) ?? { count: p.count, parts: [] };
            pending.chars += p.segment.length;
            if (entry.count !== p.count || entry.parts.length !== p.index || pending.chars > MAX_STAGED_CHARS) {
                this.fail("The server sent a malformed result.");
            }
            else {
                entry.parts.push(p.segment);
                pending.rows.set(p.ordinal, entry);
            }
        }
        this.version++;
        return true;
    }
    finish(p) {
        const pending = this.match(p.requestId);
        if (!pending)
            return false;
        const tokensOk = TOKEN.test(p.currentToken) && (p.hasMore ? TOKEN.test(p.nextToken) : p.nextToken === "");
        const rows = tokensOk && pending.begun ? assemble(pending.rows) : null;
        if (!rows) {
            this.fail("The server sent a malformed result.");
            this.version++;
            return true;
        }
        this.rows = rows;
        this.hasMore = p.hasMore;
        this.nextToken = p.nextToken;
        if (pending.nav === "fresh") {
            this.pages = [p.currentToken];
            this.pageIndex = 0;
        }
        else if (pending.nav === "next") {
            this.pages = this.pages.slice(0, this.pageIndex + 1);
            this.pages.push(p.currentToken);
            this.pageIndex = this.pages.length - 1;
        }
        else {
            this.pageIndex = Math.max(0, this.pageIndex - 1);
            this.pages[this.pageIndex] = p.currentToken;
        }
        this.applied = pending.applied;
        this.pending = null;
        this.status = "ok";
        this.error = "";
        this.version++;
        return true;
    }
    fail(message) {
        this.pending = null;
        this.status = "error";
        this.error = message;
    }
}
function assemble(staged) {
    const rows = [];
    for (let ordinal = 0; ordinal < staged.size; ordinal++) {
        const entry = staged.get(ordinal);
        if (!entry || entry.parts.length !== entry.count)
            return null;
        try {
            const json = new TextDecoder("utf-8", { fatal: true }).decode(decodeBytes(entry.parts.join("")));
            const row = JSON.parse(json);
            if (typeof row !== "object" || row === null || typeof row.rowId !== "number" || typeof row.utcMilliseconds !== "number")
                return null;
            rows.push(row);
        }
        catch {
            return null;
        }
    }
    return rows;
}
export function entityText(e) {
    if (!e)
        return "";
    const name = e.name ?? "";
    if (e.id === null)
        return name;
    return name ? `${name} (#${e.id})` : `#${e.id}`;
}
export function mapText(row) {
    if (!row.map)
        return "";
    const name = row.map.name ?? "";
    if (row.map.id === null)
        return name;
    return name ? mapLabel(row.map.id, name) : `#${row.map.id}`;
}
export function coordinates(row) {
    const x = row.raw.mapX, y = row.raw.mapY;
    return typeof x === "number" && typeof y === "number" && (x !== 0 || y !== 0) ? `${x},${y}` : "";
}
export function detailsText(row) {
    const lines = [
        `Summary: ${row.summary}`,
        `Time (UTC): ${isoUtc(row.utcMilliseconds)}`,
        `Log row: ${row.rowId}`,
        `Event: ${row.eventLabel} (type ${row.typeId}) - ${row.eventGroup}`,
    ];
    if (row.primary)
        lines.push(`${row.primary.label}: ${entityText(row.primary) || "-"} [${row.primary.kind}]`);
    if (row.related)
        lines.push(`${row.related.label}: ${entityText(row.related) || "-"} [${row.related.kind}]`);
    if (row.otherIdKind && row.otherIdKind !== "Unused")
        lines.push(`Other id: ${row.raw.otherId ?? ""} [${row.otherIdKind}]`);
    const map = mapText(row);
    const at = coordinates(row);
    if (map || at)
        lines.push(`Map: ${[map, at && `at ${at}`].filter(Boolean).join(" ")}`);
    lines.push(`Original text: ${row.originalText}`);
    return lines.join("\n");
}
export function participantFilter(e) {
    if (!e.canQuickFilter)
        return null;
    if (e.kind === "Player" && e.id !== null && e.id > 0)
        return `#${e.id}`;
    return null;
}
