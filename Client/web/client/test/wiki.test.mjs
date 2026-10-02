// Tests for the static wiki (www/wiki). Plain JS: the wiki scripts are classic browser
// scripts, so they are loaded into a VM context here the same way a page would load them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const wikiDir = new URL("../../www/wiki/", import.meta.url);
const exporter = new URL("../../tools/AsperetaWeb/WikiExporter.cs", import.meta.url);

function loadModel(extra = {}) {
  const context = vm.createContext({ ...extra });
  context.window = context;
  vm.runInContext(readFileSync(new URL("wiki-model.js", wikiDir), "utf8"), context, { filename: "wiki-model.js" });
  return context.AsperetaWikiModel;
}

// Values built inside the VM have that context's Array/Object, so compare as plain data.
function same(actual, expected, message) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message);
}

function table(columns, rows) {
  return { columns, rows };
}

const CLASSES = table(["class_id", "class_name"], [[1, "Commoner"], [2, "Rogue"], [3, "Warrior"], [4, "Magus"], [5, "Priest"], [6, "Game Master"]]);

const FIXTURE = {
  version: 1,
  generated: "test",
  source: "fixture.db",
  tables: {
    classes: CLASSES,
    item_templates: table(["item_template_id", "item_name", "item_usetype", "spell_effect_id", "learn_spell_id"],
      [[1, "Gold", 7, 0, 0], [10, "Sword", 3, 5, 0], [11, "Tome", 4, 0, 2], [12, "Cloth", 0, 0, 0], [13, "Robe", 2, 0, 0]]),
    npc_templates: table(["npc_id", "npc_name", "quest_ids", "npc_alliance"], [[1, "Mouse", "", "1"], [2, "Tavon", "5", ""], [3, "Shopkeeper", "", ""]]),
    npc_drops: table(["npc_template_id", "item_template_id", "stack", "droprate"], [[1, 1, 5, 50], [1, 10, 1, 0.5]]),
    npc_vendor_items: table(["npc_template_id", "item_template_id", "stack", "stats_visible", "slot"], [[3, 12, 1, "1", 2], [3, 11, 1, "0", 1]]),
    npc_spawns: table(["npc_id", "map_id", "map_x", "map_y", "properties"], [[1, 7, 1, 1, ""], [1, 7, 2, 2, ""], [1, 8, 3, 3, ""], [2, 7, 4, 4, ""]]),
    spells: table(["spell_id", "spell_name", "spell_effect_id"], [[2, "Heal", 5]]),
    spell_effects: table(["spell_effect_id", "spell_effect_name", "effect_type"], [[5, "Heal effect", 0]]),
    classes_levelup_spells: table(["class_id", "level", "spell_id"], [[5, 4, 2]]),
    maps: table(["map_id", "map_name"], [[7, "Minita"], [8, "Cave"]]),
    map_required_items: table(["map_id", "item_template_id"], [[8, 12]]),
    quests: table(["id", "name", "prerequisite_quests"], [[5, "Mouse Killer", ""]]),
    quest_requirements: table(["id", "quest_id", "requirement_type", "requirement_value", "requirement_value2", "keep_requirement"], [[1, 5, 2, 1, 15, "0"]]),
    quest_rewards: table(["id", "quest_id", "reward_type", "long_value", "long_value2", "string_value"], [[1, 5, 1, 13, 1, ""], [2, 5, 20, 2, 0, ""]]),
    combinations: table(["combination_id", "combination_name"], [[1, "Robe"]]),
    combination_item_required: table(["combination_id", "item_template_id"], [[1, 12], [1, 12], [1, 12]]),
    combination_item_results: table(["combination_id", "item_template_id"], [[1, 13]]),
    item_titles: table(["id", "name"], [[1, "Powerful"]]),
    item_surnames: table(["id", "name"], [[1, "of Vitality"]]),
  },
};

test("class_restrictions: 0 is every class, otherwise bit N allows class id N (Class.CanUse)", () => {
  const W = loadModel();
  const classes = W.rowsOf({ tables: { classes: CLASSES } }, "classes");
  assert.equal(W.classesAllowed(0, classes).all, true);
  same(W.classesAllowed(32, classes).classes.map((c) => c.class_name), ["Priest"]);
  same(W.classesAllowed(4 | 8, classes).classes.map((c) => c.class_name), ["Rogue", "Warrior"]);
  const odd = W.classesAllowed((1 << 10) | 2, classes);
  same(odd.classes.map((c) => c.class_name), ["Commoner"]);
  same(odd.unknownBits, [10]);
});

