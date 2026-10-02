// One login to the game server: drives the login handshake, map loading, packet handling
// and the player's input. Mirrors the flow of the desktop client:
//
//   LOGIN name,pass,GooseClient  ->  LOK realm  ->  LCNT
//   SCM map,version,name         ->  (load map) ->  DLM
//   MKC.../SUC id/SUP x,y/...    ->  DSM
//   M<dir> / F<dir> / ;chat      <-> MOC, SUP, CHH, ^, $
//
// The browser never decides game state; it predicts a step for smoothness exactly like the
// desktop client and accepts whatever the server sends back.
import { AutoHuntTracker } from "./autohunt.js";
import { OneShot } from "./character.js";
import { Connection } from "./connection.js";
import { ChatType, ClientPackets, Direction, LINE_CLICK_COUNT, WindowFrame, parsePacket } from "./protocol.js";
import { World } from "./world.js";
export const INVENTORY_SLOTS = 30;
/** Paper-doll slots in the character window (WNF11 lines). */
export const EQUIP_SLOTS = 14;
/** The character window is always window 11; its slots follow the inventory's in USE. */
const EQUIPMENT_WINDOW = 11;
export const SPELL_SLOTS = 30;
/** View range used for spell targeting (GameClient.ViewRangeX/Y at 640x480). */
const VIEW_RANGE_X = 10, VIEW_RANGE_Y = 7;
export class Session {
    constructor(credentials, assets, events) {
        this.credentials = credentials;
        this.assets = assets;
        this.events = events;
        this.world = null;
        this.realm = "";
        this.mapName = "";
        this.phase = "connecting";
        this.mapLoadToken = 0;
        this.loginFailed = false;
        this.loggedIn = false;
        // Movement state, as GameScreen: a held key turns first, then walks after 0.1 s; after a
        // server correction (SUP) input pauses for 0.2 s.
        this.moveKeyDown = false;
        this.moveKeyDirection = Direction.Down;
        this.moveKeyPressedTime = 0;
        this.moveDelay = false;
        this.moveDelayElapsed = 0;
        // Phase 2 state, as the server reports it.
        this.status = null;
        this.experience = { percent: 0, experience: 0, toNextLevel: 0 };
        this.inventory = new Array(INVENTORY_SLOTS).fill(null);
        this.spells = new Array(SPELL_SLOTS).fill(null);
        this.buffs = [];
        this.autoHunt = new AutoHuntTracker();
        this.equipment = new Array(EQUIP_SLOTS).fill(null);
        this.windows = new Map();
        /** Party lines by GUD line number (PartyWindow). */
        this.party = [];
        /** Who sent the last tell, for the R shortcut (ChatWindow.replyToName). */
        this.replyTo = null;
        // Attack pacing (GameScreen: one swing per weapon speed).
        this.weaponSpeed = 1;
        this.lastAutoHuntStep = 0;
        this.attackCooldown = 0;
        /** While choosing a target for a spell (Map.OpenTarget). */
        this.targeting = null;
        /** Unhandled packet prefixes seen, for the debug panel. */
        this.unhandled = new Map();
        /** Text width for battle text placement; set by the page (canvas font metrics). */
        this.measureText = (text) => text.length * 6;
        this.connection = new Connection({
            onOpen: () => {
                this.setPhase("loggingIn");
                this.connection.send(ClientPackets.login(credentials.username, credentials.password));
            },
            onPacket: (packet) => this.handleRaw(packet),
            onClose: (reason, wasOpen) => {
                this.world = null;
                this.setPhase("disconnected", reason);
                if (!this.loginFailed)
                    this.events.disconnected(reason, wasOpen || this.loggedIn);
            },
        });
    }
    start() {
        this.setPhase("connecting");
        this.connection.connect(this.credentials.url);
    }
    /** Logout / leave: closes the socket; the server logs the character out as for TCP. */
    stop() {
        this.connection.disconnect();
        this.world = null;
        this.mapLoadToken++;
        this.setPhase("disconnected", "Logged out.");
    }
    setPhase(phase, detail) {
        this.phase = phase;
        this.events.phase(phase, detail);
    }
    handleRaw(raw) {
        const result = parsePacket(raw);
        if (!result.ok) {
            if (result.reason === "error")
                console.warn(`Could not parse packet '${raw}'`, result.error);
            const prefix = raw.match(/^[A-Za-z]+|^./)?.[0] ?? raw;
            this.unhandled.set(prefix, (this.unhandled.get(prefix) ?? 0) + 1);
            return;
        }
        this.handle(result.packet);
    }
    handle(p) {
        const world = this.world;
        switch (p.type) {
            case "loginOk":
                this.realm = p.realm;
                this.loggedIn = true;
                this.connection.send(ClientPackets.loginContinued());
                break;
            case "loginFail":
                this.loginFailed = true;
                this.events.disconnected(`Login failed. ${p.message}`, false);
                this.connection.disconnect();
                this.setPhase("disconnected", p.message);
                break;
            case "ping":
                this.connection.send(ClientPackets.pong());
                break;
            case "sendCurrentMap":
                this.loadMap(p.mapNumber, p.mapName);
                break;
            case "doneSendingMap":
                if (this.world)
                    this.setPhase("inGame");
                break;
            case "mapName":
                break; // the desktop client ignores it too
            case "makeCharacter":
                world?.addCharacter(p.data);
                break;
            case "updateCharacter":
                world?.updateCharacter(p.data);
                break;
            case "eraseCharacter":
                world?.removeCharacter(p.loginId);
                break;
            case "moveCharacter": {
                const character = world?.characters.get(p.loginId);
                if (world && character)
                    world.moveCharacter(character, p.x, p.y);
                break;
            }
            case "changeHeading":
                world?.changeHeading(p.loginId, p.facing);
                break;
            case "setYourCharacter":
                world?.setPlayer(p.loginId);
                break;
            case "setYourPosition":
                if (world) {
                    // Auto-hunt steps arrive as SUP one tile at a time: walk them like a normal move,
                    // paced to the server's step rate (GameScreen.WalkAutoHuntStep). Anything else snaps.
                    const player = world.player;
                    if (player && this.autoHunt.state === "on" && world.validTile(p.x, p.y) &&
                        Math.abs(p.x - player.tileX) + Math.abs(p.y - player.tileY) === 1) {
                        const now = performance.now();
                        const sinceLast = now - this.lastAutoHuntStep;
                        this.lastAutoHuntStep = now;
                        const normal = player.moveSpeed;
                        if (sinceLast < normal)
                            player.moveSpeed = Math.max(200, sinceLast);
                        world.moveCharacter(player, p.x, p.y);
                        player.moveSpeed = normal;
                        break;
                    }
                    world.setPlayerPosition(p.x, p.y);
                    this.moveDelay = true;
                    this.moveDelayElapsed = 0;
                }
                break;
            case "serverMessage":
                this.events.chat(p.chatType, p.message);
                if (p.chatType === ChatType.Tell && p.message.startsWith("[tell from] ") && p.message.includes(":"))
                    this.replyTo = p.message.substring(12, p.message.indexOf(":"));
                if (p.chatType === ChatType.Server && this.autoHunt.onServerMessage(p.message))
                    this.events.stateChanged();
                break;
            case "chat":
                this.events.chat(ChatType.Chat, p.message);
                world?.characters.get(p.loginId)?.setChat(p.message);
                break;
            case "hashMessage":
                this.events.chat(ChatType.Chat, p.message);
                break;
            case "attack": {
                // The server sends our own ATT only for swings it starts itself (auto-hunt); a
                // manual swing is already playing because it was started locally on the key press.
                const c = world?.characters.get(p.loginId);
                if (c && !(c === world?.player && c.attacking))
                    c.attack();
                break;
            }
            case "battleText": {
                const c = world?.characters.get(p.loginId);
                if (c)
                    c.addBattleText(p.kind, p.text, this.measureText);
                break;
            }
            case "vitals": {
                world?.characters.get(p.loginId)?.setVitals(p.hp, p.mp);
                const member = this.party.find((m) => m?.loginId === p.loginId);
                if (member) {
                    member.hp = p.hp;
                    member.mp = p.mp;
                    this.events.stateChanged();
                }
                break;
            }
            case "groupUpdate": {
                if (p.line < 0 || p.line >= 50)
                    break;
                this.party[p.line] = p.loginId > 0
                    ? { loginId: p.loginId, name: p.name, level: p.level, className: p.className, hp: this.party[p.line]?.loginId === p.loginId ? this.party[p.line].hp : 100, mp: this.party[p.line]?.loginId === p.loginId ? this.party[p.line].mp : 0 }
                    : null;
                this.syncPartyNames();
                this.events.stateChanged();
                break;
            }
            case "characterIcon": {
                const c = world?.characters.get(p.loginId);
                if (c)
                    c.icon = p.sheet === 0 && p.graphic === 0 ? null : { sheet: p.sheet, graphic: p.graphic };
                break;
            }
            case "statusInfo":
                this.status = p.data;
                this.events.stateChanged();
                break;
            case "experience":
                this.experience = { percent: p.percent, experience: p.experience, toNextLevel: p.toNextLevel };
                this.events.stateChanged();
                break;
            case "mapObject":
                world?.setObject(p.x, p.y, { graphic: p.graphic, name: p.name, stack: p.stack, tint: p.tint });
                break;
            case "eraseObject":
                world?.setObject(p.x, p.y, null);
                break;
            case "spellCharacter": {
                const c = world?.characters.get(p.loginId);
                const anim = this.oneShot(p.animation);
                if (c && anim)
                    c.spell = anim;
                break;
            }
            case "spellTile": {
                const anim = this.oneShot(p.animation);
                if (world && anim)
                    world.addSpellTile(p.x, p.y, anim);
                break;
            }
            case "weaponSpeed":
                this.weaponSpeed = p.ms / 1000;
                break;
            case "emote": {
                const c = world?.characters.get(p.loginId);
                const info = this.assets.animation(179 + p.emote);
                if (c && info)
                    c.emote = new OneShot(info.frames, 0.5);
                break;
            }
            case "inventorySlot":
                if (p.slot >= 0 && p.slot < INVENTORY_SLOTS) {
                    this.inventory[p.slot] = p.item;
                    this.events.stateChanged();
                }
                break;
            case "spellSlot":
                if (p.slot >= 0 && p.slot < SPELL_SLOTS) {
                    this.spells[p.slot] = p.spell;
                    this.events.stateChanged();
                }
                break;
            case "makeWindow":
                // A repeat MKW for the same id (paging) replaces the window's contents.
                this.windows.set(p.window.id, { ...p.window, lines: [], opening: null, shown: false });
                this.events.stateChanged();
                break;
            case "windowLine":
                if (p.windowId === EQUIPMENT_WINDOW) {
                    if (p.line >= 0 && p.line < EQUIP_SLOTS)
                        this.equipment[p.line] = p.data;
                }
                else {
                    const w = this.windows.get(p.windowId);
                    if (w && p.line >= 0 && p.line < 200)
                        w.lines[p.line] = p.data;
                }
                this.events.stateChanged();
                break;
            case "windowOpeningLine": {
                const w = this.windows.get(p.windowId);
                if (w)
                    w.opening = p.text;
                this.events.stateChanged();
                break;
            }
            case "closeWindow":
                if (this.windows.delete(p.windowId))
                    this.events.stateChanged();
                break;
            case "endWindow": {
                const w = this.windows.get(p.windowId);
                if (w)
                    w.shown = true;
                this.events.stateChanged();
                break;
            }
            case "buffSlot":
                if (p.slot >= 0 && p.slot < 40) {
                    this.buffs[p.slot] = p.buff;
                    this.events.stateChanged();
                }
                break;
        }
    }
    syncPartyNames() {
        const ids = new Set(this.party.filter((m) => !!m).map((m) => m.loginId));
        if (!this.world)
            return;
        this.world.partyIds = ids;
        for (const c of this.world.characters.values())
            c.inParty = ids.has(c.loginId);
    }
    oneShot(animationId) {
        const info = this.assets.animation(animationId);
        return info && info.frames.length ? new OneShot(info.frames, info.secondsPerFrame) : null;
    }
    loadMap(mapNumber, mapName) {
        const token = ++this.mapLoadToken;
        this.world = null;
        this.targeting = null;
        this.mapName = mapName;
        this.events.mapChanged(mapName);
        this.setPhase("loadingMap", mapName);
        this.assets.loadMap(mapNumber).then((data) => {
            if (token !== this.mapLoadToken || this.phase === "disconnected")
                return;
            this.world = new World(data, this.assets);
            this.syncPartyNames();
            this.connection.send(ClientPackets.doneLoadingMap());
        }, (error) => {
            if (token !== this.mapLoadToken)
                return;
            this.events.chat(ChatType.Client, `Could not load map ${mapNumber}: ${error}`);
            this.stop();
        });
    }
    /** Called every frame with the direction key currently held (or null). */
    update(dt, heldDirection, attackHeld = false) {
        const world = this.world;
        if (!world)
            return;
        if (this.attackCooldown > 0)
            this.attackCooldown -= dt;
        if (attackHeld && !this.targeting)
            this.attack();
        if (heldDirection === null || this.targeting) {
            this.moveKeyDown = false;
            this.moveKeyPressedTime = 0;
        }
        else {
            this.moveKeyPressed(world, heldDirection);
        }
        world.update(dt);
        if (this.moveKeyDown)
            this.moveKeyPressedTime += dt;
        if (this.moveDelay) {
            this.moveDelayElapsed += dt;
            if (this.moveDelayElapsed >= 0.2) {
                this.moveDelay = false;
                this.moveDelayElapsed = 0;
            }
        }
    }
    moveKeyPressed(world, direction) {
        const player = world.player;
        if (!player || player.moving || this.moveDelay)
            return;
        let delay = true;
        if (!this.moveKeyDown || this.moveKeyDirection !== direction) {
            this.moveKeyDown = true;
            this.moveKeyDirection = direction;
            this.moveKeyPressedTime = 0;
            if (player.facing !== direction) {
                player.setFacing(direction);
                this.connection.send(ClientPackets.facing(direction));
                return;
            }
            delay = false;
        }
        if (delay && this.moveKeyPressedTime < 0.1)
            return;
        let x = player.tileX;
        let y = player.tileY;
        if (direction === Direction.Up)
            y--;
        else if (direction === Direction.Right)
            x++;
        else if (direction === Direction.Down)
            y++;
        else
            x--;
        if (world.canMoveTo(x, y)) {
            world.moveCharacter(player, x, y);
            this.connection.send(ClientPackets.move(direction));
        }
    }
    /** Space: swing, at most once per weapon speed (GameScreen.AttackKeyPressed). */
    attack() {
        const player = this.world?.player;
        if (!player || this.attackCooldown > 0)
            return;
        this.attackCooldown = this.weaponSpeed;
        player.attack();
        this.connection.send(ClientPackets.attack());
    }
    pickUp() {
        if (this.world)
            this.connection.send(ClientPackets.pickUp());
    }
    useItem(slot) {
        if (this.world && this.inventory[slot])
            this.connection.send(ClientPackets.use(slot));
    }
    /**
     * Map.OnCastSpell: targetable spells open target selection on the player (arrows move
     * it, Enter casts, Esc cancels); the rest are cast on ourselves straight away.
     */
    castSpell(slot) {
        const world = this.world;
        const spell = this.spells[slot];
        if (!world?.player || !spell || this.targeting)
            return;
        if (!spell.targetable) {
            this.connection.send(ClientPackets.cast(slot, world.player.loginId));
            return;
        }
        const current = world.target;
        const stillVisible = current && world.visibleCharacters(VIEW_RANGE_X, VIEW_RANGE_Y).includes(current);
        world.target = stillVisible ? current : world.player;
        world.showTarget = true;
        this.targeting = { slot };
    }
    /** Keys while targeting. Returns true when the key was used. */
    targetKey(key) {
        const world = this.world;
        if (!this.targeting || !world?.player)
            return false;
        if (key === "Escape") {
            this.targeting = null;
            world.showTarget = false;
            return true;
        }
        if (key === "Enter") {
            const target = world.target ?? world.player;
            this.connection.send(ClientPackets.cast(this.targeting.slot, target.loginId));
            this.targeting = null;
            world.showTarget = false;
            return true;
        }
        if (key === "Home") {
            world.target = world.player;
            return true;
        }
        const forward = key === "ArrowRight" || key === "ArrowDown";
        const backward = key === "ArrowLeft" || key === "ArrowUp";
        if (!forward && !backward)
            return false;
        // Map.SetNextSpellCastTarget: step through on-screen characters row by row, wrapping.
        const list = world.visibleCharacters(VIEW_RANGE_X, VIEW_RANGE_Y);
        if (list.length === 0)
            return true;
        const i = world.target ? list.indexOf(world.target) : -1;
        const next = forward ? (i + 1) % list.length : (i <= 0 ? list.length - 1 : i - 1);
        world.target = list[next];
        return true;
    }
    /** Clicking a character while targeting picks it. */
    pickTarget(loginId) {
        const c = this.world?.characters.get(loginId);
        if (c && this.world)
            this.world.target = c;
    }
    /**
     * Drag and drop between inventory, paper doll, server windows and the ground, sending the
     * same packets as the desktop client's ItemSlot/VendorSlot.HandleDrop and
     * GameScreen.OnDropWasUnhandled.
     */
    moveItem(from, to, split = false) {
        if (!this.world)
            return;
        const send = (packet) => this.connection.send(packet);
        const equipUseSlot = (i) => INVENTORY_SLOTS + i + 1;
        if (from.kind === "equipment") {
            // Anything dragged off the paper doll is unequipped.
            if (to.kind !== "equipment")
                send(ClientPackets.use(equipUseSlot(from.slot)));
            return;
        }
        if (to.kind === "equipment") {
            if (from.kind === "inventory")
                send(ClientPackets.use(from.slot));
            return;
        }
        if (from.kind === "inventory") {
            const item = this.inventory[from.slot];
            if (!item)
                return;
            if (to.kind === "inventory") {
                if (to.slot !== from.slot)
                    send(split ? ClientPackets.split(from.slot, to.slot) : ClientPackets.change(from.slot, to.slot));
            }
            else if (to.kind === "ground") {
                send(ClientPackets.drop(from.slot, item.stack));
            }
            else if (to.kind === "window") {
                const w = this.windows.get(to.windowId);
                if (!w)
                    return;
                if (w.frame === WindowFrame.Vendor)
                    send(ClientPackets.vendorSell(w.npcId, from.slot, item.stack));
                else
                    send(ClientPackets.inventoryToWindow(from.slot, w.id, to.slot));
            }
            return;
        }
        if (from.kind === "window") {
            const w = this.windows.get(from.windowId);
            if (!w || w.frame === WindowFrame.Vendor)
                return; // vendor stock is bought, not dragged
            if (to.kind === "inventory")
                send(ClientPackets.windowToInventory(w.id, from.slot, to.slot));
            else if (to.kind === "window" && (to.windowId !== from.windowId || to.slot !== from.slot))
                send(ClientPackets.windowToWindow(w.id, from.slot, to.windowId, to.slot));
        }
    }
    /** Double-click on an equipped item takes it off (CharacterWindow.OnSlotDoubleClicked). */
    unequip(slot) {
        if (this.world && this.equipment[slot])
            this.connection.send(ClientPackets.use(INVENTORY_SLOTS + slot + 1));
    }
    /** Right-click on an item asks the server for its details (GID). */
    itemDetails(itemId) {
        if (this.world && itemId > 0)
            this.connection.send(ClientPackets.itemDetails(itemId));
    }
    vendorBuy(windowId, slot) {
        const w = this.windows.get(windowId);
        if (this.world && w && w.lines[slot])
            this.connection.send(ClientPackets.vendorBuy(w.npcId, slot));
    }
    /** Window buttons: Close hides locally and tells the server; the rest just go to the server. */
    windowButton(windowId, button) {
        const w = this.windows.get(windowId);
        if (!w)
            return;
        if (this.world)
            this.connection.send(ClientPackets.windowButton(button, w));
        if (button === 1) {
            w.shown = false;
            this.windows.delete(windowId);
        }
        this.events.stateChanged();
    }
    /** Option-list line click (0-based line on the current page). The server closes the list. */
    windowLineClick(windowId, line) {
        const w = this.windows.get(windowId);
        if (!w || !this.world || line < 0 || line >= LINE_CLICK_COUNT || !w.lines[line])
            return;
        this.connection.send(ClientPackets.windowLineClick(line, w));
    }
    /** Double-click / right-click on a character in the world (LC / RC). */
    clickCharacter(loginId, right) {
        const c = this.world?.characters.get(loginId);
        if (!c)
            return;
        this.connection.send(right ? ClientPackets.rightClick(c.tileX, c.tileY) : ClientPackets.leftClick(c.tileX, c.tileY));
    }
    toggleAutoHunt() {
        if (this.world)
            this.connection.send(ClientPackets.command(this.autoHunt.next()));
        this.events.stateChanged();
    }
    stopAutoHunt() {
        if (this.world)
            this.connection.send(ClientPackets.command(this.autoHunt.off()));
        this.events.stateChanged();
    }
    /** Chat box input: "/command args" goes as a command, anything else as ;chat. */
    sendChat(text) {
        const message = text.trim();
        if (!message)
            return;
        if (message.startsWith("/"))
            this.connection.send(ClientPackets.command(message));
        else
            this.connection.send(ClientPackets.chat(message));
    }
}
