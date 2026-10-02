# Aspereta browser client (Phase 1 prototype)

A browser client for the existing GooseServer. It speaks the **unchanged** game protocol
over a WebSocket that the server now accepts on a second port. Game rules stay on the
server; the browser sends input and draws what the server says.

```
Desktop client ── TCP :2006 ───────┐
                                   ├─> GameWorld.Received → same login, packets, game logic
Browser ── ws://127.0.0.1:2007 ────┘
```

## Running it locally

1. **Convert the game data once** (and again only when `data`, `maps` or `skins` change):
   double-click `convert-assets.bat`. It reads `..\..\..\Aspereta` by default; pass a
   different game folder as the first argument. The output goes to `www\assets`.
2. **Start the game server** as usual. On startup it logs
   `WebSocket listener for browser clients on ws://127.0.0.1:2007/`.
3. **Start the web page**: double-click `run-web.bat` and open http://localhost:8080/.
   Use `localhost`, not `127.0.0.1`: Windows only lets a normal user serve on `localhost`.
4. Log in with an existing character. Use the arrow keys to move, press Enter to chat, and
   type `/command` for server commands.

The desktop client keeps working at the same time on port 2006.

## What works

**Phase 1 (connection and world):**
- WebSocket connect, login (`LOGIN` → `LOK` → `LCNT`), and ping (`PING` → `PONG`).
- Map loading (`SCM` → load → `DLM` … `DSM`), including warps to other maps.
- Characters (`MKC`, `CHP`, `ERC`, `MOC`, `CHH`, `SUC`, `SUP`) with layered,
  tinted equipment and walk animation.
- Movement (`F`, `M`) with the desktop client's prediction and the server's corrections.
- Chat (`;msg`, `/commands`, `^`, `$`, `#`): a chat log plus bubbles over characters.
- Disconnect detection and a Reconnect button.

**Phase 2, first part (playing):**
- **Combat:** Space attacks (`ATT`, paced by `WPS`), with attack animations for everyone.
  Damage, miss, dodge and other battle text (`BT`). HP/MP bars over characters (`VC`).
- **Character panel:** HP/MP/SP, XP, level, class, gold and stats (`SNF`, `TNL`).
- **Items on the ground** (`MOB`/`EOB`); `,` picks up (`GET`).
- **Inventory** (`SIS`): double-click uses (`USE`).
- **Spellbook** (`SSS`): double-click casts (`CAST`). Targeted spells use the desktop
  client's target selection: arrows or a click choose, Enter casts, Esc cancels.
- **Spell and emote animations** (`SPP`, `SPA`, `EMOT`) and buff icons (`BUF`).
- **Hotkey bar 1-0:** drag items or spells onto it; right-click clears. It is saved per
  character in the browser.
- **Auto-hunt button:** ON/PAUSED/OFF, driven by the server's own messages. Click
  sends `/autohunt on` or `/autohunt pause`; right-click sends `/autohunt off`. Auto-hunt
  steps are walked smoothly, like the desktop client.

**Phase 2, second part (windows and items):**
- **Equipment** (`WNF11`): the paper doll in the "Equip" tab. Double-click takes an item
  off; dragging takes it off or puts it on.
- **Moving items:** drag between inventory slots (`CHANGE`, or `SPLIT` with Ctrl). Drag onto
  the map to drop (`DRP`). Right-click an item for its details (`GID`).
- **Interacting with characters:** double-click to talk or interact (`LC`, e.g. opens a
  vendor); right-click to look (`RC`).
- **Server windows** (`MKW` / `WNF` / `ENW`), as movable panels over the game:
  - Vendors: double-click to buy (`VPI`), drop an inventory item to sell (`VSI`).
  - Containers with 2 to 10 slots: `ITW` / `WTI` / `WTW`.
  - Quest and information windows.
  - Their buttons (Combine / Back / Next / OK / Close) send `WBC`.
- Tabs accept drops: drop on "Equip" to wear an item, on "Inventory" to take it off or
  take it out of a window.

**Phase 2, third part (social and quests):**
- **Party** (`GUD`): a party panel with name, level, class and HP/MP bars (from `VC`).
  Party members' names are yellow on the map. While choosing a spell target, click a
  member to pick them.
- **Quest indicators** (`CHI`): shown above NPCs. If the sheet/graphic pair names a frame
  of that sheet, that frame is drawn. Otherwise the client draws "!" (graphic 1, quest
  available) or "?" (quest ready), since Aspereta's data has no quest icon art. `0,0`
  clears the indicator.
- **Chat shortcuts** as in the desktop client: `/` opens chat with a slash, `G` with
  `/guild `, `T` with `/tell `, `R` replies to the last tell. Up/Down recall sent lines.
- **Bank and trade windows** (`MKW` frames 26 and 25) use slot grids with drag-and-drop
  (`ITW`/`WTI`/`WTW`).

**Phase 2, fourth part (server window parity):**
- **Option lists** (`MKW` frame 27): each line is a button that sends `WBC20`...`WBC27`
  (line on the current page). The server pages long lists with Back/Next and closes the list
  itself after a pick. Used by quest NPCs with several quests, `/quests` and `/recipes`.
