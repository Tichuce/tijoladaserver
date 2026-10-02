import { test } from "node:test";
import assert from "node:assert/strict";
import { ClientPackets, ServerPacket, decodeText, encodeText, parsePacket } from "../src/protocol.js";
import { LogFilters, LogPacket, LogRow, LogViewerState, buildFreshQuery, detailsText, emptyFilters, parseUtcInput, resolveMap } from "../src/logviewer.js";

const T1 = "AAAAAAAAAAAAAAAAAAAAAA";
const T2 = "BBBBBBBBBBBBBBBBBBBB_-";
const T3 = "CCCCCCCCCCCCCCCCCCCCCC";
const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);

function packet(text: string): ServerPacket {
  const result = parsePacket(text);
  assert.ok(result.ok, `failed to parse ${text}`);
  return result.packet;
}

function feed(state: LogViewerState, text: string): boolean {
  return state.handle(packet(text) as LogPacket);
}

function row(id: number, summary: string): LogRow {
  return {
    rowId: id, utcMilliseconds: NOW - id * 1000, typeId: 13, typeIsInteger: true, eventLabel: "Tell", eventGroup: "Communication",
    otherIdKind: "Player",
    primary: { label: "Speaker", kind: "Player", id: 5, name: "Alice", canQuickFilter: true },
    related: { label: "Recipient", kind: "Player", id: 9, name: "Bob", canQuickFilter: true },
    map: { id: 1, name: "Town", canQuickFilter: true },
    raw: { playerId: 5, playerIdIsInteger: true, otherId: 9, otherIdIsInteger: true, mapId: 1, mapIdIsInteger: true, mapX: 10, mapXIsInteger: true, mapY: 12, mapYIsInteger: true },
    summary, originalText: `Alice told Bob ${summary} ✓, | \u0001`,
  };
}

function chunks(windowId: number, requestId: number, ordinal: number, r: LogRow, size: number): string[] {
  const b64 = encodeText(JSON.stringify(r));
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += size) parts.push(b64.substring(i, i + size));
  return parts.map((s, i) => `LRD${windowId},${requestId},${ordinal},${i},${parts.length},${s}`);
}

function ready(windowId = 7): LogViewerState {
  const state = new LogViewerState(windowId);
  feed(state, `LMT${windowId},0,${encodeText("Communication")},${encodeText("Chat")}`);
  feed(state, `LMT${windowId},13,${encodeText("Communication")},${encodeText("Tell")}`);
  feed(state, `LMT${windowId},10010,${encodeText("GM Actions")},${encodeText("Ban")}`);
  feed(state, `LMM${windowId},1,${encodeText("Town")}`);
  feed(state, `LMM${windowId},3,${encodeText("Caverna Ó")}`);
  feed(state, `LMD${windowId},${NOW - 86_400_000},${NOW}`);
  return state;
}

function requestId(packetText: string): number {
  return Number(packetText.split(",")[1]);
}

test("log metadata and result packets parse with Base64 UTF-8 text", () => {
  assert.deepEqual(packet(`LMT7,13,${encodeText("Communication")},${encodeText("Tell")}`),
    { type: "logType", windowId: 7, typeId: 13, group: "Communication", label: "Tell" });
  assert.deepEqual(packet(`LMM7,3,${encodeText("Caverna Ó")}`), { type: "logMap", windowId: 7, mapId: 3, name: "Caverna Ó" });
  assert.deepEqual(packet("LMD7,1790880000000,1790966400000"), { type: "logRange", windowId: 7, startMs: 1790880000000, endMs: 1790966400000 });
  assert.deepEqual(packet("LRB7,4"), { type: "logBegin", windowId: 7, requestId: 4 });
  assert.deepEqual(packet("LRD7,4,0,1,3,QUJD"), { type: "logChunk", windowId: 7, requestId: 4, ordinal: 0, index: 1, count: 3, segment: "QUJD" });
  assert.deepEqual(packet(`LRF7,4,0,${T1},`), { type: "logFinish", windowId: 7, requestId: 4, hasMore: false, currentToken: T1, nextToken: "" });
  assert.deepEqual(packet(`LRF7,4,1,${T1},${T2}`), { type: "logFinish", windowId: 7, requestId: 4, hasMore: true, currentToken: T1, nextToken: T2 });
  assert.deepEqual(packet(`LRX7,4,${encodeText("Range exceeds 31 days.")}`), { type: "logError", windowId: 7, requestId: 4, message: "Range exceeds 31 days." });
  assert.equal(decodeText(encodeText("olá, mundo | \u0001")), "olá, mundo | \u0001");
  assert.deepEqual(parsePacket("LMT7,13,not*base64,QQ==").ok, false);
  assert.deepEqual(parsePacket("LMD7,12.5,13").ok, false);
});

