import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeText, encodeText, parsePacket } from "../src/protocol.js";
import {
  AutoHuntConfig, AutoHuntSpell, addEntry, candidates, configCommand, describeSpell, emptySettings, moveEntry,
  normalizeSettings, parseConfig, removeEntry, statusLabel,
} from "../src/autohuntconfig.js";

function spell(id: number, cat: AutoHuntSpell["cat"], extra: Partial<AutoHuntSpell> = {}): AutoHuntSpell {
  return { slot: id, id, name: `Spell ${id}`, cat, tgt: 0, area: 0, size: 0, eff: 6, mp: 10, aether: 500, taunt: 0, dur: 0, gfx: 110012, file: 0, ok: true, ...extra };
}

function config(): AutoHuntConfig {
  return {
    cfg: emptySettings(),
    spells: [
      spell(5, "attack"),
      spell(14, "attack", { area: 5, size: 4 }),
      spell(1, "heal", { eff: 5 }),
      spell(107, "heal", { tgt: 2 }),
      spell(2, "buff", { dur: 600, aether: 5000 }),
      spell(4, "taunt", { taunt: 1000 }),
    ],
    radius: 12,
    minhp: 5,
    step: 350,
  };
}

test("AHC and AHS packets parse", () => {
  const json = JSON.stringify({ cfg: { atk: [{ id: 5 }] }, spells: [spell(5, "attack")], radius: 12 });
  const result = parsePacket("AHC" + encodeText(json));
  assert.ok(result.ok);
  assert.deepEqual(result.packet, { type: "autoHuntConfig", json });

  const status = parsePacket("AHScasting," + encodeText("Elemental Strike > Rat"));
  assert.ok(status.ok);
  assert.deepEqual(status.packet, { type: "autoHuntStatus", state: "casting", detail: "Elemental Strike > Rat" });

  const bare = parsePacket("AHSpaused,");
  assert.ok(bare.ok);
  assert.deepEqual(bare.packet, { type: "autoHuntStatus", state: "paused", detail: "" });
});

test("parseConfig normalizes and clamps settings", () => {
  const parsed = parseConfig(JSON.stringify({
    cfg: { atk: [{ id: 5, mp: 400, rng: 0 }], heal: [{ id: 1, hp: -3, on: false }], min: 9, max: 4, melee: false },
    spells: [spell(5, "attack")],
  }));
  assert.ok(parsed);
  assert.equal(parsed.cfg.atk[0].mp, 100);
  assert.equal(parsed.cfg.atk[0].rng, 1);
  assert.equal(parsed.cfg.heal[0].hp, 0);
  assert.equal(parsed.cfg.heal[0].on, false);
  assert.equal(parsed.cfg.max, 4);
  assert.equal(parsed.cfg.min, 4);
  assert.equal(parsed.cfg.melee, false);
  assert.equal(parseConfig("{nope"), null);
});

test("candidates only offer unused spells of the tab's category", () => {
  const c = config();
  assert.deepEqual(candidates(c, c.cfg, "atk").map((s) => s.id), [5, 14]);
  assert.deepEqual(candidates(c, c.cfg, "heal").map((s) => s.id), [1, 107]);
  assert.deepEqual(candidates(c, c.cfg, "buf").map((s) => s.id), [2]);
  assert.ok(addEntry(c.cfg, "atk", c.spells[0]));
  assert.deepEqual(candidates(c, c.cfg, "atk").map((s) => s.id), [14]);
});

test("new entries get sensible defaults for their spell", () => {
  const c = config();
  addEntry(c.cfg, "atk", c.spells[1]);
  assert.equal(c.cfg.atk[0].aoe, 2);
  addEntry(c.cfg, "heal", c.spells[3]);
  assert.equal(c.cfg.heal[0].hp, 60);
  assert.equal(c.cfg.heal[0].aoe, 2);
  addEntry(c.cfg, "heal", c.spells[2]);
  assert.equal(c.cfg.heal[1].aoe, 1);
  assert.equal(addEntry(c.cfg, "heal", c.spells[2]), false);
});

test("priority moves and removal", () => {
  const c = config();
  addEntry(c.cfg, "atk", c.spells[0]);
  addEntry(c.cfg, "atk", c.spells[1]);
  assert.equal(moveEntry(c.cfg, "atk", 0, -1), false);
  assert.ok(moveEntry(c.cfg, "atk", 1, -1));
  assert.deepEqual(c.cfg.atk.map((e) => e.id), [14, 5]);
  removeEntry(c.cfg, "atk", 0);
  assert.deepEqual(c.cfg.atk.map((e) => e.id), [5]);
});

test("configCommand round-trips through base64 JSON", () => {
  const settings = normalizeSettings({ atk: [{ id: 5, on: true, mp: 20, hp: 0, rng: 6, aoe: 1, re: 0 }], melee: false, max: 6, min: 3 });
  const command = configCommand(settings);
  assert.ok(command.startsWith("/autohunt config "));
  assert.ok(!command.slice("/autohunt config ".length).includes(" "));
  assert.deepEqual(JSON.parse(decodeText(command.slice("/autohunt config ".length))), settings);
});

test("spell descriptions and status labels", () => {
  assert.equal(describeSpell(spell(14, "attack", { area: 5, size: 4, mp: 80, aether: 1000 })), "Area 4 · 80 MP · 1s cooldown");
  assert.equal(describeSpell(spell(107, "heal", { tgt: 2, mp: 100, aether: 0 })), "Group · 100 MP");
  assert.equal(describeSpell(spell(2, "buff", { mp: 20, aether: 5000, dur: 600 })), "Single target · 20 MP · 5s cooldown · lasts 10m");
  assert.equal(statusLabel("repositioning"), "Repositioning");
});