- **Opening line** (`WNL`) above a window's lines, e.g. "Welcome, adventurer!" on quest lists.
- **Server close** (`CLW`): the window is removed and nothing is sent back.
- **Line icons** in the extended `WNF` format (`text|stack|item|sheet|graphic|*` or
  `...|r|g|b|a`), e.g. recipe results; Aspereta's item and text lines keep their format.

**Phase 3, first part (classic look):** the game's own skin (`Game.ini` `Skin=`, e.g.
Maisemore), from the files `convert-assets.bat` already writes to `www/assets/skins`.
Positions, sizes and buttons come from the skin's `Window.ini`/`Button.ini`, read the way the
desktop client's `BaseWindow` reads them:
- **Server windows** on their skin bitmaps: vendor (`[Vendor]`), containers
  (`[Container2]`...`[Container10]`), quest/text windows and option lists (`[BlankMessage]`),
  info windows (`[BlankMessage3]`). Title, close box (`cboff`), the skin's OK/Next/Back/Close/
  Combine buttons (up/down images), slots at `objoff` + `objdim`, and the focused/unfocused
  transparency (`focus=`). They scale with the game screen and can be dragged.
- **Text in the game's bitmap font** (ADF file 101, 6x11 glyphs, as `FontRenderer`).
- **Side panels:** inventory (`[Inventory]`), spellbook (`[SpellBook]`), hotkey bar
  (`[HotButtons]`), HP/MP/SP/XP bars (`[HPbar]`... with `PCTbar` and the clipped bar image) and
  the party list (`[Group]`, names with 1px HP/MP bars like `PartyWindow`).
- **Plain look / Classic look** button in the top bar switches between this and the plain
  browser look (remembered in the browser). Without converted skins the plain look is used.
- **Character window** (`[Character]`): the paper doll (`equip1`...`equip13`) and the stat
  labels (name, guild, class, level, HP/MP/SP, experience, gold, stats, resists) in yellow, as
  `CharacterWindow`. In the classic look the Equip and Stats tabs, and the E / C keys, open and
  close it as a floating window. (Maisemore's `cboff` for it points at an empty spot, so the
  painted X also closes it.)
- **Buff bar** (`[SpellEffects]`): a floating bar that shows while buffs are active.
- **Chat box** (`[Chat]`): the last lines in the game font with the chat colours, word-wrapped
  with a two-space indent like `ChatListBox`, and the input line below; scroll with the wheel.
- Bank, trade and the other frames the desktop client has no skin section for keep the plain
  window style.
- **Hover tooltips** like the desktop client (`Tooltip.cs`), in both looks: the name of the
  item, spell or buff under the mouse in the game font, white on black with a white border,
  just above the cursor (inventory, equipment, spellbook, hotkeys, buffs, vendor and container
  windows); items on the ground show "name (stack)" on dark blue below the cursor. Right-click
  still asks the server for the full item details (`GID`).
- **Removing a buff:** double-click it on the buff bar (both looks) sends `KBUF`; the server
  only removes buffs whose effect allows it.

**Not done, on purpose or for now:**
- Sound: the server sends no sound events and the desktop client plays none, so there is
  nothing to follow without inventing when sounds play.
- Trade and letter windows: the server never opens them (frames 24/25 are never sent).
- The custom-item window (frame 28, needs Illutia custom tickets) and the GM log viewer
  (frame 29, GM only) open as plain windows without their special controls.

Packets the browser doesn't handle are listed in `aspereta.session.unhandled` in the
browser console.

## Game wiki (`www/wiki`)

A static, searchable wiki built from the server's own game data: items, creatures (monsters),
NPCs (vendors, bankers, quest givers), spells, quests, recipes, maps and item modifiers, all
linked to each other (drops with their chances, vendor stock, spawn maps, quest givers, recipe
ingredients, ...).

- **Spells** show their required level where the data has one: the level each class learns it
  at (`classes_levelup_spells`) and the minimum level of each item that teaches it
  (`learn_spell_id`, `min_level`). Spells with neither say so.
- **Maps** show a picture of the map, drawn from the converted map file named by
  `map_filename` (`www/assets/maps/<n>.bin`) with the game's own tiles, all four layers; "View
  full size" opens it at 1:1. `build-wiki.bat` packs the converted maps into
  `www/wiki/maps-data.js` so this works from disk and in `aspereta-wiki.html` too.