test("labels come from the server enums and unknown values stay visible", () => {
  const W = loadModel();
  assert.equal(W.label(W.USE_TYPES, 3), "Weapon");
  assert.equal(W.label(W.ITEM_SLOTS, 20), "Misc");
  assert.equal(W.label(W.ITEM_TYPES, 20), "Fist");
  assert.equal(W.label(W.NPC_TYPES, 12), "Quest");
  assert.equal(W.label(W.EFFECT_TYPES, 21), "Script");
  assert.equal(W.label(W.REWARD_TYPES, 21), "Script");
  assert.equal(W.label(W.REQUIREMENT_TYPES, 7), "Script");
  assert.equal(W.label(W.USE_TYPES, 99), "Unknown (99)");
  same(W.bits(W.EFFECTED_BITS, 7), ["Self", "NPCs", "Players"]);
  same(W.bits(W.ENERGY_BITS, 2 | 64), ["Fire", "other bits 64"]);
});

test("flags and lists are read the way the server reads them", () => {
  const W = loadModel();
  assert.equal(W.notZero("0"), false);
  assert.equal(W.notZero("1"), true);
  assert.equal(W.notZero("yes"), true);
  assert.equal(W.isOne("2"), false);
  assert.equal(W.isOne("1"), true);
  same(W.idList("287,288,289,000"), [287, 288, 289, 0]);
  same(W.idList("3 4"), [3, 4]);
  same(W.idList(""), []);
  assert.equal(W.gameText("a\\nb"), "a\nb");
});

test("drop rate is a percentage per kill (NPC.DropItems: 1..1e9 <= droprate * 1e7)", () => {
  const W = loadModel();
  assert.equal(W.dropPercent(50), 50);
  assert.equal(W.dropPercent(0.30000000000000004), 0.3);
});

test("model links drops, vendors, spawns, spells, quests, recipes and modifiers", () => {
  const W = loadModel();
  const M = W.build(FIXTURE);
  assert.equal(M.items.length, 5);
  same(M.dropsByItem.get(10).map((d) => d.npc_template_id), [1]);
  same(M.dropsByNpc.get(1).map((d) => d.item_template_id), [1, 10]);
  same(M.stockByNpc.get(3).map((v) => v.item_template_id), [11, 12], "vendor stock sorted by slot");
  same(M.spawnsByNpc.get(1), [{ map_id: 7, count: 2 }, { map_id: 8, count: 1 }]);
  same(M.spawnsByMap.get(7), [{ npc_id: 1, count: 2 }, { npc_id: 2, count: 1 }]);
  same(M.itemsByEffect.get(5).map((i) => i.item_template_id), [10]);
  same(M.itemsTeaching.get(2).map((i) => i.item_template_id), [11]);
  same(M.levelSpellsBySpell.get(2), [{ class_id: 5, level: 4, spell_id: 2 }]);
  same(M.questsByNpc.get(1), [{ quest_id: 5, role: "Kill" }]);
  same(M.questsByItem.get(13), [{ quest_id: 5, role: "Reward" }]);
  same(M.questsTeaching.get(2), [5]);
  same(M.npcsByQuest.get(5), [2]);
  same(W.countIds(M.comboInputs.get(1)), [[12, 3]]);
  same(M.combosMaking.get(13), [1]);
  same(M.mapsRequiringItem.get(12), [8]);
  same(M.modifiers.map((m) => m.kind + ":" + m.name), ["Title:Powerful", "Surname:of Vitality"]);
});

test("missing tables give empty sections instead of failing", () => {
  const W = loadModel();
  const M = W.build({ tables: { item_templates: FIXTURE.tables.item_templates } });
  assert.equal(M.items.length, 5);
  assert.equal(M.npcs.length, 0);
  assert.equal(M.dropsByItem.size, 0);
});

