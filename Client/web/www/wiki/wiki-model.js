// Aspereta wiki: data model.
//
// Turns the raw tables exported by `AsperetaWeb wiki` (data.js) into linked records. Nothing
// here invents values: every label below is copied from the game server's own enums and
// loaders (file named next to each), and anything the server doesn't define is shown raw.
//
// Classic script (no modules) so the wiki works from file:// too. Also loaded by the Node
// tests (client/test/wiki.test.mjs).
(function (root) {
  "use strict";

  // ---- Labels, from the server source ----------------------------------------------------

  /** ItemTemplate.UseTypes (Goose/ItemTemplate.cs). */
  const USE_TYPES = { 0: "No use", 1: "One-time use", 2: "Armor", 3: "Weapon", 4: "Scroll", 5: "Hair dye", 6: "Letter", 7: "Money", 8: "Recipe" };
  /** ItemTemplate.ItemSlots. */
  const ITEM_SLOTS = { 0: "Helmet", 1: "Shield", 2: "One-handed", 3: "Two-handed", 4: "Ring", 5: "Necklace", 6: "Pauldrons", 7: "Cloak", 8: "Belt", 9: "Gloves", 10: "Chest", 11: "Pants", 12: "Shoes", 13: "Mount", 20: "Misc" };
  /** ItemTemplate.ItemTypes. */
  const ITEM_TYPES = { 0: "None", 10: "Plate", 11: "Leather", 12: "Cloth", 13: "Mail", 14: "One-handed sword", 15: "Two-handed sword", 16: "One-handed blunt", 17: "Two-handed blunt", 18: "One-handed pierce", 19: "Two-handed pierce", 20: "Fist" };
  /** NPCTemplate.Types (Goose/NPCTemplate.cs). */
  const NPC_TYPES = { 2: "Monster", 10: "Vendor", 11: "Banker", 12: "Quest" };
  /** NPCTemplate.BehaviourTypes (stuck_behaviour). */
  const NPC_BEHAVIOURS = { 0: "Do nothing", 1: "Teleport to aggro", 2: "Teleport aggro" };
  /** Spell.SpellTargets (Goose/Spell.cs). */
  const SPELL_TARGETS = { 0: "Target", 1: "Self", 2: "Group" };
  /** SpellEffect.EffectTypes (Goose/SpellEffect.cs). */
  const EFFECT_TYPES = {
    0: "Formula", 1: "Buff", 2: "Permanent", 3: "Tick", 4: "Tick buff", 5: "Teleport", 6: "Bind", 7: "Stun",
    8: "Root", 9: "Snare", 10: "Viral", 11: "Invisible", 12: "See invisible", 13: "On attack", 14: "On melee hit",
    15: "Pet tame", 16: "Pet attack", 17: "Pet defend", 18: "Pet destroy", 19: "Pet follow", 20: "Pet neutral", 21: "Script",
  };
  /** SpellEffect.TargetTypes. */
  const EFFECT_TARGET_TYPES = { 0: "Target", 1: "Line in front", 2: "Cross", 3: "Plus", 4: "Random", 5: "Area", 6: "Triangle in front" };
  /** SpellEffect.SpellDisplays. */
  const EFFECT_DISPLAYS = { 0: "Character", 1: "Tile" };
  /** SpellEffect.SpellEffected (bit field). */
  const EFFECTED_BITS = [[1, "Self"], [2, "NPCs"], [4, "Players"]];
  /** SpellEffect.EnergyTypes (bit field). */
  const ENERGY_BITS = [[1, "None"], [2, "Fire"], [4, "Water"], [8, "Spirit"], [16, "Air"], [32, "Earth"]];
  /** Quests/QuestRequirement.cs RequirementType. */
  const REQUIREMENT_TYPES = { 0: "Gold", 1: "Item", 2: "Kill", 3: "Talk to NPC", 4: "Experience banked", 5: "Experience sold", 6: "Nothing equipped", 7: "Script" };
  /** Quests/QuestReward.cs RewardType. */
  const REWARD_TYPES = {
    0: "Gold", 1: "Item", 2: "Title", 3: "Surname", 4: "Teleport", 5: "Experience", 6: "Face graphic", 7: "Body graphic",
    8: "Hair graphic", 9: "Hair colour", 10: "Body colour", 11: "Class change", 12: "HP", 13: "MP", 14: "AC", 15: "Stamina",
    16: "Strength", 17: "Dexterity", 18: "Intelligence", 19: "Spell buff", 20: "Learn spell", 21: "Script",
  };

  /** Stat columns shared by items, NPCs and spell effects, with the game's names. */
  const STATS = [
    ["hp", "HP"], ["mp", "MP"], ["sp", "SP"],
    ["stat_ac", "AC"], ["stat_str", "Strength"], ["stat_sta", "Stamina"], ["stat_dex", "Dexterity"], ["stat_int", "Intelligence"],
    ["res_fire", "Fire resist"], ["res_water", "Water resist"], ["res_spirit", "Spirit resist"], ["res_air", "Air resist"], ["res_earth", "Earth resist"],
  ];

  function label(map, value) {
    return Object.prototype.hasOwnProperty.call(map, value) ? map[value] : "Unknown (" + value + ")";
  }

  function bits(list, value) {
    const v = Number(value) || 0;
    const names = list.filter(([bit]) => (v & bit) !== 0).map(([, name]) => name);
    let known = 0;
    for (const [bit] of list) known |= bit;
    if (v & ~known) names.push("other bits " + (v & ~known));
    return names;
  }

  /** "0"/"1" text flags the way the server reads most of them: anything but "0" is true. */
  function notZero(value) { return String(value ?? "0") !== "0"; }
  /** The few flags the server reads as "exactly 1" (stationary, see_invisible, invincible). */
  function isOne(value) { return String(value ?? "") === "1"; }

  /** Space/comma separated id lists, the way the server splits quest_ids, npc_alliance, ... */
  function idList(text) {
    return String(text ?? "").split(/[ ,]+/).filter(Boolean).map(Number).filter(Number.isFinite);
  }

  /** Quest texts store line breaks as a literal backslash-n (the game windows split on it). */
  function gameText(text) { return String(text ?? "").replace(/\\n/g, "\n"); }

  /**
   * class_restrictions (Goose/Class.cs CanUse): 0 means every class; otherwise bit N set means
   * class id N may use it.
   */
  function classesAllowed(mask, classes) {
    const m = BigInt(Math.trunc(Number(mask) || 0));
    if (m === 0n) return { all: true, classes: [], unknownBits: [] };
    const allowed = [];
    let known = 0n;
    for (const c of classes) {
      const bit = 1n << BigInt(c.class_id);
      known |= bit;
      if (m & bit) allowed.push(c);
    }
    const unknownBits = [];
    for (let i = 0n; i < 64n; i++) if ((m & (1n << i)) && !(known & (1n << i))) unknownBits.push(Number(i));
    return { all: false, classes: allowed, unknownBits };
  }

  /** Drop chance in percent: NPC.DropItems rolls 1..1e9 <= modifier × droprate × 1e7. */
  function dropPercent(droprate) {
    return Number((Number(droprate) || 0).toPrecision(6));
  }

  // ---- Model ----------------------------------------------------------------------------

  function rowsOf(data, name) {
    const table = data.tables && data.tables[name];
    if (!table) return [];
    const cols = table.columns;
    return table.rows.map((r) => {
      const o = {};
      for (let i = 0; i < cols.length; i++) o[cols[i]] = r[i];
      return o;
    });
  }

  function byId(rows, key) {
    const m = new Map();
    for (const r of rows) m.set(r[key], r);
    return m;
  }

  function push(map, key, value) {
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    list.push(value);
  }

  function build(data) {
    const t = (name) => rowsOf(data, name);
    const classes = t("classes").sort((a, b) => a.class_id - b.class_id);
    const items = t("item_templates");
    const npcs = t("npc_templates");
    const spells = t("spells");
    const effects = t("spell_effects");
    const maps = t("maps");
    const quests = t("quests");
    const combos = t("combinations");
    const titles = t("item_titles");
    const surnames = t("item_surnames");

    const m = {
      meta: { generated: data.generated, source: data.source, tables: Object.keys(data.tables || {}) },
      classes, items, npcs, spells, effects, maps, quests, combos,
      modifiers: titles.map((r) => Object.assign({ kind: "Title", key: "t" + r.id }, r))
        .concat(surnames.map((r) => Object.assign({ kind: "Surname", key: "s" + r.id }, r))),
      item: byId(items, "item_template_id"),
      npc: byId(npcs, "npc_id"),
      spell: byId(spells, "spell_id"),
      effect: byId(effects, "spell_effect_id"),
      map: byId(maps, "map_id"),
      quest: byId(quests, "id"),
      combo: byId(combos, "combination_id"),
      cls: byId(classes, "class_id"),
      // Relations
      dropsByNpc: new Map(), dropsByItem: new Map(),
      stockByNpc: new Map(), stockByItem: new Map(),
      spawnsByNpc: new Map(), spawnsByMap: new Map(),
      levelSpellsByClass: new Map(), levelSpellsBySpell: new Map(),
      spellsByEffect: new Map(), itemsByEffect: new Map(), itemsTeaching: new Map(),
      requiredByMap: new Map(), mapsRequiringItem: new Map(),
      reqsByQuest: new Map(), rewardsByQuest: new Map(), questsByItem: new Map(), questsByNpc: new Map(), npcsByQuest: new Map(),
      comboInputs: new Map(), comboOutputs: new Map(), combosUsing: new Map(), combosMaking: new Map(),
      questsTeaching: new Map(),
    };

    for (const d of t("npc_drops")) {
      push(m.dropsByNpc, d.npc_template_id, d);
      push(m.dropsByItem, d.item_template_id, d);
    }
    for (const v of t("npc_vendor_items")) {
      push(m.stockByNpc, v.npc_template_id, v);
      push(m.stockByItem, v.item_template_id, v);
    }
    for (const list of m.stockByNpc.values()) list.sort((a, b) => a.slot - b.slot);

    // Spawns, counted per npc and map (7000+ rows; the positions stay in the raw table).
    const spawnCount = new Map();
    for (const s of t("npc_spawns")) {
      const key = s.npc_id + ":" + s.map_id;
      spawnCount.set(key, (spawnCount.get(key) || 0) + 1);
    }
    for (const [key, count] of spawnCount) {
      const [npc, map] = key.split(":").map(Number);
      push(m.spawnsByNpc, npc, { map_id: map, count });
      push(m.spawnsByMap, map, { npc_id: npc, count });
    }

    for (const l of t("classes_levelup_spells")) {
      push(m.levelSpellsByClass, l.class_id, l);
      push(m.levelSpellsBySpell, l.spell_id, l);
    }
    for (const s of spells) if (s.spell_effect_id) push(m.spellsByEffect, s.spell_effect_id, s);
    for (const i of items) {
      if (i.spell_effect_id) push(m.itemsByEffect, i.spell_effect_id, i);
      if (i.learn_spell_id) push(m.itemsTeaching, i.learn_spell_id, i);
    }
    for (const r of t("map_required_items")) {
      push(m.requiredByMap, r.map_id, r.item_template_id);
      push(m.mapsRequiringItem, r.item_template_id, r.map_id);
    }

    for (const r of t("quest_requirements")) {
      push(m.reqsByQuest, r.quest_id, r);
      if (r.requirement_type === 1) push(m.questsByItem, r.requirement_value, { quest_id: r.quest_id, role: "Required" });
      if (r.requirement_type === 2 || r.requirement_type === 3) push(m.questsByNpc, r.requirement_value, { quest_id: r.quest_id, role: label(REQUIREMENT_TYPES, r.requirement_type) });
    }
    for (const r of t("quest_rewards")) {
      push(m.rewardsByQuest, r.quest_id, r);
      if (r.reward_type === 1) push(m.questsByItem, r.long_value, { quest_id: r.quest_id, role: "Reward" });
      if (r.reward_type === 20) push(m.questsTeaching, r.long_value, r.quest_id);
    }
    for (const n of npcs) for (const q of idList(n.quest_ids)) push(m.npcsByQuest, q, n.npc_id);

    for (const r of t("combination_item_required")) {
      push(m.comboInputs, r.combination_id, r.item_template_id);
      push(m.combosUsing, r.item_template_id, r.combination_id);
    }
    for (const r of t("combination_item_results")) {
      push(m.comboOutputs, r.combination_id, r.item_template_id);
      push(m.combosMaking, r.item_template_id, r.combination_id);
    }

    return m;
  }

  /** Groups repeated ids into [id, count] pairs, keeping first-seen order. */
  function countIds(ids) {
    const counts = new Map();
    for (const id of ids || []) counts.set(id, (counts.get(id) || 0) + 1);
    return [...counts];
  }

  // ---- Pictures ----------------------------------------------------------------------------
  //
  // The converted client assets (www/assets/index.json, also exported as assets-index.js):
  // frames: id -> [sheet, x, y, w, h]; animations: id -> [interval, frame...];
  // compiled: [type, id, animation per (bodyState - 1) + facing * 4 ...].

  /** CompiledEnc.cs AnimationType. */
  const ANIM = { Body: 0, Hair: 1, Hand: 2, Chest: 3, Helm: 4, Legs: 5, Feet: 6 };
  /** Direction as the browser client numbers it (protocol.ts). */
  const DOWN = 2;

  function assetIndex(index) {
    if (!index || !index.frames) return null;
    const compiled = new Map();
    for (const entry of index.compiled || []) compiled.set(entry[0] + ":" + entry[1], entry.slice(2));
    return { frames: index.frames, animations: index.animations || {}, compiled };
  }

  /**
   * equipped_items as the server sends it in MKC: six entries of either "graphic,*" or
   * "graphic,r,g,b,a" (the last field may carry a trailing "*"). Same reading as the
   * browser client's parseEquipment.
   */
  function parseEquipped(text) {
    const parts = String(text ?? "").split(",");
    let i = 0;
    const next = () => parts[i++] ?? "0";
    const out = [];
    for (let slot = 0; slot < 6; slot++) {
      const graphic = parseInt(next(), 10) || 0;
      if ((parts[i] ?? "*").trim() === "*") {
        i++;
        out.push([graphic, 0, 0, 0, 0]);
      } else {
        const r = parseInt(next(), 10) || 0, g = parseInt(next(), 10) || 0, b = parseInt(next(), 10) || 0;
        const a = parseInt(next().replace("*", ""), 10) || 0;
        out.push([graphic, r, g, b, a]);
      }
    }
    return out;
  }

  /** Character.cs frame offsets (assets.ts frameOffset, "character"). */
  function characterOffset(w, h) {
    const x = 16 - Math.trunc(w / 2);
    const y = h > 32 ? -Math.max(Math.trunc((h - 48) / 2), 0) - 16 : 0;
    return [x, y];
  }

  /**
   * The layers the game draws for an NPC standing still and facing down, in draw order:
   * the same appearance the server sends (Aspereta.csx MakeNPCCharacter) drawn the way the
   * browser client draws it (character.ts). Returns null when the NPC has no picture.
   */
  function npcLayers(npc, assets) {
    if (!assets) return null;
    const bodyId = Number(npc.body_id) || 0;
    const monster = bodyId >= 100;
    const bodyState = monster ? 1 : Number(npc.body_state) || 0;
    const eq = parseEquipped(npc.equipped_items);
    const tint = (e) => (e[0] === 0 || e[4] === 0 ? null : [e[1], e[2], e[3], e[4]]);
    const hairTint = [npc.hair_r, npc.hair_g, npc.hair_b, npc.hair_a].map((v) => Number(v) || 0);

    // Character.DrawAnimations order: Body, Face, Feet, Legs, Chest, Hair, Head, Shield, Weapon.
    const slots = [
      [bodyId, ANIM.Body, null],
      [monster ? 0 : Number(npc.face_id) || 0, ANIM.Hair, null],
      [eq[3][0], ANIM.Feet, tint(eq[3])],
      [eq[2][0], ANIM.Legs, tint(eq[2])],
      [eq[0][0], ANIM.Chest, tint(eq[0])],
      [monster ? 0 : Number(npc.hair_id) || 0, ANIM.Hair, hairTint[3] > 0 ? hairTint : null],
      [eq[1][0], ANIM.Helm, tint(eq[1])],
      [eq[4][0], ANIM.Hand, tint(eq[4])],
      [eq[5][0], ANIM.Hand, tint(eq[5])],
    ];

    const layers = [];
    slots.forEach(([id, type, t], slot) => {
      if (!id || (monster && slot !== 0)) return;
      const compiled = assets.compiled.get(type + ":" + id);
      if (!compiled) return;
      const index = (bodyState - 1) + DOWN * 4;
      if (index < 0 || index >= compiled.length) return;
      const animation = assets.animations[compiled[index]];
      if (!animation || animation.length < 2) return;
      const frameId = animation[1];
      const frame = assets.frames[frameId];
      if (!frame) return;
      const [file, x, y, w, h] = frame;
      const [dx, dy] = characterOffset(w, h);
      layers.push({ frameId, file, x, y, w, h, dx, dy, tint: t && t[3] > 0 ? t : null });
    });
    if (!layers.length) return null;

    const left = Math.min(...layers.map((l) => l.dx)), top = Math.min(...layers.map((l) => l.dy));
    const right = Math.max(...layers.map((l) => l.dx + l.w)), bottom = Math.max(...layers.map((l) => l.dy + l.h));
    return { layers, left, top, width: right - left, height: bottom - top };
  }

  root.AsperetaWikiModel = {
    assetIndex, parseEquipped, characterOffset, npcLayers,
    USE_TYPES, ITEM_SLOTS, ITEM_TYPES, NPC_TYPES, NPC_BEHAVIOURS, SPELL_TARGETS, EFFECT_TYPES,
    EFFECT_TARGET_TYPES, EFFECT_DISPLAYS, EFFECTED_BITS, ENERGY_BITS, REQUIREMENT_TYPES, REWARD_TYPES, STATS,
    label, bits, notZero, isOne, idList, gameText, classesAllowed, dropPercent, countIds, rowsOf, build,
  };
})(typeof window !== "undefined" ? window : globalThis);
