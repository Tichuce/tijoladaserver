// Aspereta wiki: user interface. Static: reads window.ASPERETA_WIKI (data.js) and the model
// from wiki-model.js. Pictures come from the browser client's converted assets (see Icons);
// without them the wiki still works, just without pictures.
(function () {
  "use strict";

  const W = window.AsperetaWikiModel;
  const app = document.getElementById("app");
  const nav = document.getElementById("sections");
  const footer = document.getElementById("footer");

  if (!window.ASPERETA_WIKI || !W) {
    app.innerHTML = '<div class="empty"><h2>No game data yet</h2><p>Run <code>build-wiki.bat</code> (in <code>Client\\web</code>) to export the game data into <code>www\\wiki\\data.js</code>, then reload this page.</p></div>';
    return;
  }

  const M = W.build(window.ASPERETA_WIKI);

  // ---- Small helpers ----------------------------------------------------------------------

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 6 }) : esc(v));
  const signed = (v) => (v > 0 ? '<span class="pos">+' + num(v) + "</span>" : v < 0 ? '<span class="neg">' + num(v) + "</span>" : num(v));
  const isEmpty = (v) => v === null || v === undefined || v === "" || v === 0 || v === "0";

  function range(min, max, unit) {
    const a = Number(min) || 0, b = Number(max) || 0;
    const u = unit ? " " + unit : "";
    if (!a && !b) return "";
    if (a && b) return num(a) + "–" + num(b) + u;
    return a ? num(a) + "+" + u : "≤ " + num(b) + u;
  }

  function classNames(mask) {
    const r = W.classesAllowed(mask, M.classes);
    if (r.all) return "All classes";
    const names = r.classes.map((c) => c.class_name);
    for (const b of r.unknownBits) names.push("class id " + b);
    return names.join(", ");
  }

  function kv(pairs) {
    const rows = pairs.filter((p) => p && p[1] !== null && p[1] !== undefined && p[1] !== "");
    if (!rows.length) return "";
    return '<dl class="kv">' + rows.map(([k, v]) => "<dt>" + esc(k) + "</dt><dd>" + v + "</dd>").join("") + "</dl>";
  }

  function tags(list) {
    const t = list.filter(Boolean);
    return t.length ? '<div class="tags">' + t.map(([text, cls]) => '<span class="tag ' + (cls || "") + '">' + esc(text) + "</span>").join("") + "</div>" : "";
  }

  const section = (title, body) => (body ? "<h3>" + esc(title) + "</h3>" + body : "");
  const desc = (text) => (text ? '<div class="desc">' + esc(W.gameText(text)) + "</div>" : "");

  function list(entries) {
    return entries.length ? '<ul class="links">' + entries.map((e) => "<li>" + e + "</li>").join("") + "</ul>" : "";
  }

  function rawTable(row, title) {
    const cells = Object.entries(row).filter(([k]) => k !== "kind" && k !== "key");
    return '<details class="raw"><summary>' + esc(title || "All fields") + "</summary><table>" +
      cells.map(([k, v]) => "<tr><td>" + esc(k) + "</td><td>" + esc(v === null ? "NULL" : v) + "</td></tr>").join("") + "</table></details>";
  }

  /** Stat lines with the game's names. hpPrefix: "player_" (items), "npc_" (NPCs) or "" (effects). */
  function statPairs(row, hpPrefix, showZero) {
    const out = [];
    for (const [col, name] of W.STATS) {
      const key = ["hp", "mp", "sp"].includes(col) ? hpPrefix + col : col;
      const v = row[key];
      if (v === undefined) continue;
      if (!showZero && isEmpty(v)) continue;
      out.push([name, hpPrefix === "npc_" ? num(v) : signed(v)]);
    }
    return out;
  }

  function statSummary(row, hpPrefix) {
    return statPairs(row, hpPrefix, false).map(([k, v]) => k + " " + v.replace(/<[^>]+>/g, "")).join(", ");
  }

  // ---- Pictures (optional) --------------------------------------------------------------------
  //
  // Frames come from assets-index.js (written by build-wiki.bat next to data.js) or, failing
  // that, ../assets/index.json over http. Sheets come from the embedded copies in the
  // single-file wiki (ASPERETA_SHEETS) or ../assets/gfx/{n}.png. Without assets the wiki
  // simply has no pictures.

  const Icons = {
    assets: null,
    sheets: new Map(),
    tinted: new Map(),

    async load() {
      let index = window.ASPERETA_ASSETS || null;
      if (!index && location.protocol !== "file:") {
        try {
          const res = await fetch("../assets/index.json");
          if (res.ok) index = await res.json();
        } catch { /* no assets: no pictures */ }
      }
      this.assets = W.assetIndex(index);
      if (this.assets) this.paint(document);
    },

    html(graphic, tint, size) {
      if (!graphic) return "";
      const t = tint && tint[3] ? ' data-tint="' + tint.join(",") + '"' : "";
      return '<canvas class="ico ' + (size || "") + '" width="32" height="32" data-g="' + graphic + '"' + t + "></canvas>";
    },

    npc(n, size) {
      if (!n.body_id) return "";
      return '<span class="portrait ' + (size || "") + '"><canvas data-npc="' + n.npc_id + '" width="1" height="1"></canvas></span>';
    },

    sheet(file) {
      let entry = this.sheets.get(file);
      if (!entry) {
        entry = new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          const embedded = window.ASPERETA_SHEETS && window.ASPERETA_SHEETS[file];
          img.src = embedded || "../assets/gfx/" + file + ".png";
        });
        this.sheets.set(file, entry);
      }
      return entry;
    },

    /** One frame on its own canvas, tinted like the game when a tint is given. */
    async frame(file, x, y, w, h, tint) {
      const key = [file, x, y, w, h, tint || ""].join(":");
      let entry = this.tinted.get(key);
      if (!entry) {
        entry = this.sheet(file).then((img) => {
          if (!img) return null;
          const c = document.createElement("canvas");
          c.width = Math.max(1, w);
          c.height = Math.max(1, h);
          const ctx = c.getContext("2d", { willReadFrequently: !!tint });
          ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
          if (tint) tintCanvas(ctx, c.width, c.height, tint);
          return c;
        });
        this.tinted.set(key, entry);
      }
      return entry;
    },

    paint(rootEl) {
      if (!this.assets) return;
      for (const canvas of rootEl.querySelectorAll("canvas.ico:not([data-done])")) {
        canvas.dataset.done = "1";
        const f = this.assets.frames[canvas.dataset.g];
        if (!f) { canvas.hidden = true; continue; }
        const [file, x, y, w, h] = f;
        const tint = canvas.dataset.tint ? canvas.dataset.tint.split(",").map(Number) : null;
        this.frame(file, x, y, w, h, tint).then((src) => {
          if (!src) { canvas.hidden = true; return; }
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          const scale = Math.min(1, 32 / Math.max(w, h));
          const dw = Math.round(w * scale), dh = Math.round(h * scale);
          ctx.drawImage(src, (32 - dw) >> 1, (32 - dh) >> 1, dw, dh);
        });
      }
      for (const canvas of rootEl.querySelectorAll("canvas[data-npc]:not([data-done])")) {
        canvas.dataset.done = "1";
        const npc = M.npc.get(Number(canvas.dataset.npc));
        const pic = npc && W.npcLayers(npc, this.assets);
        if (!pic) { canvas.parentElement.hidden = true; continue; }
        Promise.all(pic.layers.map((l) => this.frame(l.file, l.x, l.y, l.w, l.h, l.tint))).then((sources) => {
          canvas.width = pic.width;
          canvas.height = pic.height;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingEnabled = false;
          pic.layers.forEach((l, i) => { if (sources[i]) ctx.drawImage(sources[i], l.dx - pic.left, l.dy - pic.top); });
          canvas.style.setProperty("--w", pic.width + "px");
          canvas.style.setProperty("--h", pic.height + "px");
          canvas.classList.add("ready");
        });
      }
    },
  };

  /**
   * Same tint as the browser client (assets.ts tintPixel / ResourceManager.TintSurface).
   * Opened from disk, browsers won't let a page read pixels of its own image files, so it
   * falls back to blending the colour over the sprite (the same formula without rounding,
   * except that pure black outline pixels get tinted too).
   */
  function tintCanvas(ctx, w, h, [tr, tg, tb, ta]) {
    try {
      const image = ctx.getImageData(0, 0, w, h);
      const d = image.data;
      const tint = (c, t) => ((((ta * ((t + 256) - c)) >> 8) + c - ta) & 0xff);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0 || (d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0)) continue;
        d[i] = tint(d[i], tr); d[i + 1] = tint(d[i + 1], tg); d[i + 2] = tint(d[i + 2], tb);
      }
      ctx.putImageData(image, 0, 0);
    } catch {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = ta / 256;
      ctx.fillStyle = "rgb(" + tr + "," + tg + "," + tb + ")";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  const itemTint = (i) => [i.graphic_r, i.graphic_g, i.graphic_b, i.graphic_a];
  const itemIcon = (i, size) => Icons.html(i.graphic_tile, itemTint(i), size);
  const spellIcon = (s, size) => Icons.html(s.spellbook_graphic, null, size);

  // ---- Links ---------------------------------------------------------------------------------

  function missing(kind, id) { return '<span class="placeholder">' + esc(kind) + " #" + esc(id) + " (not in data)</span>"; }

  const L = {
    item(id) { const i = M.item.get(Number(id)); return i ? itemIcon(i, "small") + '<a href="#/items/' + i.item_template_id + '">' + esc(i.item_name) + "</a>" : missing("Item", id); },
    npc(id) { const n = M.npc.get(Number(id)); return n ? Icons.npc(n, "small") + '<a href="#/npcs/' + n.npc_id + '">' + esc(n.npc_name) + "</a>" : missing("NPC", id); },
    spell(id) { const s = M.spell.get(Number(id)); return s ? spellIcon(s, "small") + '<a href="#/spells/' + s.spell_id + '">' + esc(s.spell_name) + "</a>" : missing("Spell", id); },
    map(id) { const m = M.map.get(Number(id)); return m ? '<a href="#/maps/' + m.map_id + '">' + esc(m.map_name || m.map_filename) + "</a>" : missing("Map", id); },
    quest(id) { const q = M.quest.get(Number(id)); return q ? '<a href="#/quests/' + q.id + '">' + esc(q.name) + "</a>" : missing("Quest", id); },
    combo(id) { const c = M.combo.get(Number(id)); return c ? '<a href="#/recipes/' + c.combination_id + '">' + esc(c.combination_name) + "</a>" : missing("Recipe", id); },
    cls(id) { const c = M.cls.get(Number(id)); return c ? esc(c.class_name) : "class id " + esc(id); },
  };

  // ---- Spell effects (shown inside spells, items and quest rewards) ---------------------------

  const EFFECT_FIELDS = [
    ["effect_type", "Effect type", (v) => esc(W.label(W.EFFECT_TYPES, v))],
    ["target_type", "Target area", (v) => esc(W.label(W.EFFECT_TARGET_TYPES, v))],
    ["target_size", "Target size", num],
    ["spell_effected", "Affects", (v) => esc(W.bits(W.EFFECTED_BITS, v).join(", ") || "Nobody (0)")],
    ["min_level_effected", "Min level affected", num],
    ["max_level_effected", "Max level affected", num],
    ["effect_duration", "Duration", num],
    ["spell_energy_type", "Energy", (v) => esc(W.bits(W.ENERGY_BITS, v).join(", "))],
    ["hp_change_formula", "HP formula", (v) => "<code>" + esc(v) + "</code>"],
    ["mp_change_formula", "MP formula", (v) => "<code>" + esc(v) + "</code>"],
    ["sp_change_formula", "SP formula", (v) => "<code>" + esc(v) + "</code>"],
    ["hp_percent_regen", "HP regen %", signed], ["hp_static_regen", "HP regen", signed],
    ["mp_percent_regen", "MP regen %", signed], ["mp_static_regen", "MP regen", signed],
    ["haste", "Haste", signed], ["spell_damage", "Spell damage", signed], ["spell_crit", "Spell crit", signed],
    ["melee_damage", "Melee damage", signed], ["melee_crit", "Melee crit", signed], ["damage_reduce", "Damage reduction", signed],
    ["move_speed", "Move speed", signed], ["snare_percent", "Snare %", num], ["taunt_aggro", "Taunt aggro", num],
    ["teleport_map", "Teleport map", (v, e) => L.map(v) + " (" + num(e.teleport_x) + ", " + num(e.teleport_y) + ")"],
    ["random_join_chance", "Random join chance", num],
    ["buff_doesnt_stack_over", "Doesn't stack over", (v) => esc(v)],
    ["buff_stacks_over", "Stacks over", (v) => esc(v)],
    ["on_hit_spell_effect_id", "On hit effect", (v, e) => effectName(v) + " (" + num(e.on_hit_spell_chance) + "%)"],
    ["on_attack_spell_effect_id", "On attack effect", (v, e) => effectName(v) + " (" + num(e.on_attack_spell_chance) + "%)"],
    ["oneffect_text", "Text when applied", (v) => esc(v)],
    ["offeffect_text", "Text when it ends", (v) => esc(v)],
    ["script_path", "Script", (v, e) => "<code>" + esc(v) + "</code>" + (e.script_params ? " <code>" + esc(e.script_params) + "</code>" : "")],
  ];
  // Shown as flags; graphics/colours stay in the raw table.
  const EFFECT_SKIP = new Set(["spell_effect_id", "spell_effect_name", "spell_display", "do_attack_animation", "do_cast_animation",
    "spell_damage_effects", "works_in_pvp", "works_not_in_pvp", "buff_removable", "only_hits_one_npc", "teleport_x", "teleport_y",
    "on_hit_spell_chance", "on_attack_spell_chance", "script_params", "spell_animation", "spell_animation_file", "buff_graphic",
    "buff_graphic_file", "body_id", "face_id", "hair_id", "hair_r", "hair_g", "hair_b", "hair_a", "body_r", "body_g", "body_b", "body_a"]);

  function effectName(id) {
    const e = M.effect.get(Number(id));
    return e ? esc(e.spell_effect_name || "Effect #" + id) : missing("Effect", id);
  }

  function effectCard(id, extra) {
    const e = M.effect.get(Number(id));
    if (!e) return '<div class="effect">' + missing("Spell effect", id) + "</div>";
    const pairs = [];
    for (const [col, name, fmt] of EFFECT_FIELDS) {
      if (col !== "effect_type" && col !== "target_type" && col !== "spell_effected" && isEmpty(e[col])) continue;
      // teleport_map/x/y have non-zero defaults on every row; they only mean something for Teleport effects.
      if (col === "teleport_map" && e.effect_type !== 5) continue;
      pairs.push([name, fmt(e[col], e)]);
    }
    const listed = new Set(EFFECT_FIELDS.map((f) => f[0]));
    listed.add("teleport_map");
    pairs.splice(8, 0, ...statPairs(e, "", false));
    const statCols = new Set(W.STATS.map(([c]) => c));
    for (const [col, v] of Object.entries(e)) {
      if (listed.has(col) || EFFECT_SKIP.has(col) || statCols.has(col) || isEmpty(v)) continue;
      pairs.push([col, esc(v)]);
    }
    return '<div class="effect">' + Icons.html(e.buff_graphic, null, "small") + '<b>' + esc(e.spell_effect_name || "Effect #" + id) + "</b>" + (extra || "") +
      tags([
        W.notZero(e.works_in_pvp) ? ["Works in PvP", "yes"] : ["Not in PvP", "no"],
        W.notZero(e.works_not_in_pvp) ? ["Works outside PvP", "yes"] : ["Not outside PvP", "no"],
        W.notZero(e.buff_removable) && ["Removable buff"],
        W.notZero(e.only_hits_one_npc) && ["Hits only one NPC", "warn"],
        W.notZero(e.spell_damage_effects) && ["Spell damage effects"],
      ]) + kv(pairs) + rawTable(e, "All effect fields") + "</div>";
  }

  // ---- Detail pages --------------------------------------------------------------------------

  function itemDetail(i) {
    const id = i.item_template_id;
    // weapon_delay/body_state carry defaults on every row, so they're only summarised for weapons.
    const isWeapon = i.item_usetype === 3 || !isEmpty(i.weapon_damage);
    const weapon = !isWeapon ? [] : [
      !isEmpty(i.weapon_damage) && ["Damage", num(i.weapon_damage)],
      !isEmpty(i.weapon_delay) && ["Delay", num(i.weapon_delay)],
      !isEmpty(i.body_state) && ["Body state", num(i.body_state)],
    ].filter(Boolean);

    const req = [
      range(i.min_level, i.max_level) && ["Level", range(i.min_level, i.max_level)],
      range(i.min_experience, i.max_experience) && ["Experience", range(i.min_experience, i.max_experience)],
      ["Classes", esc(classNames(i.class_restrictions))],
    ].filter(Boolean);

    let effects = "";
    if (i.spell_effect_id) effects += effectCard(i.spell_effect_id, " <span class=\"meta\">· chance " + num(i.spell_effect_chance) + "%</span>");
    if (i.learn_spell_id) effects += kv([["Teaches spell", L.spell(i.learn_spell_id)]]);
    if (i.script_path) effects += kv([["Script", "<code>" + esc(i.script_path) + "</code>" + (i.script_params ? " <code>" + esc(i.script_params) + "</code>" : "")]]);

    const drops = (M.dropsByItem.get(id) || []).slice().sort((a, b) => b.droprate - a.droprate)
      .map((d) => L.npc(d.npc_template_id) + npcLevel(d.npc_template_id) + '<span class="meta">' + W.dropPercent(d.droprate) + "% · ×" + num(d.stack) + "</span>");
    const vendors = (M.stockByItem.get(id) || []).map((v) => L.npc(v.npc_template_id) + '<span class="meta">×' + num(v.stack) + "</span>");
    const crafted = (M.combosMaking.get(id) || []).map((c) => L.combo(c));
    const usedIn = W.countIds(M.combosUsing.get(id)).map(([c]) => L.combo(c));
    const quests = (M.questsByItem.get(id) || []).map((q) => L.quest(q.quest_id) + '<span class="meta">' + esc(q.role) + "</span>");
    const maps = (M.mapsRequiringItem.get(id) || []).map((m) => L.map(m) + '<span class="meta">required to enter</span>');

    return head(itemIcon(i, "big"), i.item_name, "Item #" + id + " · " + W.label(W.USE_TYPES, i.item_usetype) + " · " + W.label(W.ITEM_SLOTS, i.item_slot) +
        (i.item_type ? " · " + W.label(W.ITEM_TYPES, i.item_type) : "")) +
      desc(i.item_description) +
      tags([
        W.notZero(i.lore) && ["Lore", "warn"],
        W.notZero(i.bindonpickup) && ["Bind on pickup", "warn"],
        W.notZero(i.bindonequip) && ["Bind on equip", "warn"],
        W.notZero(i.event) && ["Event", "warn"],
        i.stack_size > 1 && ["Stacks to " + num(i.stack_size)],
      ]) +
      section("Stats", kv(statPairs(i, "player_", false))) +
      section("Weapon", kv(weapon)) +
      section("Requirements", kv(req)) +
      section("Effects", effects) +
      section("Value", kv([["Value", num(i.item_value)], !isEmpty(i.credits_value) && ["Credits value", num(i.credits_value)]].filter(Boolean))) +
      section("Dropped by", list(drops)) +
      section("Sold by", list(vendors)) +
      section("Made by recipe", list(crafted)) +
      section("Ingredient in", list(usedIn)) +
      section("Quests", list(quests)) +
      section("Maps", list(maps)) +
      rawTable(i);
  }

  function npcLevel(id) {
    const n = M.npc.get(Number(id));
    return n ? ' <span class="lvl">lvl ' + num(n.npc_level) + "</span>" : "";
  }

  function npcFullName(n) {
    return [n.npc_title, n.npc_name, n.npc_surname].filter(Boolean).join(" ");
  }

  function npcDetail(n) {
    const id = n.npc_id;
    const combat = [
      ["Level", num(n.npc_level)],
      ["Experience", num(n.experience)],
      ["Class", L.cls(n.class_id)],
      ["HP", num(n.npc_hp)],
      ...statPairs(n, "npc_", false).filter(([k]) => k !== "HP"),
      ["Weapon damage", num(n.weapon_damage)],
      ["Armor pierce", num(n.armor_pierce)],
      ["Aggro range", num(n.aggro_range)],
      ["Attack range", num(n.attack_range)],
      ["Attack speed", num(n.attack_speed)],
      ["Move speed", num(n.move_speed)],
      ["HP regen", num(n.hp_static_regen) + " + " + num(n.hp_percent_regen) + "%"],
      ["MP regen", num(n.mp_static_regen) + " + " + num(n.mp_percent_regen) + "%"],
    ];
    const behaviour = [
      ["Respawn time", num(n.respawn_time)],
      ["When stuck", esc(W.label(W.NPC_BEHAVIOURS, n.stuck_behaviour)) + (n.stuck_timeout ? " (timeout " + num(n.stuck_timeout) + ")" : "")],
      W.idList(n.npc_alliance).length ? ["Allies", W.idList(n.npc_alliance).map(L.npc).join(", ")] : null,
      n.script_path ? ["Script", "<code>" + esc(n.script_path) + "</code>" + (n.script_params ? " <code>" + esc(n.script_params) + "</code>" : "")] : null,
    ].filter(Boolean);

    const drops = (M.dropsByNpc.get(id) || []).slice().sort((a, b) => b.droprate - a.droprate)
      .map((d) => L.item(d.item_template_id) + '<span class="meta">' + W.dropPercent(d.droprate) + "% · ×" + num(d.stack) + "</span>");
    const stock = (M.stockByNpc.get(id) || []).map((v) => L.item(v.item_template_id) + '<span class="meta">×' + num(v.stack) +
      (W.notZero(v.stats_visible) ? "" : " · stats hidden") + "</span>");
    const offers = W.idList(n.quest_ids).map(L.quest);
    const objectives = (M.questsByNpc.get(id) || []).map((q) => L.quest(q.quest_id) + '<span class="meta">' + esc(q.role) + "</span>");
    const spawns = (M.spawnsByNpc.get(id) || []).slice().sort((a, b) => b.count - a.count);
    const total = spawns.reduce((s, x) => s + x.count, 0);

    return head(Icons.npc(n, "big"), npcFullName(n), "NPC #" + id + " · " + W.label(W.NPC_TYPES, n.npc_type)) +
      tags([
        W.isOne(n.stationary) ? ["Stationary", "warn"] : ["Moves", "yes"],
        W.notZero(n.stunnable) ? ["Stunnable", "yes"] : ["Not stunnable", "no"],
        W.notZero(n.rootable) ? ["Rootable", "yes"] : ["Not rootable", "no"],
        W.notZero(n.slowable) ? ["Slowable", "yes"] : ["Not slowable", "no"],
        W.isOne(n.invincible) && ["Invincible", "no"],
        W.isOne(n.see_invisible) && ["Sees invisible", "warn"],
        W.notZero(n.credit_dealer) && ["Sells for credits", "warn"],
      ]) +
      section("Combat", kv(combat)) +
      section("Behaviour", kv(behaviour)) +
      section("Drops" + (drops.length ? " (" + drops.length + ")" : ""), list(drops) ? list(drops) + '<p class="placeholder" style="font-size:11px">Chance per kill as stored (droprate %), before the server\'s DropRateModifier setting.</p>' : "") +
      section("Sells", list(stock)) +
      section("Quests offered", list(offers)) +
      section("Quest objective in", list(objectives)) +
      section("Spawns" + (total ? " (" + num(total) + ")" : ""), list(spawns.map((s) => L.map(s.map_id) + '<span class="meta">×' + num(s.count) + "</span>"))) +
      rawTable(n);
  }

  function spellDetail(s) {
    const id = s.spell_id;
    const costs = [
      ["HP", s.hp_static_cost, s.hp_percent_cost], ["MP", s.mp_static_cost, s.mp_percent_cost], ["SP", s.sp_static_cost, s.sp_percent_cost],
    ].filter(([, a, b]) => !isEmpty(a) || !isEmpty(b))
      .map(([k, a, b]) => [k + " cost", [!isEmpty(a) && num(a), !isEmpty(b) && num(b) + "%"].filter(Boolean).join(" + ")]);
    const learned = (M.levelSpellsBySpell.get(id) || []).map((l) => esc(L.cls(l.class_id)) + '<span class="meta">level ' + num(l.level) + "</span>");
    const items = (M.itemsTeaching.get(id) || []).map((i) => L.item(i.item_template_id));
    const quests = (M.questsTeaching.get(id) || []).map(L.quest);
    return head(spellIcon(s, "big"), s.spell_name, "Spell #" + id + " · " + W.label(W.SPELL_TARGETS, s.spell_target)) +
      desc(s.spell_description) +
      section("Casting", kv([
        ["Target", esc(W.label(W.SPELL_TARGETS, s.spell_target))],
        ["Classes", esc(classNames(s.class_restrictions))],
        ["Aether", num(s.spell_aether) + " ms"],
        ...costs,
      ])) +
      section("Effect", s.spell_effect_id ? effectCard(s.spell_effect_id) : "") +
      section("Learned at level up", list(learned)) +
      section("Taught by item", list(items)) +
      section("Quest reward", list(quests)) +
      rawTable(s);
  }

  function requirementText(r) {
    const v = r.requirement_value, v2 = r.requirement_value2;
    switch (r.requirement_type) {
      case 0: return num(v) + " gold";
      case 1: return L.item(v) + " ×" + num(v2);
      case 2: return "Kill " + L.npc(v) + " ×" + num(v2);
      case 3: return "Talk to " + L.npc(v) + " ×" + num(v2);
      case 4: return num(v) + " experience banked";
      case 5: return num(v) + " experience sold";
      case 6: return "Nothing equipped";
      case 7: return "Script <code>" + esc(r.script_path) + "</code>";
      default: return esc(W.label(W.REQUIREMENT_TYPES, r.requirement_type)) + " " + num(v) + " / " + num(v2);
    }
  }

  function rewardText(r) {
    const v = r.long_value, v2 = r.long_value2, s = r.string_value;
    switch (r.reward_type) {
      case 0: return num(v) + " gold";
      case 1: return L.item(v) + " ×" + num(v2);
      case 2: return "Title: " + esc(s);
      case 3: return "Surname: " + esc(s);
      case 4: {
        const p = String(s).split(",");
        return "Teleport to " + (p.length >= 3 ? L.map(p[0]) + " (" + esc(p[1]) + ", " + esc(p[2]) + ")" : esc(s));
      }
      case 5: return num(v) + " experience";
      case 9: case 10: return esc(W.label(W.REWARD_TYPES, r.reward_type)) + ": " + esc(s);
      case 11: return "Becomes " + L.cls(v);
      case 12: case 13: case 14: case 15: case 16: case 17: case 18: return signed(v) + " " + esc(W.label(W.REWARD_TYPES, r.reward_type));
      case 19: return "Buff: " + effectName(v);
      case 20: return "Learn " + L.spell(v);
      case 21: return "Script <code>" + esc(r.script_path) + "</code>";
      default: return esc(W.label(W.REWARD_TYPES, r.reward_type)) + " " + num(v);
    }
  }

  function questDetail(q) {
    const reqs = (M.reqsByQuest.get(q.id) || []).map((r) => requirementText(r) + '<span class="meta">' + (W.notZero(r.keep_requirement) ? "kept" : "taken on completion") + "</span>");
    const rewards = (M.rewardsByQuest.get(q.id) || []).map(rewardText);
    const prereq = W.idList(q.prerequisite_quests).map(L.quest);
    return head("", q.name, "Quest #" + q.id) +
      tags([
        W.notZero(q.repeatable) ? ["Repeatable", "yes"] : ["One time", "warn"],
        W.notZero(q.show_progress) && ["Shows progress"],
        W.notZero(q.only_one_player_can_complete) && ["Only one player can complete", "warn"],
      ]) +
      desc(q.description) +
      section("Who can take it", kv([
        range(q.min_level, q.max_level) && ["Level", range(q.min_level, q.max_level)],
        range(q.min_experience, q.max_experience) && ["Experience", range(q.min_experience, q.max_experience)],
        ["Classes", esc(classNames(q.class_restrictions))],
      ].filter(Boolean))) +
      section("Prerequisite quests", list(prereq)) +
      section("Requirements", list(reqs)) +
      section("Rewards", list(rewards)) +
      section("Given by", list((M.npcsByQuest.get(q.id) || []).map(L.npc))) +
      section("When completed", desc(q.pass_text)) +
      section("When requirements aren't met", desc(q.fail_text)) +
      rawTable(q);
  }

  function comboDetail(c) {
    const inputs = W.countIds(M.comboInputs.get(c.combination_id)).map(([id, n]) => L.item(id) + '<span class="meta">×' + n + "</span>");
    const outputs = W.countIds(M.comboOutputs.get(c.combination_id)).map(([id, n]) => L.item(id) + '<span class="meta">×' + n + "</span>");
    return head("", c.combination_name, "Recipe #" + c.combination_id) +
      section("Requirements", kv([
        range(c.min_level, c.max_level) && ["Level", range(c.min_level, c.max_level)],
        range(c.min_experience, c.max_experience) && ["Experience", range(c.min_experience, c.max_experience)],
        ["Classes", esc(classNames(c.class_restrictions))],
      ].filter(Boolean))) +
      section("Ingredients", list(inputs)) +
      section("Result", list(outputs)) +
      rawTable(c);
  }

  function mapDetail(m) {
    const spawns = (M.spawnsByMap.get(m.map_id) || []).slice().sort((a, b) => (M.npc.get(a.npc_id)?.npc_level ?? 0) - (M.npc.get(b.npc_id)?.npc_level ?? 0));
    const total = spawns.reduce((s, x) => s + x.count, 0);
    const flag = (col, name) => (W.notZero(m[col]) ? [name, "yes"] : ["No " + name.toLowerCase(), "no"]);
    return head("", m.map_name || m.map_filename, "Map #" + m.map_id + " · " + m.map_filename) +
      tags([
        W.notZero(m.pvp_enabled) ? ["PvP", "warn"] : ["No PvP", "yes"],
        flag("chat_enabled", "Chat"), flag("shout_enabled", "Shout"), flag("auction_enabled", "Auction"),
        flag("spells_enabled", "Spells"), flag("items_enabled", "Items"), flag("bind_enabled", "Bind"), flag("pets_enabled", "Pets"),
      ]) +
      section("Entry limits", kv([
        range(m.min_level, m.max_level) && ["Level", range(m.min_level, m.max_level)],
        range(m.min_experience, m.max_experience) && ["Experience", range(m.min_experience, m.max_experience)],
        m.script_path && ["Script", "<code>" + esc(m.script_path) + "</code>"],
      ].filter(Boolean))) +
      section("Required items", list((M.requiredByMap.get(m.map_id) || []).map(L.item))) +
      section("Creatures & NPCs" + (total ? " (" + num(total) + " spawns)" : ""), list(spawns.map((s) => L.npc(s.npc_id) + npcLevel(s.npc_id) + '<span class="meta">×' + num(s.count) + "</span>"))) +
      rawTable(m);
  }

  function modifierDetail(r) {
    let params = r.script_params;
    try { params = JSON.stringify(JSON.parse(r.script_params), null, 2); } catch { /* shown as stored */ }
    return head("", r.name, "Item " + r.kind.toLowerCase() + " #" + r.id) +
      section("Applies to", kv([
        range(r.min_level, r.max_level) && ["Level", range(r.min_level, r.max_level)],
        range(r.min_experience, r.max_experience) && ["Experience", range(r.min_experience, r.max_experience)],
        ["item_usetype", num(r.item_usetype)],
        ["item_slot", num(r.item_slot)],
        ["Chance", num(r.chance)],
      ].filter(Boolean))) +
      section("Script", kv([["Path", "<code>" + esc(r.script_path) + "</code>"]]) + (params ? '<div class="desc">' + esc(params) + "</div>" : "")) +
      rawTable(r);
  }

  function head(icon, title, subtitle) {
    return '<a class="back" href="#/' + current.id + '">← Back to list</a><h2>' + icon + esc(title) + '</h2><p class="subtitle">' + esc(subtitle) + "</p>";
  }

  // ---- Sections ----------------------------------------------------------------------------

  const optionsOf = (map) => Object.entries(map).map(([v, l]) => [v, l]);
  const classOptions = () => M.classes.map((c) => [String(c.class_id), c.class_name]);
  const canUse = (mask, classId) => { const r = W.classesAllowed(mask, M.classes); return r.all || r.classes.some((c) => String(c.class_id) === classId); };
  const presentOptions = (rows, key, map) => {
    const present = new Set(rows.map((r) => String(r[key])));
    return optionsOf(map).filter(([v]) => present.has(v));
  };

  const SECTIONS = [
    {
      id: "items", title: "Items", rows: M.items, key: "item_template_id", name: (i) => i.item_name, detail: itemDetail,
      icon: (i) => itemIcon(i, "small"),
      text: (i) => i.item_name + " " + i.item_description,
      sort: "name",
      columns: [
        { id: "icon", label: "", html: (i) => itemIcon(i), cls: "ico-cell", nosort: true },
        { id: "name", label: "Name", get: (i) => i.item_name, html: (i) => { const st = statSummary(i, "player_"); return esc(i.item_name) + (st ? '<div class="sub">' + esc(st) + "</div>" : ""); } },
        { id: "use", label: "Category", get: (i) => W.label(W.USE_TYPES, i.item_usetype) },
        { id: "slot", label: "Slot / type", get: (i) => W.label(W.ITEM_SLOTS, i.item_slot), html: (i) => esc(W.label(W.ITEM_SLOTS, i.item_slot)) + (i.item_type ? '<div class="sub">' + esc(W.label(W.ITEM_TYPES, i.item_type)) + "</div>" : "") },
        { id: "lvl", label: "Level", get: (i) => i.min_level, html: (i) => range(i.min_level, i.max_level), num: true },
        { id: "dmg", label: "Damage", get: (i) => i.weapon_damage, html: (i) => (i.weapon_damage ? num(i.weapon_damage) : ""), num: true },
        { id: "ac", label: "AC", get: (i) => i.stat_ac, html: (i) => (i.stat_ac ? num(i.stat_ac) : ""), num: true },
        { id: "value", label: "Value", get: (i) => i.item_value, html: (i) => num(i.item_value), num: true },
      ],
      filters: [
        { id: "use", label: "Category", type: "select", options: () => presentOptions(M.items, "item_usetype", W.USE_TYPES), test: (i, v) => String(i.item_usetype) === v },
        { id: "slot", label: "Slot", type: "select", options: () => presentOptions(M.items, "item_slot", W.ITEM_SLOTS), test: (i, v) => String(i.item_slot) === v },
        { id: "type", label: "Type", type: "select", options: () => presentOptions(M.items, "item_type", W.ITEM_TYPES), test: (i, v) => String(i.item_type) === v },
        { id: "cls", label: "Usable by class", type: "select", options: classOptions, test: (i, v) => canUse(i.class_restrictions, v) },
        { id: "lvl", label: "Required level", type: "range", get: (i) => i.min_level },
        {
          id: "src", label: "Obtained from", type: "select",
          options: () => [["drop", "Creature drops"], ["vendor", "Vendors"], ["craft", "Recipes"], ["quest", "Quest rewards"]],
          test: (i, v) => {
            const id = i.item_template_id;
            if (v === "drop") return M.dropsByItem.has(id);
            if (v === "vendor") return M.stockByItem.has(id);
            if (v === "craft") return M.combosMaking.has(id);
            return (M.questsByItem.get(id) || []).some((q) => q.role === "Reward");
          },
        },
        { id: "eff", label: "Has a spell effect", type: "check", test: (i) => !!i.spell_effect_id || !!i.learn_spell_id },
      ],
    },
    {
      id: "npcs", title: "Creatures & NPCs", rows: M.npcs, key: "npc_id", name: (n) => n.npc_name, detail: npcDetail,
      text: (n) => npcFullName(n),
      icon: (n) => Icons.npc(n, "small"),
      sort: "lvl",
      columns: [
        { id: "pic", label: "", html: (n) => Icons.npc(n), cls: "ico-cell", nosort: true },
        { id: "name", label: "Name", get: (n) => n.npc_name, html: (n) => esc(n.npc_name) + (n.npc_title || n.npc_surname ? ' <span class="placeholder">' + esc([n.npc_title, n.npc_surname].filter(Boolean).join(" · ")) + "</span>" : "") },
        { id: "type", label: "Type", get: (n) => W.label(W.NPC_TYPES, n.npc_type) },
        { id: "lvl", label: "Level", get: (n) => n.npc_level, num: true },
        { id: "hp", label: "HP", get: (n) => n.npc_hp, num: true },
        { id: "dmg", label: "Damage", get: (n) => n.weapon_damage, num: true },
        { id: "ac", label: "AC", get: (n) => n.stat_ac, num: true },
        { id: "xp", label: "Exp", get: (n) => n.experience, num: true },
        { id: "aggro", label: "Aggro range", get: (n) => n.aggro_range, num: true },
        { id: "drops", label: "Drops", get: (n) => (M.dropsByNpc.get(n.npc_id) || []).length, num: true },
        { id: "spawns", label: "Spawns", get: (n) => (M.spawnsByNpc.get(n.npc_id) || []).reduce((s, x) => s + x.count, 0), num: true },
      ],
      filters: [
        { id: "type", label: "Type", type: "select", options: () => presentOptions(M.npcs, "npc_type", W.NPC_TYPES), test: (n, v) => String(n.npc_type) === v },
        { id: "lvl", label: "Level", type: "range", get: (n) => n.npc_level },
        {
          id: "aggro", label: "Aggro", type: "select", options: () => [["yes", "Has an aggro range"], ["no", "No aggro range (0)"]],
          test: (n, v) => (v === "yes" ? n.aggro_range > 0 : !(n.aggro_range > 0)),
        },
        {
          id: "map", label: "Spawns on map", type: "select",
          options: () => M.maps.filter((m) => M.spawnsByMap.has(m.map_id)).map((m) => [String(m.map_id), m.map_name || m.map_filename]).sort((a, b) => a[1].localeCompare(b[1])),
          test: (n, v) => (M.spawnsByNpc.get(n.npc_id) || []).some((s) => String(s.map_id) === v),
        },
        { id: "drops", label: "Has drops", type: "check", test: (n) => M.dropsByNpc.has(n.npc_id) },
        { id: "spawned", label: "Placed on a map", type: "check", test: (n) => M.spawnsByNpc.has(n.npc_id) },
      ],
    },
    {
      id: "spells", title: "Spells", rows: M.spells, key: "spell_id", name: (s) => s.spell_name, detail: spellDetail,
      icon: (s) => spellIcon(s, "small"),
      text: (s) => s.spell_name + " " + s.spell_description,
      sort: "name",
      columns: [
        { id: "icon", label: "", html: (s) => spellIcon(s), cls: "ico-cell", nosort: true },
        { id: "name", label: "Name", get: (s) => s.spell_name },
        { id: "cls", label: "Classes", get: (s) => classNames(s.class_restrictions), cls: "wrap" },
        { id: "target", label: "Target", get: (s) => W.label(W.SPELL_TARGETS, s.spell_target) },
        { id: "mp", label: "MP cost", get: (s) => s.mp_static_cost, num: true },
        { id: "aether", label: "Aether (ms)", get: (s) => s.spell_aether, num: true },
        { id: "eff", label: "Effect type", get: (s) => (M.effect.has(s.spell_effect_id) ? W.label(W.EFFECT_TYPES, M.effect.get(s.spell_effect_id).effect_type) : "") },
      ],
      filters: [
        { id: "cls", label: "Class", type: "select", options: classOptions, test: (s, v) => canUse(s.class_restrictions, v) },
        { id: "target", label: "Target", type: "select", options: () => presentOptions(M.spells, "spell_target", W.SPELL_TARGETS), test: (s, v) => String(s.spell_target) === v },
        {
          id: "eff", label: "Effect type", type: "select",
          options: () => { const used = new Set(M.spells.map((s) => String(M.effect.get(s.spell_effect_id)?.effect_type))); return optionsOf(W.EFFECT_TYPES).filter(([v]) => used.has(v)); },
          test: (s, v) => String(M.effect.get(s.spell_effect_id)?.effect_type) === v,
        },
      ],
    },
    {
      id: "quests", title: "Quests", rows: M.quests, key: "id", name: (q) => q.name, detail: questDetail,
      text: (q) => q.name + " " + q.description, sort: "id",
      columns: [
        { id: "id", label: "#", get: (q) => q.id, num: true },
        { id: "name", label: "Name", get: (q) => q.name },
        { id: "lvl", label: "Level", get: (q) => q.min_level, html: (q) => range(q.min_level, q.max_level), num: true },
        { id: "cls", label: "Classes", get: (q) => classNames(q.class_restrictions), cls: "wrap" },
        { id: "rep", label: "Repeatable", get: (q) => (W.notZero(q.repeatable) ? "Yes" : "No") },
        { id: "by", label: "Given by", get: (q) => (M.npcsByQuest.get(q.id) || []).map((id) => M.npc.get(id)?.npc_name ?? "#" + id).join(", "), cls: "wrap" },
      ],
      filters: [{ id: "cls", label: "Class", type: "select", options: classOptions, test: (q, v) => canUse(q.class_restrictions, v) }],
    },
    {
      id: "recipes", title: "Recipes", rows: M.combos, key: "combination_id", name: (c) => c.combination_name, detail: comboDetail,
      text: (c) => c.combination_name + " " + (M.comboOutputs.get(c.combination_id) || []).map((id) => M.item.get(id)?.item_name).join(" "),
      sort: "name",
      columns: [
        { id: "name", label: "Name", get: (c) => c.combination_name },
        { id: "lvl", label: "Level", get: (c) => c.min_level, html: (c) => range(c.min_level, c.max_level), num: true },
        { id: "cls", label: "Classes", get: (c) => classNames(c.class_restrictions), cls: "wrap" },
        { id: "in", label: "Ingredients", get: (c) => (M.comboInputs.get(c.combination_id) || []).length, num: true },
        { id: "out", label: "Makes", get: (c) => W.countIds(M.comboOutputs.get(c.combination_id)).map(([id]) => M.item.get(id)?.item_name ?? "#" + id).join(", "), cls: "wrap" },
      ],
      filters: [{ id: "cls", label: "Class", type: "select", options: classOptions, test: (c, v) => canUse(c.class_restrictions, v) }],
    },
    {
      id: "maps", title: "Maps", rows: M.maps, key: "map_id", name: (m) => m.map_name || m.map_filename, detail: mapDetail,
      text: (m) => (m.map_name || "") + " " + m.map_filename, sort: "id",
      columns: [
        { id: "id", label: "#", get: (m) => m.map_id, num: true },
        { id: "name", label: "Name", get: (m) => m.map_name || m.map_filename },
        { id: "lvl", label: "Level", get: (m) => m.min_level, html: (m) => range(m.min_level, m.max_level), num: true },
        { id: "pvp", label: "PvP", get: (m) => (W.notZero(m.pvp_enabled) ? "Yes" : "") },
        { id: "kinds", label: "Creature types", get: (m) => (M.spawnsByMap.get(m.map_id) || []).length, num: true },
        { id: "spawns", label: "Spawns", get: (m) => (M.spawnsByMap.get(m.map_id) || []).reduce((s, x) => s + x.count, 0), num: true },
      ],
      filters: [
        { id: "pvp", label: "PvP enabled", type: "check", test: (m) => W.notZero(m.pvp_enabled) },
        { id: "npcs", label: "Has creatures/NPCs", type: "check", test: (m) => M.spawnsByMap.has(m.map_id) },
      ],
    },
    {
      id: "modifiers", title: "Item modifiers", rows: M.modifiers, key: "key", name: (r) => r.name, detail: modifierDetail,
      text: (r) => r.name + " " + r.script_params, sort: "name",
      columns: [
        { id: "kind", label: "Kind", get: (r) => r.kind },
        { id: "name", label: "Name", get: (r) => r.name },
        { id: "lvl", label: "Level", get: (r) => r.min_level, html: (r) => range(r.min_level, r.max_level), num: true },
        { id: "chance", label: "Chance", get: (r) => r.chance, num: true },
        { id: "params", label: "Parameters", get: (r) => r.script_params, cls: "wrap" },
      ],
      filters: [{ id: "kind", label: "Kind", type: "select", options: () => [["Title", "Title"], ["Surname", "Surname"]], test: (r, v) => r.kind === v }],
    },
  ];

  // ---- List rendering ------------------------------------------------------------------------

  const state = {};
  let current = SECTIONS[0];

  function sectionState(sec) {
    return (state[sec.id] ??= { q: "", f: {}, sort: sec.sort, desc: false });
  }

  function cellValue(col, row) { return col.get ? col.get(row) : ""; }

  function filtered(sec) {
    const st = sectionState(sec);
    const q = st.q.trim().toLowerCase();
    const idQuery = /^#?\d+$/.test(q) ? Number(q.replace("#", "")) : null;
    let rows = sec.rows.filter((r) => {
      if (q && !(idQuery !== null && r[sec.key] === idQuery) && !String(sec.text(r)).toLowerCase().includes(q)) return false;
      for (const f of sec.filters) {
        const v = st.f[f.id];
        if (f.type === "range") {
          const x = Number(f.get(r)) || 0;
          if (v?.min !== undefined && v.min !== "" && x < Number(v.min)) return false;
          if (v?.max !== undefined && v.max !== "" && x > Number(v.max)) return false;
        } else if (f.type === "check") {
          if (v && !f.test(r)) return false;
        } else if (v) {
          if (!f.test(r, v)) return false;
        }
      }
      return true;
    });
    const col = sec.columns.find((c) => c.id === st.sort) || sec.columns.find((c) => c.get);
    const dir = st.desc ? -1 : 1;
    rows = rows.slice().sort((a, b) => {
      const x = cellValue(col, a), y = cellValue(col, b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
      return c !== 0 ? c * dir : sec.name(a).localeCompare(sec.name(b));
    });
    return rows;
  }

  function renderShell(sec) {
    const st = sectionState(sec);
    const filters = sec.filters.map((f) => {
      if (f.type === "select") {
        return "<label>" + esc(f.label) + '<select data-f="' + f.id + '"><option value="">Any</option>' +
          f.options().map(([v, l]) => '<option value="' + esc(v) + '"' + (st.f[f.id] === v ? " selected" : "") + ">" + esc(l) + "</option>").join("") + "</select></label>";
      }
      if (f.type === "range") {
        const v = st.f[f.id] || {};
        return "<label>" + esc(f.label) + '<span class="range"><input type="number" placeholder="min" data-f="' + f.id + '" data-r="min" value="' + esc(v.min ?? "") +
          '"><input type="number" placeholder="max" data-f="' + f.id + '" data-r="max" value="' + esc(v.max ?? "") + '"></span></label>';
      }
      return '<label class="check"><input type="checkbox" data-f="' + f.id + '"' + (st.f[f.id] ? " checked" : "") + ">" + esc(f.label) + "</label>";
    }).join("");

    app.innerHTML = '<div class="section" id="sec-' + sec.id + '">' +
      '<aside class="filters"><label>Search ' + esc(sec.title.toLowerCase()) + '<input type="search" data-q value="' + esc(st.q) + '" placeholder="Name or #id" spellcheck="false"></label>' +
      filters + '<button type="button" data-reset>Clear filters</button></aside>' +
      '<div class="list"><div class="count"></div><div class="table-wrap"><table><thead><tr>' +
      sec.columns.map((c) => '<th data-col="' + c.id + '" class="' + (c.num ? "num " : "") + '">' + esc(c.label) + "</th>").join("") +
      "</tr></thead><tbody></tbody></table></div></div>" +
      '<article class="detail"><p class="placeholder">Select an entry to see everything the game data has on it.</p></article></div>';

    const root = app.firstElementChild;
    root.querySelector("[data-q]").addEventListener("input", (e) => { st.q = e.target.value; renderRows(sec); });
    for (const el of root.querySelectorAll("[data-f]")) {
      const f = sec.filters.find((x) => x.id === el.dataset.f);
      el.addEventListener(el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input", () => {
        if (f.type === "range") (st.f[f.id] ??= {})[el.dataset.r] = el.value;
        else if (f.type === "check") st.f[f.id] = el.checked;
        else st.f[f.id] = el.value;
        renderRows(sec);
      });
    }
    root.querySelector("[data-reset]").addEventListener("click", () => {
      st.q = ""; st.f = {};
      renderShell(sec);
      renderRows(sec);
      showDetail(sec, selectedId());
    });
    for (const th of root.querySelectorAll("th[data-col]")) {
      const col = sec.columns.find((c) => c.id === th.dataset.col);
      if (col.nosort) continue;
      th.addEventListener("click", () => {
        if (st.sort === col.id) st.desc = !st.desc;
        else { st.sort = col.id; st.desc = !!col.num && col.id !== "lvl" && col.id !== "id"; }
        renderRows(sec);
      });
    }
    root.querySelector("tbody").addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-id]");
      if (tr && !e.target.closest("a")) location.hash = "#/" + sec.id + "/" + tr.dataset.id;
    });
  }

  function renderRows(sec) {
    const st = sectionState(sec);
    const rows = filtered(sec);
    const root = document.getElementById("sec-" + sec.id);
    root.querySelector(".count").textContent = rows.length === sec.rows.length
      ? sec.rows.length.toLocaleString("en-US") + " " + sec.title.toLowerCase()
      : rows.length.toLocaleString("en-US") + " of " + sec.rows.length.toLocaleString("en-US") + " " + sec.title.toLowerCase();
    for (const th of root.querySelectorAll("th[data-col]")) {
      th.classList.toggle("sorted", th.dataset.col === st.sort);
      th.classList.toggle("desc", th.dataset.col === st.sort && st.desc);
    }
    const selected = selectedId();
    const tbody = root.querySelector("tbody");
    tbody.innerHTML = rows.length ? rows.map((r) => '<tr data-id="' + esc(r[sec.key]) + '"' + (String(r[sec.key]) === selected ? ' class="selected"' : "") + ">" +
      sec.columns.map((c) => '<td class="' + (c.num ? "num " : "") + (c.cls || "") + '">' + (c.html ? c.html(r) : c.num ? num(cellValue(c, r)) : esc(cellValue(c, r))) + "</td>").join("") + "</tr>").join("")
      : '<tr><td colspan="' + sec.columns.length + '" class="placeholder">Nothing matches these filters.</td></tr>';
    Icons.paint(tbody);
  }

  function showDetail(sec, id) {
    const root = document.getElementById("sec-" + sec.id);
    const panel = root.querySelector(".detail");
    const row = id === null ? null : sec.rows.find((r) => String(r[sec.key]) === id);
    root.classList.toggle("has-detail", !!row);
    for (const tr of root.querySelectorAll("tr.selected")) tr.classList.remove("selected");
    if (!row) {
      panel.innerHTML = id === null ? '<p class="placeholder">Select an entry to see everything the game data has on it.</p>'
        : '<p class="placeholder">' + esc(sec.title) + " #" + esc(id) + " is not in the game data.</p>";
      return;
    }
    panel.innerHTML = sec.detail(row);
    panel.scrollTop = 0;
    root.querySelector('tr[data-id="' + CSS.escape(id) + '"]')?.classList.add("selected");
    Icons.paint(panel);
    document.title = sec.name(row) + " · Aspereta Wiki";
  }

  // ---- Routing ---------------------------------------------------------------------------------

  function parseHash() {
    const [, secId, id] = location.hash.match(/^#\/([^/]+)(?:\/(.+))?$/) || [];
    return { sec: SECTIONS.find((s) => s.id === secId) || SECTIONS[0], id: id ? decodeURIComponent(id) : null };
  }
  const selectedId = () => parseHash().id;

  let shown = null;
  function route() {
    const { sec, id } = parseHash();
    current = sec;
    if (shown !== sec) {
      shown = sec;
      for (const a of nav.querySelectorAll("a")) a.classList.toggle("active", a.dataset.sec === sec.id);
      renderShell(sec);
      renderRows(sec);
    }
    showDetail(sec, id);
    if (id === null) document.title = sec.title + " · Aspereta Wiki";
  }

  nav.innerHTML = SECTIONS.map((s) => '<a href="#/' + s.id + '" data-sec="' + s.id + '">' + esc(s.title) + "<b>" + s.rows.length.toLocaleString("en-US") + "</b></a>").join("");

  // ---- Global search ------------------------------------------------------------------------

  const gInput = document.getElementById("global-search");
  const gResults = document.getElementById("global-results");
  let gActive = 0;

  function globalSearch() {
    const q = gInput.value.trim().toLowerCase();
    if (!q) { gResults.hidden = true; return; }
    let html = "";
    let total = 0;
    for (const sec of SECTIONS) {
      const hits = sec.rows.filter((r) => String(sec.name(r) || "").toLowerCase().includes(q))
        .sort((a, b) => {
          const an = sec.name(a).toLowerCase(), bn = sec.name(b).toLowerCase();
          return (bn.startsWith(q) - an.startsWith(q)) || an.length - bn.length;
        });
      if (!hits.length) continue;
      html += "<h4>" + esc(sec.title) + " (" + hits.length + ")</h4>" + hits.slice(0, 8).map((r) =>
        '<a href="#/' + sec.id + "/" + esc(r[sec.key]) + '">' + (sec.icon ? sec.icon(r) : "") + esc(sec.name(r)) + "</a>").join("");
      total += hits.length;
    }
    gResults.innerHTML = total ? html : '<div class="none">No matches.</div>';
    gResults.hidden = false;
    gActive = 0;
    highlight();
    Icons.paint(gResults);
  }

  function highlight() {
    const links = gResults.querySelectorAll("a");
    links.forEach((a, i) => a.classList.toggle("active", i === gActive));
    links[gActive]?.scrollIntoView({ block: "nearest" });
  }

  gInput.addEventListener("input", globalSearch);
  gInput.addEventListener("focus", () => { if (gInput.value.trim()) globalSearch(); });
  gInput.addEventListener("keydown", (e) => {
    const links = gResults.querySelectorAll("a");
    if (e.key === "ArrowDown") { gActive = Math.min(links.length - 1, gActive + 1); highlight(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { gActive = Math.max(0, gActive - 1); highlight(); e.preventDefault(); }
    else if (e.key === "Enter" && links[gActive]) { location.hash = links[gActive].getAttribute("href"); gResults.hidden = true; gInput.blur(); }
    else if (e.key === "Escape") { gResults.hidden = true; gInput.blur(); }
  });
  gResults.addEventListener("click", (e) => { if (e.target.closest("a")) gResults.hidden = true; });
  document.addEventListener("click", (e) => { if (!e.target.closest(".global-search")) gResults.hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement?.tagName !== "INPUT") { gInput.focus(); e.preventDefault(); }
  });

  // ---- Start --------------------------------------------------------------------------------

  footer.innerHTML = "Game data: <b>" + esc(M.meta.source) + "</b>, exported " + esc(M.meta.generated) +
    ". Every value comes from the server database, read the way the server reads it; labels come from the server's own enums. " +
    "Empty or zero values are left out of the summaries; each page's “All fields” lists every column. Press / to search.";

  window.addEventListener("hashchange", route);
  route();
  Icons.load();
})();
