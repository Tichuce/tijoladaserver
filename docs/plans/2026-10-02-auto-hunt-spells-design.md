# Auto-Hunt spells – design (phase 1 of 3)

Status: phase 1 shipped on 2026-10-02 (attack, buff and heal spells, distance, browser window).
Next: phase 2 (Monster Taunt + Progressive Pull), phase 3 (Warrior Anchor / party synergy).

## Flow (traced before coding)

Browser window (`autohuntview.ts`) → `Session.saveAutoHuntSettings` → `/autohunt config <base64 JSON>`
→ `AutoHuntCommand` → `AutoHuntSettings.TryApply` (validate, store in `player_properties["autohunt"]`)
→ `AHC` echo. Every 350 ms `AutoHuntEvent.Ready` → `Act` → `AutoHuntCaster` (heal → buff → attack)
→ `Player.CastSpell` (the same path as a manual cast) → otherwise melee or keep distance, as before.

No new combat system: the auto-hunt makes the same casts a player could make by hand. Nothing in the
browser decides anything; it only edits settings and shows the status.

## Settings (JSON, short keys)

```json
{"v":1,
 "atk":[{"id":5,"on":true,"mp":20,"rng":6,"aoe":1}],
 "buf":[{"id":2,"on":true,"hp":0,"mp":0,"re":0}],
 "heal":[{"id":1,"on":true,"hp":60,"mp":0,"rng":8,"aoe":1}],
 "min":0,"max":1,"melee":true}
```

- Spells are referenced by spell id and resolved to a spellbook slot at cast time.
- Validation keeps at most 10 spells per list, only spells of that list's category, and clamps
  every number.
- An empty or missing config gives exactly the old melee hunt.

## Spell classification (server, from the same data as the wiki)

| Category | Rule |
|---|---|
| taunt | `TauntAggro > 0` and the spell affects NPCs |
| attack | Formula/Tick/Viral with a negative HP formula on NPCs, or Stun/Root/Snare on NPCs |
| heal | Formula with a positive HP formula that affects Self or Player |
| buff | Buff/TickBuff/Invisible/SeeInvisible/OnAttack/OnMeleeHit with a duration, affecting Self or Player |

## Rules

- **Distance** is in tiles, measured as Chebyshev distance (`max(dx, dy)`). Melee contact is still
  Manhattan distance 1, as before.
- **Area shapes** match `SpellEffect.Cast`:
  - Area: square
  - Plus: `+` shape
  - Cross: diagonals
  - Line and Cone: depend on facing
  - Random: counted as an Area

  For area attacks, every visible monster within range is tried as the centre; the one that hits
  the most monsters wins. A centre that would hit another player is never chosen.
- **Before every cast** the caster checks cooldown, costs, class, map/PvP flags and the target
  (`CanCastSpell`). This avoids "Fizzle", cooldown and wrong-class spam. A cast counts as
  successful when the slot's last-cast time changes.
- **Heals**:
  - Single-target heals go to the most injured ally below the threshold.
  - Group or area heals need `max(2, aoe)` injured allies (capped at the number of allies), or one
    ally at or below half the threshold.
- **Buffs** are skipped while active, unless they end within `re` seconds. They are also skipped
  when a stronger buff blocks them (`BuffDoesntStackOver`). If a buff fails to apply, it is not
  tried again for 30 seconds.
- **Ranged mode** (`melee=false`):
  - Steps away when a monster is closer than `min` tiles.
  - Approaches when the target is farther than `max` tiles.
  - Otherwise waits for a spell. It never swings in melee.
- **Status** is sent only to clients that sent `/autohunt sync`, and only when it changes:
  `AHS<state>,<base64 detail>`. States: active, waiting, moving, casting, healing,
  repositioning, paused, off.

## Phase 2 plan (Monster Taunt)

Add an `mt` block to the settings, with:

- 2 single-target and 2 area taunt slots
- pull radius
- desired and maximum monster count
- minimum and maximum distance
- area-taunt minimum count
- re-taunt delay
- a list of monster template ids to prioritise or ignore

Track the last taunt time per NPC on the player. Each tick, re-evaluate whether to:

- approach the next untaunted monster
- single-taunt it
- area-taunt when enough monsters are close
- wait for the pull to arrive
- hold the group once the desired count is reached

Report the "pulling" status during the pull.
