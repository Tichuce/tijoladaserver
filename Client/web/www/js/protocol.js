// Packet parsing for the existing Goose/Aspereta text protocol.
//
// A straight translation of the desktop client's PacketParser / PacketManager and the
// packet classes in AsperetaClient/Packets. Server -> client packets are a prefix followed
// by comma separated fields; packets are delimited by \x01 on the wire.
export const PACKET_DELIMITER = "\x01";
export class PacketParser {
    constructor(packet, prefix) {
        this.packet = packet;
        this.index = prefix.length;
    }
    remaining() {
        if (this.index >= this.packet.length)
            throw new Error(`no data left in ${this.packet}`);
        return this.packet.substring(this.index);
    }
    token() {
        if (this.index >= this.packet.length)
            throw new Error(`no data left in ${this.packet}`);
        const comma = this.packet.indexOf(",", this.index);
        let value;
        if (comma === -1) {
            value = this.packet.substring(this.index);
            this.index = this.packet.length;
        }
        else {
            value = this.packet.substring(this.index, comma);
            this.index = comma + 1;
        }
        return value;
    }
    int() {
        const text = this.token();
        const value = Number.parseInt(text, 10);
        if (Number.isNaN(value))
            throw new Error(`expected a number, got '${text}'`);
        return value;
    }
    string() {
        return this.token();
    }
    substring(length) {
        if (this.index + length >= this.packet.length)
            throw new Error(`substring out of bounds in ${this.packet}`);
        const value = this.packet.substring(this.index, this.index + length);
        this.index += length;
        return value;
    }
    peek() {
        return this.packet[this.index];
    }
    /** PacketParser.GetBool: anything but "0" is true. */
    flag() {
        return this.token() !== "0";
    }
    /** Characters not yet consumed (PacketParser.LengthRemaining). */
    left() {
        return Math.max(0, this.packet.length - this.index);
    }
}
function parseEquipment(p, stripTrailingStar) {
    const equipped = [];
    for (let i = 0; i < 6; i++) {
        const graphic = p.int();
        if (p.peek() === "*") {
            p.string();
            equipped.push([graphic, 0, 0, 0, 0]);
        }
        else {
            const r = p.int();
            const g = p.int();
            const b = p.int();
            if (stripTrailingStar) {
                let a = p.string();
                if (a.endsWith("*"))
                    a = a.substring(0, a.length - 1);
                equipped.push([graphic, r, g, b, Number.parseInt(a, 10)]);
            }
            else {
                equipped.push([graphic, r, g, b, p.int()]);
            }
        }
    }
    return equipped;
}
/** WindowFrames.cs */
export var WindowFrame;
(function (WindowFrame) {
    WindowFrame[WindowFrame["Equipped"] = 11] = "Equipped";
    WindowFrame[WindowFrame["Vendor"] = 13] = "Vendor";
    WindowFrame[WindowFrame["TwoSlot"] = 15] = "TwoSlot";
    WindowFrame[WindowFrame["FourSlot"] = 16] = "FourSlot";
    WindowFrame[WindowFrame["SixSlot"] = 17] = "SixSlot";
    WindowFrame[WindowFrame["EightSlot"] = 18] = "EightSlot";
    WindowFrame[WindowFrame["TenSlot"] = 19] = "TenSlot";
    WindowFrame[WindowFrame["Quest"] = 20] = "Quest";
    WindowFrame[WindowFrame["Quest2"] = 21] = "Quest2";
    WindowFrame[WindowFrame["GenericInfo"] = 22] = "GenericInfo";
    WindowFrame[WindowFrame["Paper"] = 24] = "Paper";
    WindowFrame[WindowFrame["Trade"] = 25] = "Trade";
    WindowFrame[WindowFrame["Bank"] = 26] = "Bank";
    WindowFrame[WindowFrame["OptionList"] = 27] = "OptionList";
    WindowFrame[WindowFrame["Custom"] = 28] = "Custom";
    WindowFrame[WindowFrame["LogViewer"] = 29] = "LogViewer";
})(WindowFrame || (WindowFrame = {}));
/** Option-list line clicks are WBC button ids 20.. (Goose Window.LineClickOffset/Count). */
export const LINE_CLICK_OFFSET = 20;
export const LINE_CLICK_COUNT = 8;
/** WindowButtons.cs, in MKW order. */
export const WINDOW_BUTTONS = ["Combine", "Close", "Back", "Next", "OK"];
// Prefixes exactly as in AsperetaClient/Packets/*.cs. Coordinates and facings are 1 based on
// the wire; the desktop client subtracts one while parsing and so do we.
const PARSERS = {
    LOK: (p) => ({ type: "loginOk", realm: p.remaining() }),
    LNO: (p) => ({ type: "loginFail", message: p.remaining() }),
    PING: () => ({ type: "ping" }),
    SCM: (p) => ({ type: "sendCurrentMap", mapNumber: p.int(), mapVersion: p.int(), mapName: p.remaining() }),
    DSM: () => ({ type: "doneSendingMap" }),
    SMN: (p) => ({ type: "mapName", name: p.string() }),
    MKC: (p) => {
        const loginId = p.int();
        const characterType = p.int();
        const name = p.string();
        const title = p.string();
        const surname = p.string();
        const guildName = p.string();
        const x = p.int() - 1;
        const y = p.int() - 1;
        const facing = p.int() - 1;
        const hpPercent = p.int();
        const bodyId = p.int();
        const bodyState = p.int();
        const hairId = p.int();
        const equipment = parseEquipment(p, true);
        const hair = [p.int(), p.int(), p.int(), p.int()];
        const invisible = p.int();
        const faceId = p.int();
        return {
            type: "makeCharacter",
            data: { loginId, characterType, name, title, surname, guildName, x, y, facing, hpPercent,
                bodyId, bodyState, hairId, equipment, hair, invisible, faceId },
        };
    },
    CHP: (p) => {
        const loginId = p.int();
        const bodyId = p.int();
        const bodyState = p.int();
        const hairId = p.int();
        const equipment = parseEquipment(p, false);
        const hair = [p.int(), p.int(), p.int(), p.int()];
        const invisible = p.int();
        const faceId = p.int();
        return { type: "updateCharacter", data: { loginId, bodyId, bodyState, hairId, equipment, hair, invisible, faceId } };
    },
    ERC: (p) => ({ type: "eraseCharacter", loginId: p.int() }),
    MOC: (p) => ({ type: "moveCharacter", loginId: p.int(), x: p.int() - 1, y: p.int() - 1 }),
    CHH: (p) => ({ type: "changeHeading", loginId: p.int(), facing: p.int() - 1 }),
    SUC: (p) => ({ type: "setYourCharacter", loginId: p.int() }),
    SUP: (p) => ({ type: "setYourPosition", x: p.int() - 1, y: p.int() - 1 }),
    $: (p) => ({ type: "serverMessage", chatType: Number.parseInt(p.substring(1), 10), message: p.remaining() }),
    "^": (p) => ({ type: "chat", loginId: p.int(), message: p.remaining() }),
    "#": (p) => ({ type: "hashMessage", message: p.remaining() }),
    // Phase 2: combat, vitals, items, spells (formats from AsperetaClient/Packets and the
    // server's Aspereta.csx overrides). Slots are 1 based on the wire.
    ATT: (p) => ({ type: "attack", loginId: p.int() }),
    BT: (p) => {
        const loginId = p.int();
        const kind = p.int();
        const text = p.left() > 0 ? p.string() : "";
        return { type: "battleText", loginId, kind, text };
    },
    VC: (p) => ({ type: "vitals", loginId: p.int(), hp: p.int(), mp: p.int() }),
    SNF: (p) => {
        const guild = p.string();
        p.string();
        const className = p.string();
        const level = p.int();
        const [maxHp, maxMp, maxSp, hp, mp, sp] = [p.int(), p.int(), p.int(), p.int(), p.int(), p.int()];
        const [str, sta, int, dex, ac] = [p.int(), p.int(), p.int(), p.int(), p.int()];
        const resists = [p.int(), p.int(), p.int(), p.int(), p.int()];
        const gold = p.int();
        return { type: "statusInfo", data: { guild, className, level, maxHp, maxMp, maxSp, hp, mp, sp, str, sta, int, dex, ac, resists, gold } };
    },
    TNL: (p) => {
        const percent = Math.min(100, p.int());
        const experience = p.int();
        let toNextLevel = p.int();
        if (p.left() > 0)
            toNextLevel = p.int();
        return { type: "experience", percent, experience, toNextLevel };
    },
    MOB: (p) => {
        const graphic = p.int();
        const x = p.int() - 1;
        const y = p.int() - 1;
        const name = p.string();
        const stack = p.int();
        let tint = [0, 0, 0, 0];
        if (p.peek() === "*")
            p.string();
        else
            tint = [p.int(), p.int(), p.int(), p.int()];
        return { type: "mapObject", x, y, graphic, name, stack, tint };
    },
    EOB: (p) => ({ type: "eraseObject", x: p.int() - 1, y: p.int() - 1 }),
    SPP: (p) => ({ type: "spellCharacter", loginId: p.int(), animation: p.int() }),
    SPA: (p) => ({ type: "spellTile", x: p.int() - 1, y: p.int() - 1, animation: p.int() }),
    WPS: (p) => ({ type: "weaponSpeed", ms: p.int() }),
    EMOT: (p) => ({ type: "emote", loginId: p.int(), emote: p.int() }),
    SIS: (p) => {
        const slot = p.int() - 1;
        if (p.left() === 0)
            return { type: "inventorySlot", slot, item: null };
        const itemId = p.int();
        const name = p.string();
        const stack = p.int();
        const graphic = p.int();
        const tint = [p.int(), p.int(), p.int(), p.int()];
        return { type: "inventorySlot", slot, item: { itemId, name, stack, graphic, tint } };
    },
    SSS: (p) => {
        const slot = p.int() - 1;
        if (p.left() === 0)
            return { type: "spellSlot", slot, spell: null };
        const name = p.string();
        p.string();
        p.string();
        const targetable = p.string() === "T";
        const graphic = p.int();
        return { type: "spellSlot", slot, spell: name ? { name, targetable, graphic } : null };
    },
    MKW: (p) => {
        // MKW1001,13,Welcome to my shop!,0,1,0,0,0,1201,0,0
        const id = p.int();
        const frame = p.int();
        const title = p.string();
        const buttons = [p.flag(), p.flag(), p.flag(), p.flag(), p.flag()];
        const npcId = p.int();
        const unknown1 = p.int();
        const unknown2 = p.int();
        return { type: "makeWindow", window: { id, frame, title, buttons, npcId, unknown1, unknown2 } };
    },
    WNF: (p) => {
        // WNF11,4,Old Rags|1|5002|120241|0|0|0|0   and   WNF11,2, |0|0|0|*
        const windowId = p.int();
        const line = p.int() - 1;
        const fields = p.remaining().split("|");
        const num = (i) => Number.parseInt(fields[i] ?? "0", 10) || 0;
        const text = fields[0] ?? "";
        // Item/text lines: text|stack|item|graphic|* or text|stack|item|graphic|r|g|b|a.
        // Extended lines (Packets.WindowLine, option lists): text|stack|item|sheet|graphic|*
        // or text|stack|item|sheet|graphic|r|g|b|a, i.e. one field more.
        const extended = fields.length === 6 || fields.length === 9;
        const g = extended ? 4 : 3;
        const graphic = num(g);
        const tint = fields[g + 1] === "*" || fields[g + 1] === undefined
            ? [0, 0, 0, 0] : [num(g + 1), num(g + 2), num(g + 3), num(g + 4)];
        const empty = graphic === 0 && text.trim() === "";
        return { type: "windowLine", windowId, line, data: empty ? null : { text, stack: num(1), itemId: num(2), graphic, tint } };
    },
    ENW: (p) => ({ type: "endWindow", windowId: p.int() }),
    // Non-clickable opening line above the lines (Window.OpeningLine), sent after MKW.
    WNL: (p) => ({ type: "windowOpeningLine", windowId: p.int(), text: p.remaining() }),
    // Server-side close: discard the window, and send nothing back (protocol.txt).
    CLW: (p) => ({ type: "closeWindow", windowId: p.int() }),
    GUD: (p) => {
        // GUD<line>,<loginId>,<name>,<level>,<class>   or   GUD<line>,0,,0,
        const line = p.int() - 1;
        const loginId = p.int();
        const name = p.left() > 0 ? p.string() : "";
        let level = 0, className = "";
        if (loginId > 0) {
            level = p.left() > 0 ? p.int() : 0;
            className = p.left() > 0 ? p.string() : "";
        }
        return { type: "groupUpdate", line, loginId, name, level, className };
    },
    // Quest indicator above an NPC (server QuestIcon* settings); 0,0 clears it.
    CHI: (p) => ({ type: "characterIcon", loginId: p.int(), sheet: p.int(), graphic: p.int() }),
    BUF: (p) => {
        const slot = p.int() - 1;
        if (p.left() === 0)
            return { type: "buffSlot", slot, buff: null };
        const graphic = p.int();
        const name = p.left() > 0 ? p.string() : "";
        return { type: "buffSlot", slot, buff: { graphic, name } };
    },
};
/**
 * Same lookup as PacketManager.Handle: try prefixes of length 1..8 and use the first one
 * that has a handler.
 */