test("the exporter writes every table the wiki reads, and only game-data tables", () => {
  const cs = readFileSync(exporter, "utf8");
  const exported = [...cs.slice(cs.indexOf("Tables ="), cs.indexOf("};", cs.indexOf("Tables ="))).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  const model = readFileSync(new URL("wiki-model.js", wikiDir), "utf8");
  const used = [...new Set([...model.matchAll(/t\("([a-z_]+)"\)/g)].map((m) => m[1]))];
  for (const name of used) assert.ok(exported.includes(name), name + " is read by the wiki but not exported");
  for (const name of exported) assert.ok(!/player|account|log|guild|pet|bank/.test(name), name + " looks like player data");
});

test("wiki.js parses and the page loads its scripts in order", () => {
  new vm.Script(readFileSync(new URL("wiki.js", wikiDir), "utf8"), { filename: "wiki.js" });
  const html = readFileSync(new URL("index.html", wikiDir), "utf8");
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  same(scripts, ["data.js", "assets-index.js", "wiki-model.js", "wiki.js"]);
  assert.ok(!/type="module"/.test(html), "classic scripts, so file:// works");
  // WikiExporter.WriteSingleFile replaces these exact tags when it inlines the page.
  for (const tag of ['<link rel="stylesheet" href="wiki.css">', '<script src="data.js"></script>',
    '<script src="assets-index.js" onerror="void 0"></script>', '<script src="wiki-model.js"></script>', '<script src="wiki.js"></script>']) {
    assert.ok(html.includes(tag), tag);
  }
  const cs = readFileSync(exporter, "utf8");
  assert.ok(cs.includes('<link rel=\\"stylesheet\\" href=\\"wiki.css\\">'), "exporter inlines wiki.css");
  assert.ok(cs.includes('<script src=\\"assets-index.js\\" onerror=\\"void 0\\"></script>'), "exporter inlines assets-index.js");
});

test("equipped_items is read like the client's MKC parser", () => {
  const W = loadModel();
  same(W.parseEquipped("0,*,0,*,0,*,0,*,0,*,0,*"), [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]);
  same(W.parseEquipped("12,10,20,30,40*,0,*,5,*,0,*,0,*,7,1,2,3,4"),
    [[12, 10, 20, 30, 40], [0, 0, 0, 0, 0], [5, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [7, 1, 2, 3, 4]]);
});

test("NPC pictures use the facing-down standing frame of each layer, monsters only their body", () => {
  const W = loadModel();
  // compiled entry: [type, id, anim for index 0..11]; index = (bodyState - 1) + 2 * 4 (down).
  const anims = (base) => Array.from({ length: 12 }, (_, i) => base + i);
  const assets = W.assetIndex({
    frames: { 900: [1, 0, 0, 64, 64], 500: [2, 0, 0, 32, 48], 610: [2, 32, 0, 32, 48], 710: [3, 0, 0, 32, 48] },
    animations: { 108: [5, 900, 901], 208: [5, 500], 309: [5, 610], 408: [5, 710] },
    compiled: [[0, 150, ...anims(100)], [0, 1, ...anims(200)], [3, 4, ...anims(300)], [1, 2, ...anims(400)]],
  });
  const monster = W.npcLayers({ body_id: 150, body_state: 3, hair_id: 2, face_id: 0, equipped_items: "4,1,1,1,1*,0,*,0,*,0,*,0,*,0,*" }, assets);
  same(monster.layers.map((l) => l.frameId), [900], "body >= 100: one graphic, state 1");
  same([monster.left, monster.top, monster.width, monster.height], [-16, -24, 64, 64]);

  const person = W.npcLayers({ body_id: 1, body_state: 1, hair_id: 2, hair_r: 9, hair_g: 8, hair_b: 7, hair_a: 6, face_id: 0,
    equipped_items: "4,1,2,3,99*,0,*,0,*,0,*,0,*,0,*" }, assets);
  same(person.layers.map((l) => l.frameId), [500, 710], "chest (state 2 anim missing) is skipped, hair drawn after body");
  same(person.layers[1].tint, [9, 8, 7, 6]);
  const state2 = W.npcLayers({ body_id: 1, body_state: 2, hair_id: 0, face_id: 0, equipped_items: "4,1,2,3,99*,0,*,0,*,0,*,0,*,0,*" }, assets);
  same(state2.layers.map((l) => [l.frameId, l.tint]), [[610, [1, 2, 3, 99]]], "body has no state-2 frame here; chest does, tinted");
  assert.equal(W.npcLayers({ body_id: 0 }, assets), null);
  assert.equal(W.npcLayers({ body_id: 150 }, null), null);
});

test("generated data.js (when present) builds a consistent model", { skip: !existsSync(new URL("data.js", wikiDir)) }, () => {
  const context = vm.createContext({});
  context.window = context;
  vm.runInContext(readFileSync(new URL("data.js", wikiDir), "utf8"), context, { filename: "data.js" });
  const data = context.ASPERETA_WIKI;
  assert.equal(data.version, 1);
  const W = loadModel();
  const M = W.build(data);
  assert.equal(M.items.length, data.tables.item_templates.rows.length);
  assert.equal(M.npcs.length, data.tables.npc_templates.rows.length);
  for (const [name, t] of Object.entries(data.tables)) {
    for (const row of t.rows) assert.equal(row.length, t.columns.length, name + " row width");
  }
  assert.ok(M.items.every((i) => typeof i.item_name === "string"));
});