test("LQS packets use the exact fresh and page grammars", () => {
  assert.equal(
    ClientPackets.logSearchFresh(7, 3, { startMs: 100, endMs: 200, participant: "Bob", mapId: 0, typeIds: [0, 13], text: "olá" }),
    `LQS7,3,F,100,200,Qm9i,0,0|13,${encodeText("olá")}`);
  assert.equal(ClientPackets.logSearchFresh(7, 3, { startMs: -5, endMs: 200, participant: "", mapId: 4, typeIds: [], text: "" }), "LQS7,3,F,-5,200,,4,,");
  assert.equal(ClientPackets.logSearchPage(7, 4, T2), `LQS7,4,P,${T2}`);
});

test("fresh filters are validated like the server (31 days, 7 days with text, ids, maps)", () => {
  const maps = new Map([[1, "Town"], [3, "Caverna Ó"]]);
  const base: LogFilters = emptyFilters();
  const day = buildFreshQuery(base, NOW, maps);
  assert.ok(day.ok);
  assert.deepEqual(day.ok && [day.query.startMs, day.query.endMs], [NOW - 86_400_000, NOW]);

  const custom = { ...base, preset: "custom" as const, customStart: "2026-09-01T00:00", customEnd: "2026-10-02T00:01" };
  const wide = buildFreshQuery(custom, NOW, maps);
  assert.equal(!wide.ok && wide.error, "A search can cover at most 31 days.");
  assert.ok(buildFreshQuery({ ...custom, customEnd: "2026-10-02T00:00" }, NOW, maps).ok);
  const text = buildFreshQuery({ ...base, preset: "month", text: "gold" }, NOW, maps);
  assert.equal(!text.ok && text.error, "A text search can cover at most 7 days.");
  assert.ok(buildFreshQuery({ ...base, preset: "week", text: "gold" }, NOW, maps).ok);
  const backwards = buildFreshQuery({ ...custom, customStart: "2026-10-02T00:00", customEnd: "2026-10-01T00:00" }, NOW, maps);
  assert.equal(!backwards.ok && backwards.error, "Start must be before end.");

  assert.equal(buildFreshQuery({ ...base, participant: "#x" }, NOW, maps).ok, false);
  const byId = buildFreshQuery({ ...base, participant: " #12 " }, NOW, maps);
  assert.equal(byId.ok && byId.query.participant, "#12");
  assert.equal(buildFreshQuery({ ...base, participant: "x".repeat(65) }, NOW, maps).ok, false);

  assert.equal(resolveMap("", maps), 0);
  assert.equal(resolveMap("Caverna Ó (#3)", maps), 3);
  assert.equal(resolveMap("town", maps), 1);
  assert.equal(resolveMap("#77", maps), 77);
  assert.equal(resolveMap("Nowhere", maps), null);
  const withTypes = buildFreshQuery({ ...base, map: "Town (#1)", typeIds: [13, 0, 13] }, NOW, maps);
  assert.ok(withTypes.ok);
  assert.deepEqual(withTypes.ok && [withTypes.query.mapId, withTypes.query.typeIds], [1, [0, 13]]);
  assert.equal(withTypes.ok && withTypes.applied, "Previous 24 hours · map Town (#1) · 2 event types");
  assert.equal(parseUtcInput("2026-10-02T10:15"), Date.UTC(2026, 9, 2, 10, 15));
  assert.equal(parseUtcInput("nope"), null);
});

test("search stays disabled until LMD and metadata is grouped", () => {
  const state = new LogViewerState(7);
  feed(state, `LMT7,13,${encodeText("Communication")},${encodeText("Tell")}`);
  assert.equal(state.ready, false);
  assert.deepEqual(state.fresh(emptyFilters(), NOW), { error: "The viewer is still loading." });
  feed(state, `LMT7,0,${encodeText("Communication")},${encodeText("Chat")}`);
  feed(state, `LMT7,10010,${encodeText("GM Actions")},${encodeText("Ban")}`);
  feed(state, `LMD7,${NOW - 1000},${NOW}`);
  assert.equal(state.ready, true);
  assert.deepEqual(state.groups(), [["Communication", [[0, "Chat"], [13, "Tell"]]], ["GM Actions", [[10010, "Ban"]]]]);
});