export function parsePacket(packet) {
    for (let i = 1; i <= Math.min(8, packet.length); i++) {
        const prefix = packet.substring(0, i);
        const parser = PARSERS[prefix];
        if (!parser)
            continue;
        try {
            return { ok: true, packet: parser(new PacketParser(packet, prefix)) };
        }
        catch (error) {
            return { ok: false, reason: "error", error };
        }
    }
    return { ok: false, reason: "unhandled" };
}
/** Splits a received stream into packets, keeping any incomplete tail for next time. */
export class PacketBuffer {
    constructor() {
        this.buffer = "";
    }
    push(data) {
        this.buffer += data;
        const parts = this.buffer.split(PACKET_DELIMITER);
        this.buffer = parts.pop() ?? "";
        return parts.filter((p) => p.length > 0);
    }
    clear() {
        this.buffer = "";
    }
}
// Client -> server packets, as sent by AsperetaClient/NetworkClient.cs.
export var Direction;
(function (Direction) {
    Direction[Direction["Up"] = 0] = "Up";
    Direction[Direction["Right"] = 1] = "Right";
    Direction[Direction["Down"] = 2] = "Down";
    Direction[Direction["Left"] = 3] = "Left";
})(Direction || (Direction = {}));
export const ClientPackets = {
    login: (user, password) => `LOGIN${user},${password},GooseClient`,
    loginContinued: () => "LCNT",
    doneLoadingMap: () => "DLM",
    pong: () => "PONG",
    // The old Asp client remaps facing; the desktop client keeps that mapping.
    facing: (d) => `F${[1, 4, 2, 3][d]}`,
    move: (d) => `M${d + 1}`,
    chat: (message) => `;${message}`,
    command: (command) => command,
    attack: () => "ATT",
    pickUp: () => "GET",
    use: (slot) => `USE${slot + 1}`,
    cast: (slot, targetId) => `CAST${slot + 1},${targetId}`,
    // Item moves (NetworkClient.cs). Slots are 0 based here, 1 based on the wire.
    change: (from, to) => `CHANGE${from + 1},${to + 1}`,
    split: (from, to) => `SPLIT${from + 1},${to + 1}`,
    drop: (slot, stack) => `DRP${slot + 1},${stack}`,
    inventoryToWindow: (from, windowId, to) => `ITW${from + 1},${windowId},${to + 1}`,
    windowToInventory: (windowId, from, to) => `WTI${windowId},${from + 1},${to + 1}`,
    windowToWindow: (fromWindow, from, toWindow, to) => `WTW${fromWindow},${from + 1},${toWindow},${to + 1}`,
    windowButton: (button, w) => `WBC${button + 1},${w.id},${w.npcId},${w.unknown1},${w.unknown2}`,
    /** Click on line `line` (0-based, current page) of an option list. */
    windowLineClick: (line, w) => `WBC${LINE_CLICK_OFFSET + line},${w.id},${w.npcId},${w.unknown1},${w.unknown2}`,
    vendorBuy: (npcId, slot) => `VPI${npcId},${slot + 1}`,
    vendorSell: (npcId, slot, stack) => `VSI${npcId},${slot + 1},${stack}`,
    itemDetails: (itemId) => `GID${itemId}`,
    leftClick: (x, y) => `LC${x + 1},${y + 1}`,
    rightClick: (x, y) => `RC${x + 1},${y + 1}`,
};
/** ChatType from GUIElements/ChatListBox.cs. */
export var ChatType;
(function (ChatType) {
    ChatType[ChatType["Chat"] = 1] = "Chat";
    ChatType[ChatType["Guild"] = 2] = "Guild";
    ChatType[ChatType["Group"] = 3] = "Group";
    ChatType[ChatType["Melee"] = 4] = "Melee";
    ChatType[ChatType["Spells"] = 5] = "Spells";
    ChatType[ChatType["Tell"] = 6] = "Tell";
    ChatType[ChatType["Server"] = 7] = "Server";
    ChatType[ChatType["Client"] = 8] = "Client";
})(ChatType || (ChatType = {}));