- **Quests** show the NPC who gives the quest (from the NPCs' `quest_ids`).

1. **Export the data:** double-click `build-wiki.bat`. It reads
   `..\..\Goose\bin\Debug\AsperetaGoose.db` by default (pass another database as the first
   argument) and writes `www\wiki\data.js` plus `www\wiki\assets-index.js` (the picture index,
   when `www\assets` exists: run `convert-assets.bat` first). Run it again after changing game data.
2. **Open it:** `www\wiki\index.html` works straight from disk or through `run-web.bat`
   (http://localhost:8080/wiki/).
3. **Share it:** the same run writes `aspereta-wiki.html` next to `build-wiki.bat`: the whole wiki,
   pictures included, in one file that opens anywhere.

Pictures: item, spell and buff icons are the game's own frames, tinted like the game. Creatures and
NPCs are drawn the way the browser client draws them: the appearance the server sends for them
(body, face, hair, equipment and colours), standing and facing down. Opened from disk, browsers
don't let the page read its own image pixels, so tinted pictures use a close colour blend there;
over http and in `aspereta-wiki.html` the tint is exact.

How it stays faithful to the game:
- The exporter (`AsperetaWeb wiki`) copies the listed game-data tables row by row, read-only,
  through the same SQLite library as the server, so values come out the way the server loads
  them (for example a decimal stored in an INT column reads as the server's integer).
  Player, account and log tables are never read.
- Labels (use types, slots, NPC types, effect types, quest requirement/reward types, ...) are
  copied from the server's enums; values the server doesn't define are shown as "Unknown (n)".
- Class restrictions are decoded as `Class.CanUse` does (0 = every class, bit N = class id N).
  Drop chances are the stored `droprate` percentages, before the `DropRateModifier` setting.
- Zero or empty values are left out of the summaries. Every page has an "All fields" table with
  each column as stored. References to ids that don't exist in the data are shown as such.

Search everything from the header (press `/`), or use each section's search, filters and
sortable columns. Every entry has its own link (for example `#/items/290`).

## Layout

| Path | What |
|---|---|
| `client/src/*.ts` | TypeScript source (no framework, Canvas 2D). `skin.ts` reads the game's skin. |
| `www/` | What the browser loads: `index.html`, `style.css`, compiled `js/`, converted `assets/`. |
| `tools/AsperetaWeb/` | `convert` (asset pipeline), `serve` (local static server) and `wiki` (game data export), .NET 10. |
| `www/wiki/` | The static game wiki: `index.html`, `wiki.js`, `wiki-model.js`, `wiki.css`, generated `data.js` and `assets-index.js`. |
| `../../Goose/WebSocketTransport.cs` | The server side: handshake, frame decode/encode. |

### Assets (`www/assets`, generated — not committed)

The converter compiles in the desktop client's own `AdfFile.cs`, `CompiledEnc.cs`,
`MapFile.cs`, `AsperetaMapLoader.cs` and `IniFile.cs`, so the browser sees exactly what
the desktop client decodes.

- `index.json`: frame id → `[sheet, x, y, w, h]`, plus animations and `compiled.enc`.
  It is the only thing loaded before login.
- `gfx/{n}.png`: one sheet per `.adf`, with black (pixel value 0) made transparent the
  way SDL's colour key does it. Sheets are fetched when something on screen needs them.
- `maps/{n}.bin`: `AMAP`, u16 version (1), u16 width, u16 height, then per tile
  u8 blocked + 4 × i32 layer frame ids (little endian). Fetched on `SCM`.
- `skins/{skin}/*.json|png` and `game.json`: skin and settings files, for Phase 2 UI.

The local server gzips JSON/maps/JS on the fly.

## Building the TypeScript

The compiled `www/js` is committed, so running the client needs only .NET. After
editing `client/src`:

```
cd client
npx tsc -p .              # or: npm run build
npm test                  # packet parser / map format / tint / wiki tests (Node 20+)
```

## Server settings

`GooseSettings.json`:

| Setting | Default | Meaning |
|---|---|---|
| `WebSocketIP` | `127.0.0.1` | Interface for browser clients. Keep it local until TLS is in place. |
| `WebSocketPort` | `2007` | `0` disables browser support. |

If the port can't be bound, the server logs an error and carries on with TCP only.

Browser connections are ordinary sockets inside the server, so the per-IP connection
limits, login throttling, logs and `LoginEvent` all see the browser's real address.

## Putting it online

Live at https://play.tijolada.com/. See [DEPLOY.md](DEPLOY.md): a Cloudflare Tunnel in front
(HTTPS for the page, `wss://play.tijolada.com/ws` for the game; Caddy with `deploy/Caddyfile`
is the alternative), the game's WebSocket listener stays on 127.0.0.1, and two server settings:

| Setting | Default | Meaning |
|---|---|---|
| `WebSocketAllowedOrigins` | `[]` | Web addresses allowed to open a game connection (`Origin` header), e.g. `["https://play.tijolada.com"]`. Empty allows any (local prototype). Others get `403`. |
| `WebSocketTrustedProxies` | `[]` | Proxy addresses (e.g. `["127.0.0.1"]`) whose `X-Forwarded-For` gives the player's real address for per-IP limits, login throttling, bans and logs. |

On an https page the login form defaults to `wss://<same host>/ws`; locally it stays
`ws://<host>:2007/`. Logins over plain `ws://` should stay on localhost.

## Not done yet (deliberately)

- **Server-side settings:** the browser keeps the server address and character name in
  localStorage. Passwords are never stored.