test("rows are staged from split chunks and only committed by the matching LRF", () => {
  const state = ready();
  const fresh = state.fresh({ ...emptyFilters(), participant: "Alice" }, NOW);
  assert.ok("packet" in fresh);
  const id = requestId(fresh.packet);
  assert.equal(fresh.packet, `LQS7,${id},F,${NOW - 86_400_000},${NOW},${encodeText("Alice")},0,,`);
  assert.equal(state.busy, true);
  assert.deepEqual(state.fresh(emptyFilters(), NOW), { error: "A search is already running." });

  feed(state, `LRB7,${id}`);
  for (const c of chunks(7, id, 0, row(1, "“hi”"), 7)) feed(state, c);
  for (const c of chunks(7, id, 1, row(2, "second"), 4096)) feed(state, c);
  assert.equal(state.rows.length, 0);
  assert.equal(feed(state, `LRF7,${id + 1},0,${T1},`), false);
  assert.equal(feed(state, `LRF8,${id},0,${T1},`), false);
  feed(state, `LRF7,${id},1,${T1},${T2}`);
  assert.equal(state.status, "ok");
  assert.deepEqual(state.rows.map((r) => r.summary), ["“hi”", "second"]);
  assert.equal(state.rows[0].originalText, "Alice told Bob “hi” ✓, | \u0001");
  assert.equal(state.applied, "Previous 24 hours · participant Alice · all events");
  assert.equal(state.canNext, true);
  assert.equal(state.canPrevious, false);
});

test("paging keeps current-page tokens for Previous and the issued token for Next", () => {
  const state = ready();
  const run = (packetText: string | null, current: string, next: string, rows: LogRow[]) => {
    assert.ok(packetText);
    const id = requestId(packetText);
    feed(state, `LRB7,${id}`);
    rows.forEach((r, i) => chunks(7, id, i, r, 100).forEach((c) => feed(state, c)));
    feed(state, `LRF7,${id},${next ? 1 : 0},${current},${next}`);
  };
  const fresh = state.fresh(emptyFilters(), NOW);
  assert.ok("packet" in fresh);
  run(fresh.packet, T1, T2, [row(1, "a")]);
  const next = state.next();
  assert.equal(next?.split(",").slice(2).join(","), `P,${T2}`);
  run(next, T2, T3, [row(2, "b")]);
  assert.equal(state.pageIndex, 1);
  const previous = state.previous();
  assert.equal(previous?.split(",").slice(2).join(","), `P,${T1}`);
  run(previous, T1, T2, [row(1, "a")]);
  assert.equal(state.pageIndex, 0);
  assert.deepEqual(state.rows.map((r) => r.summary), ["a"]);
  assert.equal(state.previous(), null);
});

test("errors and malformed results never replace the visible rows", () => {
  const state = ready();
  const first = state.fresh(emptyFilters(), NOW);
  assert.ok("packet" in first);
  const id = requestId(first.packet);
  feed(state, `LRB7,${id}`);
  chunks(7, id, 0, row(1, "kept"), 50).forEach((c) => feed(state, c));
  feed(state, `LRF7,${id},0,${T1},`);

  const second = state.fresh({ ...emptyFilters(), participant: "Nobody" }, NOW);
  assert.ok("packet" in second);
  feed(state, `LRX7,${requestId(second.packet)},${encodeText("No player matches that name.")}`);
  assert.equal(state.status, "error");
  assert.equal(state.error, "No player matches that name.");
  assert.deepEqual(state.rows.map((r) => r.summary), ["kept"]);
  assert.equal(state.busy, false);

  const third = state.fresh(emptyFilters(), NOW);
  assert.ok("packet" in third);
  const id3 = requestId(third.packet);
  feed(state, `LRB7,${id3}`);
  const parts = chunks(7, id3, 0, row(3, "lost"), 20);
  feed(state, parts[1]);
  assert.equal(state.status, "error");
  feed(state, `LRF7,${id3},0,${T1},`);
  assert.deepEqual(state.rows.map((r) => r.summary), ["kept"]);

  const fourth = state.fresh(emptyFilters(), NOW);
  assert.ok("packet" in fourth);
  const id4 = requestId(fourth.packet);
  feed(state, `LRB7,${id4}`);
  feed(state, `LRD7,${id4},0,0,1,${encodeText("{broken")}`);
  feed(state, `LRF7,${id4},0,${T1},`);
  assert.equal(state.status, "error");
  assert.deepEqual(state.rows.map((r) => r.summary), ["kept"]);

  const fifth = state.fresh(emptyFilters(), NOW);
  assert.ok("packet" in fifth);
  const id5 = requestId(fifth.packet);
  feed(state, `LRB7,${id5}`);
  feed(state, `LRF7,${id5},1,${T1},`);
  assert.equal(state.status, "error");
});

test("copied details are stable plain text", () => {
  assert.equal(detailsText(row(1, "Alice told Bob “hi”")), [
    "Summary: Alice told Bob “hi”",
    "Time (UTC): 2026-10-02T11:59:59Z",
    "Log row: 1",
    "Event: Tell (type 13) - Communication",
    "Speaker: Alice (#5) [Player]",
    "Recipient: Bob (#9) [Player]",
    "Other id: 9 [Player]",
    "Map: Town (#1) at 10,12",
    "Original text: Alice told Bob Alice told Bob “hi” ✓, | \u0001",
  ].join("\n"));
});
