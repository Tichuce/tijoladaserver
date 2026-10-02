// Run with: npm test (needs Node 20+ and TypeScript). Checks the packet parser against
// real packets captured from the server and the converted map format.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ClientPackets, Direction, PacketBuffer, parsePacket } from "../src/protocol.js";
import { frameOffset, parseMap, tintPixel } from "../src/assets.js";

function parse(raw: string) {
  const r = parsePacket(raw);
  assert.ok(r.ok, `failed to parse ${raw}`);
  return r.packet;
}

test("MKC from a real server capture", () => {
  const p = parse("MKC1,1,Balinha,,,,72,26,3,79,1,4,33,4,*,0,*,0,*,1,1,1,1,100,0,*,4,*,0,0,0,0,0,2");
  assert.equal(p.type, "makeCharacter");
  if (p.type !== "makeCharacter") return;
  const d = p.data;
  assert.equal(d.loginId, 1);
  assert.equal(d.name, "Balinha");
  assert.equal(d.title, "");
  assert.deepEqual([d.x, d.y, d.facing], [71, 25, 2]);
  assert.equal(d.hpPercent, 79);
  assert.deepEqual([d.bodyId, d.bodyState, d.hairId], [1, 4, 33]);
  assert.deepEqual(d.equipment, [[4, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [1, 1, 1, 1, 100], [0, 0, 0, 0, 0], [4, 0, 0, 0, 0]]);
  assert.deepEqual(d.hair, [0, 0, 0, 0]);
  assert.equal(d.faceId, 2);
});

test("movement, position, heading and identity packets are 1-based on the wire", () => {
  assert.deepEqual(parse("MOC5297,10,20"), { type: "moveCharacter", loginId: 5297, x: 9, y: 19 });
  assert.deepEqual(parse("SUP11,10"), { type: "setYourPosition", x: 10, y: 9 });
  assert.deepEqual(parse("CHH12,4"), { type: "changeHeading", loginId: 12, facing: 3 });
  assert.deepEqual(parse("SUC1"), { type: "setYourCharacter", loginId: 1 });
  assert.deepEqual(parse("ERC77"), { type: "eraseCharacter", loginId: 77 });
});

test("login, map and chat packets", () => {
  assert.deepEqual(parse("LOKGoose"), { type: "loginOk", realm: "Goose" });
  assert.deepEqual(parse("LNOWrong password."), { type: "loginFail", message: "Wrong password." });
  assert.deepEqual(parse("SCM1,1,Minita"), { type: "sendCurrentMap", mapNumber: 1, mapVersion: 1, mapName: "Minita" });
  assert.deepEqual(parse("DSM"), { type: "doneSendingMap" });
  assert.deepEqual(parse("PING"), { type: "ping" });
  assert.deepEqual(parse("$7Auto-hunt started."), { type: "serverMessage", chatType: 7, message: "Auto-hunt started." });
  assert.deepEqual(parse("^1,Balinha: hi, there"), { type: "chat", loginId: 1, message: "Balinha: hi, there" });
});

test("packets the prototype does not render are reported, not thrown", () => {
  const r = parsePacket("IMN00000000");
  assert.equal(r.ok, false);
  const bad = parsePacket("MOCnot,a,number");
  assert.equal(bad.ok, false);
});

test("stream reassembly keeps partial packets", () => {
  const b = new PacketBuffer();
  assert.deepEqual(b.push("SUP1,1\x01MO"), ["SUP1,1"]);
  assert.deepEqual(b.push("C2,3,4\x01\x01PI"), ["MOC2,3,4"]);
  assert.deepEqual(b.push("NG\x01"), ["PING"]);
});

test("client packets match NetworkClient.cs", () => {
  assert.equal(ClientPackets.login("a", "b"), "LOGINa,b,GooseClient");
  assert.equal(ClientPackets.move(Direction.Up), "M1");
  assert.equal(ClientPackets.move(Direction.Left), "M4");
  assert.equal(ClientPackets.facing(Direction.Up), "F1");
  assert.equal(ClientPackets.facing(Direction.Right), "F4");
  assert.equal(ClientPackets.facing(Direction.Down), "F2");
  assert.equal(ClientPackets.facing(Direction.Left), "F3");
  assert.equal(ClientPackets.chat("hello"), ";hello");
});

test("AMAP parsing", () => {
  const w = 2, h = 1;
  const buf = new ArrayBuffer(10 + w * h * 17);
  const v = new DataView(buf);
  "AMAP".split("").forEach((c, i) => v.setUint8(i, c.charCodeAt(0)));
  v.setUint16(4, 1, true); v.setUint16(6, w, true); v.setUint16(8, h, true);
  v.setUint8(10, 1); v.setInt32(11, 120000, true);
  v.setUint8(27, 0); v.setInt32(28 + 8, 555, true);
  const m = parseMap(3, buf);
  assert.equal(m.width, 2);
  assert.deepEqual(Array.from(m.blocked), [1, 0]);
  assert.equal(m.layers[0], 120000);
  assert.equal(m.layers[4 + 2], 555);
});

test("tint and offsets follow the desktop client", () => {
  // C#: (byte)(((ta * ((tr + 256) - c)) >> 8) + c - ta)
  const cs = (c: number, t: number, a: number) => ((((a * ((t + 256) - c)) >> 8) + c - a) % 256 + 256) % 256;
  for (const [c, t, a] of [[200, 10, 100], [5, 255, 255], [128, 128, 50], [1, 0, 255]])
    assert.equal(tintPixel(c, t, a), cs(c, t, a));
  assert.deepEqual(frameOffset(32, 32, "map"), [0, 0]);
  assert.deepEqual(frameOffset(64, 96, "map"), [-16, -64]);
  assert.deepEqual(frameOffset(24, 48, "character"), [4, -16]);
  assert.deepEqual(frameOffset(48, 64, "character"), [-8, -24]);
});

test("Phase 2 packets in the formats Aspereta.csx sends", () => {
  assert.deepEqual(parse("ATT500"), { type: "attack", loginId: 500 });
  assert.deepEqual(parse("BT500,1,-14"), { type: "battleText", loginId: 500, kind: 1, text: "-14" });
  assert.deepEqual(parse("BT1,21"), { type: "battleText", loginId: 1, kind: 21, text: "" });
  assert.deepEqual(parse("VC500,50,0"), { type: "vitals", loginId: 500, hp: 50, mp: 0 });
  assert.deepEqual(parse("TNL37,68736,4064"), { type: "experience", percent: 37, experience: 68736, toNextLevel: 4064 });
  assert.deepEqual(parse("TNL100,2147483646,2147483646,3000000000"), { type: "experience", percent: 100, experience: 2147483646, toNextLevel: 3000000000 });
  const snf = parse("SNF,,Warrior,12,500,120,90,430,100,90,40,35,10,22,140,1,2,3,4,5,12345");
  assert.equal(snf.type, "statusInfo");
  if (snf.type === "statusInfo") {
    assert.equal(snf.data.className, "Warrior");
    assert.deepEqual([snf.data.level, snf.data.hp, snf.data.maxHp, snf.data.gold], [12, 430, 500, 12345]);
    assert.deepEqual(snf.data.resists, [1, 2, 3, 4, 5]);
  }
  assert.deepEqual(parse("MOB120100,87,17,Gold,10,*"), { type: "mapObject", graphic: 120100, x: 86, y: 16, name: "Gold", stack: 10, tint: [0, 0, 0, 0] });
  assert.deepEqual(parse("MOB120015,5,6,Red Sword (BoP),1,200,40,40,120"), { type: "mapObject", graphic: 120015, x: 4, y: 5, name: "Red Sword (BoP)", stack: 1, tint: [200, 40, 40, 120] });
  assert.deepEqual(parse("EOB87,17"), { type: "eraseObject", x: 86, y: 16 });
  assert.deepEqual(parse("SPP1,20"), { type: "spellCharacter", loginId: 1, animation: 20 });
  assert.deepEqual(parse("SPA10,11,21"), { type: "spellTile", x: 9, y: 10, animation: 21 });
  assert.deepEqual(parse("WPS800,0,0"), { type: "weaponSpeed", ms: 800 });
  assert.deepEqual(parse("EMOT1,3"), { type: "emote", loginId: 1, emote: 3 });
  assert.deepEqual(parse("SIS3,5004,Small Health Potion,5,120115,0,0,0,0"),
    { type: "inventorySlot", slot: 2, item: { itemId: 5004, name: "Small Health Potion", stack: 5, graphic: 120115, tint: [0, 0, 0, 0] } });
  assert.deepEqual(parse("SIS4"), { type: "inventorySlot", slot: 3, item: null });
  assert.deepEqual(parse("SSS1,Taunt 1,0,0,T,110000,0,5000"), { type: "spellSlot", slot: 0, spell: { name: "Taunt 1", targetable: true, graphic: 110000 } });
  assert.deepEqual(parse("SSS2,Rampant Rage,0,0,X,110033,0,120000"), { type: "spellSlot", slot: 1, spell: { name: "Rampant Rage", targetable: false, graphic: 110033 } });
  assert.deepEqual(parse("SSS3"), { type: "spellSlot", slot: 2, spell: null });
  assert.deepEqual(parse("BUF1,110033,Rampant Rage"), { type: "buffSlot", slot: 0, buff: { graphic: 110033, name: "Rampant Rage" } });
  assert.deepEqual(parse("BUF2"), { type: "buffSlot", slot: 1, buff: null });
  assert.equal(ClientPackets.use(1), "USE2");
  assert.equal(ClientPackets.cast(0, 500), "CAST1,500");
});

test("auto-hunt button follows the server's messages", async () => {
  const { AutoHuntTracker } = await import("../src/autohunt.js");
  const t = new AutoHuntTracker();
  assert.equal(t.next(), "/autohunt on");
  t.onServerMessage("Auto-hunt started.");
  assert.equal(t.state, "on");
  assert.equal(t.next(), "/autohunt pause");
  t.onServerMessage("Auto-hunt paused. /autohunt on resumes it, /autohunt off stops it.");
  assert.equal(t.state, "paused");
  t.onServerMessage("Auto-hunt resumed.");
  assert.equal(t.state, "on");
  t.onServerMessage("Auto-hunt stopped: you died.");
  assert.equal(t.state, "off");
  assert.equal(t.onServerMessage("Welcome!"), false);
});

test("server windows (MKW / WNF / ENW) and item-move packets", () => {
  assert.deepEqual(parse("MKW1001,13,Welcome to my shop!,0,1,0,0,0,1201,0,0"),
    { type: "makeWindow", window: { id: 1001, frame: 13, title: "Welcome to my shop!", buttons: [false, true, false, false, false], npcId: 1201, unknown1: 0, unknown2: 0 } });
  assert.deepEqual(parse("WNF11,4,Old Rags|1|5002|120241|0|0|0|0"),
    { type: "windowLine", windowId: 11, line: 3, data: { text: "Old Rags", stack: 1, itemId: 5002, graphic: 120241, tint: [0, 0, 0, 0] } });
  assert.deepEqual(parse("WNF11,2, |0|0|0|*"), { type: "windowLine", windowId: 11, line: 1, data: null });
  assert.deepEqual(parse("WNF1001,1,Small Health Potion (50)|0|5004|120115|*"),
    { type: "windowLine", windowId: 1001, line: 0, data: { text: "Small Health Potion (50)", stack: 0, itemId: 5004, graphic: 120115, tint: [0, 0, 0, 0] } });
  assert.deepEqual(parse("WNF1002,2,Damage: 1-3, fast|0|0|0|*"),
    { type: "windowLine", windowId: 1002, line: 1, data: { text: "Damage: 1-3, fast", stack: 0, itemId: 0, graphic: 0, tint: [0, 0, 0, 0] } });
  assert.deepEqual(parse("ENW1001"), { type: "endWindow", windowId: 1001 });
  const w = { id: 1001, frame: 13, title: "", buttons: [], npcId: 1201, unknown1: 3, unknown2: 4 };
  assert.equal(ClientPackets.windowButton(1, w), "WBC2,1001,1201,3,4");
  assert.equal(ClientPackets.change(0, 4), "CHANGE1,5");
  assert.equal(ClientPackets.drop(2, 6), "DRP3,6");
  assert.equal(ClientPackets.inventoryToWindow(0, 1003, 1), "ITW1,1003,2");
  assert.equal(ClientPackets.windowToInventory(1003, 0, 9), "WTI1003,1,10");
  assert.equal(ClientPackets.vendorBuy(1201, 0), "VPI1201,1");
  assert.equal(ClientPackets.vendorSell(1201, 0, 3), "VSI1201,1,3");
  assert.equal(ClientPackets.leftClick(70, 30), "LC71,31");
});

test("party (GUD) and quest indicator (CHI) packets", () => {
  assert.deepEqual(parse("GUD2,7,Tichuce,10,Mage"), { type: "groupUpdate", line: 1, loginId: 7, name: "Tichuce", level: 10, className: "Mage" });
  assert.deepEqual(parse("GUD2,0,,0,"), { type: "groupUpdate", line: 1, loginId: 0, name: "", level: 0, className: "" });
  assert.deepEqual(parse("CHI5297,30000,1"), { type: "characterIcon", loginId: 5297, sheet: 30000, graphic: 1 });
  assert.deepEqual(parse("CHI5297,0,0"), { type: "characterIcon", loginId: 5297, sheet: 0, graphic: 0 });
});

test("option lists, opening lines and server close (Packets.WindowLine / OpeningLine / CloseWindow)", () => {
  const mkw = parse("MKW7,27,Recipes,0,1,0,1,0,0,0,0");
  assert.equal(mkw.type, "makeWindow");
  if (mkw.type === "makeWindow") {
    assert.equal(mkw.window.frame, 27);
    assert.deepEqual(mkw.window.buttons, [false, true, false, true, false]);
  }

  // Extended line without tint: text|stack|item|sheet|graphic|*
  const plain = parse("WNF7,1,Cloth Robe|0|0|3|120055|*");
  assert.equal(plain.type, "windowLine");
  if (plain.type === "windowLine") {
    assert.equal(plain.line, 0);
    assert.deepEqual(plain.data, { text: "Cloth Robe", stack: 0, itemId: 0, graphic: 120055, tint: [0, 0, 0, 0] });
  }
  // Extended line with tint: text|stack|item|sheet|graphic|r|g|b|a
  const tinted = parse("WNF7,2,Dyed Robe|0|0|3|120055|10|20|30|40");
  if (tinted.type === "windowLine") assert.deepEqual(tinted.data?.tint, [10, 20, 30, 40]);
  assert.equal(tinted.type === "windowLine" && tinted.data?.graphic, 120055);
  // Aspereta's item and text lines keep their meaning.
  const item = parse("WNF11,4,Old Rags|1|5002|120241|0|0|0|0");
  if (item.type === "windowLine") assert.deepEqual(item.data, { text: "Old Rags", stack: 1, itemId: 5002, graphic: 120241, tint: [0, 0, 0, 0] });
  const vendor = parse("WNF9,3,Small Health Potion (5)|0|12|120100|*");
  if (vendor.type === "windowLine") assert.deepEqual(vendor.data, { text: "Small Health Potion (5)", stack: 0, itemId: 12, graphic: 120100, tint: [0, 0, 0, 0] });
  const text = parse("WNF5,2,Level 50 Warrior|0|0|0|*");
  if (text.type === "windowLine") assert.equal(text.data?.graphic, 0);

  const opening = parse("WNL7,Welcome, adventurer!");
  assert.deepEqual(opening, { type: "windowOpeningLine", windowId: 7, text: "Welcome, adventurer!" });
  assert.deepEqual(parse("CLW7"), { type: "closeWindow", windowId: 7 });

  const w = { id: 7, frame: 27, title: "Recipes", buttons: [false, true, false, true, false], npcId: 1201, unknown1: 0, unknown2: 0 };
  assert.equal(ClientPackets.windowLineClick(0, w), "WBC20,7,1201,0,0");
  assert.equal(ClientPackets.windowLineClick(7, w), "WBC27,7,1201,0,0");
  assert.equal(ClientPackets.windowButton(3, w), "WBC4,7,1201,0,0", "Next is ButtonTypes.Next (4)");
});

test("buff removal is KBUF with the 1-based bar slot (NetworkClient.KillBuff)", () => {
  assert.equal(ClientPackets.killBuff(0), "KBUF1");
  assert.equal(ClientPackets.killBuff(7), "KBUF8");
  const buf = parse("BUF2,110033,Rampant Rage");
  assert.deepEqual(buf, { type: "buffSlot", slot: 1, buff: { graphic: 110033, name: "Rampant Rage" } });
});
