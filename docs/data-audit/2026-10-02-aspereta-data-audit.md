# Aspereta data audit (2026-10-02)

Read-only check of `Goose/bin/Debug/AsperetaGoose.db` and the converted map files, after the custom-ticket settings bug showed that wrong ids can sit unnoticed in the data.

## What was checked

| Check | Result |
|---|---|
| Every id in `GooseSettings.json` (starting items/map/class, gold, tickets, quest icons) | OK after the ticket fix (823/951). `HairDyePotionId` 699 is an Illutia id but harmless. |
| NPC drops and vendor items -> items/NPCs | OK |
| NPC spawns -> NPCs/maps | OK |
| Quest requirements (item/kill/talk) and rewards (item/class/teleport/spell/buff) | OK |
| Spells -> spell effects; items -> spell effects / taught spells | 1 problem (below) |
| Spell effects -> teleport maps, on-hit/on-attack effects, stack lists | OK |
| Warp tiles -> maps; map required items; combinations; class level-up spells; NPC classes and quests | OK |
| Script paths used by the data exist in `Data/Aspereta/Scripts` | OK |
| NPC allies | 1 problem (below); `0`/`000` now means "no ally" (NPCHandler change) |
| Map files for every map | OK except #26 "Broken Map" (no Map26.map) |
| Spawn positions on walls (blocked tiles) | 106 problems (below) |
| Warp destinations on walls | OK |

Totals checked: 950 items, 317 NPCs, 173 maps, 188 spells, 387 spell effects, 10 quests, 67 combinations, 7416 spawns, 481 warps.

## Problems found

1. **Item 790 "Santas SP Hat"** uses spell effect 325, which does not exist (324 and 326 do). The server skips the whole item at startup. GM-only (class restriction 32); nobody owns it and it is not dropped or sold. Fix: add effect 325, or set the item's `spell_effect_id` to 0.
2. **NPC 243 "Powerful Persecution"** lists ally 242, which does not exist. Fix: remove 242 from `npc_alliance` or point it at the intended NPC.
3. **106 monster spawns are inside walls.** They cannot move and players cannot reach them. All are monsters (no vendors or quest NPCs). Many sit on regular grid positions, which looks like a bulk spawn-placement script.

| Map | Monster | Spawns in walls |
|---|---|---|
| Bear Kingdom (#43) | Patrol Bear (#129) | 43 |
| Mindless Mines (#12) | Strong Persecution (#49) | 20 |
| Mindless Mines (#12) | Persecution (#39) | 19 |
| Rugged Valley (#42) | Young Bear (#130) | 14 |
| Boondocks (#25) | Pipsqueek (#24) | 3 |
| Otherlands (#11) | Weak Persecution (#34) | 2 |
| Boondocks (#25) | Piglet (#18) | 1 |
| Punchys Playhouse (#9) | Spook (#56) | 1 |
| Northern Arctic Lands (#17) | Melty (#114) | 1 |
| Martrydom Maze (#47) | Emissary Green (#197) | 1 |
| Winterside (#60) | Merry Savage (#244) | 1 |

## Fix for the spawns (not applied)

`2026-10-02-fix-blocked-spawns.sql` moves each of the 106 spawns to the nearest free walkable tile (not a wall, not a warp tile, not another spawn). The average move is 2.3 tiles; the maximum is 10. It was tested on a copy of the database: afterwards 0 spawns are in walls and the spawn count is unchanged (7416).

To apply:
1. Stop the game server (it saves on close).
2. Back up `Goose/bin/Debug/AsperetaGoose.db`.
3. Open it in DB Browser (SQLite) -> Execute SQL -> run the file -> Write Changes.
4. Start the server.

If the database is rebuilt from the spreadsheet (CsvToSql / DataLinkId), make the same changes in the NPC Spawns sheet or they will come back.

Note: "nearest" is measured as a straight line, so a spawn next to a thin wall can land on the other side of it.
