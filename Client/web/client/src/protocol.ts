// Packet parsing for the existing Goose/Aspereta text protocol.
//
// A straight translation of the desktop client's PacketParser / PacketManager and the
// packet classes in AsperetaClient/Packets. Server -> client packets are a prefix followed
// by comma separated fields; packets are delimited by \x01 on the wire.

export const PACKET_DELIMITER = "\x01";

export class PacketParser {
  private index: number;

  constructor(private readonly packet: string, prefix: string) {
    this.index = prefix.length;
  }

  remaining(): string {
    if (this.index >= this.packet.length) throw new Error(`no data left in ${this.packet}`);
    return this.packet.substring(this.index);
  }

  private token(): string {
    if (this.index >= this.packet.length) throw new Error(`no data left in ${this.packet}`);
    const comma = this.packet.indexOf(",", this.index);
    let value: string;
    if (comma === -1) {
      value = this.packet.substring(this.index);
      this.index = this.packet.length;
    } else {
      value = this.packet.substring(this.index, comma);
      this.index = comma + 1;
    }
    return value;
  }

  int(): number {
    const text = this.token();
    const value = Number.parseInt(text, 10);
    if (Number.isNaN(value)) throw new Error(`expected a number, got '${text}'`);
    return value;
  }

  string(): string {
    return this.token();
  }

  substring(length: number): string {
    if (this.index + length >= this.packet.length) throw new Error(`substring out of bounds in ${this.packet}`);
    const value = this.packet.substring(this.index, this.index + length);
    this.index += length;
    return value;
  }

  peek(): string {
    return this.packet[this.index];
  }

  /** PacketParser.GetBool: anything but "0" is true. */
  flag(): boolean {
    return this.token() !== "0";
  }

  /** Characters not yet consumed (PacketParser.LengthRemaining). */
  left(): number {
    return Math.max(0, this.packet.length - this.index);
  }
}

/** Per slot: [graphic, r, g, b, a]. Slots: chest, head, legs, feet, shield, weapon. */
export type DisplayedEquipment = number[][];

function parseEquipment(p: PacketParser, stripTrailingStar: boolean): DisplayedEquipment {
  const equipped: DisplayedEquipment = [];
  for (let i = 0; i < 6; i++) {
    const graphic = p.int();
    if (p.peek() === "*") {
      p.string();
      equipped.push([graphic, 0, 0, 0, 0]);
    } else {
      const r = p.int();
      const g = p.int();
      const b = p.int();
      if (stripTrailingStar) {
        let a = p.string();
        if (a.endsWith("*")) a = a.substring(0, a.length - 1);
        equipped.push([graphic, r, g, b, Number.parseInt(a, 10)]);
      } else {
        equipped.push([graphic, r, g, b, p.int()]);
      }
    }
  }
  return equipped;
}

export interface Appearance {
  bodyId: number;
  bodyState: number;
  hairId: number;
  equipment: DisplayedEquipment;
  hair: [number, number, number, number];
  invisible: number;
  faceId: number;
}

export interface MakeCharacter extends Appearance {
  loginId: number;
  characterType: number;
  name: string;
  title: string;
  surname: string;
  guildName: string;
  x: number; // 0 based tile
  y: number;
  facing: number; // 0 up, 1 right, 2 down, 3 left
  hpPercent: number;
}

export interface UpdateCharacter extends Appearance {
  loginId: number;
}

/** Every server packet the Phase 1 client understands, already parsed. */
export type ServerPacket =
  | { type: "loginOk"; realm: string }
  | { type: "loginFail"; message: string }
  | { type: "ping" }
  | { type: "sendCurrentMap"; mapNumber: number; mapVersion: number; mapName: string }
  | { type: "doneSendingMap" }
  | { type: "mapName"; name: string }
  | { type: "makeCharacter"; data: MakeCharacter }
  | { type: "updateCharacter"; data: UpdateCharacter }
  | { type: "eraseCharacter"; loginId: number }
  | { type: "moveCharacter"; loginId: number; x: number; y: number }
  | { type: "changeHeading"; loginId: number; facing: number }
  | { type: "setYourCharacter"; loginId: number }
  | { type: "setYourPosition"; x: number; y: number }
  | { type: "serverMessage"; chatType: number; message: string }
  | { type: "chat"; loginId: number; message: string }
  | { type: "hashMessage"; message: string }
  // Phase 2
  | { type: "attack"; loginId: number }
  | { type: "battleText"; loginId: number; kind: number; text: string }
  | { type: "vitals"; loginId: number; hp: number; mp: number }
  | { type: "statusInfo"; data: StatusInfo }
  | { type: "experience"; percent: number; experience: number; toNextLevel: number }
  | { type: "mapObject"; x: number; y: number; graphic: number; name: string; stack: number; tint: [number, number, number, number] }
  | { type: "eraseObject"; x: number; y: number }
  | { type: "spellCharacter"; loginId: number; animation: number }
  | { type: "spellTile"; x: number; y: number; animation: number }
  | { type: "weaponSpeed"; ms: number }
  | { type: "emote"; loginId: number; emote: number }
  | { type: "inventorySlot"; slot: number; item: InventoryItem | null }
  | { type: "spellSlot"; slot: number; spell: SpellInfo | null }
  | { type: "buffSlot"; slot: number; buff: { graphic: number; name: string } | null }
  // Server windows
  | { type: "makeWindow"; window: WindowInfo }
  | { type: "windowLine"; windowId: number; line: number; data: WindowLine | null }
  | { type: "endWindow"; windowId: number }
  | { type: "windowOpeningLine"; windowId: number; text: string }
  | { type: "closeWindow"; windowId: number }
  // Party and quest indicators
  | { type: "groupUpdate"; line: number; loginId: number; name: string; level: number; className: string }
  | { type: "characterIcon"; loginId: number; sheet: number; graphic: number };

/** WindowFrames.cs */
export enum WindowFrame {
  Equipped = 11, Vendor = 13, TwoSlot = 15, FourSlot = 16, SixSlot = 17, EightSlot = 18, TenSlot = 19,
  Quest = 20, Quest2 = 21, GenericInfo = 22, Paper = 24, Trade = 25, Bank = 26,
  OptionList = 27, Custom = 28, LogViewer = 29,
}

/** Option-list line clicks are WBC button ids 20.. (Goose Window.LineClickOffset/Count). */
export const LINE_CLICK_OFFSET = 20;
export const LINE_CLICK_COUNT = 8;

/** WindowButtons.cs, in MKW order. */
export const WINDOW_BUTTONS = ["Combine", "Close", "Back", "Next", "OK"] as const;

export interface WindowInfo {
  id: number;
  frame: number;
  title: string;
  buttons: boolean[];
  npcId: number;
  unknown1: number;
  unknown2: number;
}

/** One WNF line: text plus an optional item (graphic 0 = text only). */
export interface WindowLine {
  text: string;
  stack: number;
  itemId: number;
  graphic: number;
  tint: [number, number, number, number];
}

export interface StatusInfo {
  guild: string;
  className: string;
  level: number;
  maxHp: number; maxMp: number; maxSp: number;
  hp: number; mp: number; sp: number;
  str: number; sta: number; int: number; dex: number;
  ac: number;
  resists: [number, number, number, number, number];
  gold: number;
}

export interface InventoryItem {
  itemId: number;
  name: string;
  stack: number;
  graphic: number;
  tint: [number, number, number, number];
}

export interface SpellInfo {
  name: string;
  targetable: boolean;
  graphic: number;
}

type Parser = (p: PacketParser) => ServerPacket;

// Prefixes exactly as in AsperetaClient/Packets/*.cs. Coordinates and facings are 1 based on
// the wire; the desktop client subtracts one while parsing and so do we.
const PARSERS: Record<string, Parser> = {
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
    const hair: [number, number, number, number] = [p.int(), p.int(), p.int(), p.int()];
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
    const hair: [number, number, number, number] = [p.int(), p.int(), p.int(), p.int()];
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
    const resists: [number, number, number, number, number] = [p.int(), p.int(), p.int(), p.int(), p.int()];
    const gold = p.int();
    return { type: "statusInfo", data: { guild, className, level, maxHp, maxMp, maxSp, hp, mp, sp, str, sta, int, dex, ac, resists, gold } };
  },
  TNL: (p) => {
    const percent = Math.min(100, p.int());
    const experience = p.int();
    let toNextLevel = p.int();
    if (p.left() > 0) toNextLevel = p.int();
    return { type: "experience", percent, experience, toNextLevel };
  },
  MOB: (p) => {
    const graphic = p.int();
    const x = p.int() - 1;
    const y = p.int() - 1;
    const name = p.string();
    const stack = p.int();
    let tint: [number, number, number, number] = [0, 0, 0, 0];
    if (p.peek() === "*") p.string();
    else tint = [p.int(), p.int(), p.int(), p.int()];
    return { type: "mapObject", x, y, graphic, name, stack, tint };
  },
  EOB: (p) => ({ type: "eraseObject", x: p.int() - 1, y: p.int() - 1 }),
  SPP: (p) => ({ type: "spellCharacter", loginId: p.int(), animation: p.int() }),
  SPA: (p) => ({ type: "spellTile", x: p.int() - 1, y: p.int() - 1, animation: p.int() }),
  WPS: (p) => ({ type: "weaponSpeed", ms: p.int() }),
  EMOT: (p) => ({ type: "emote", loginId: p.int(), emote: p.int() }),
  SIS: (p) => {
    const slot = p.int() - 1;
    if (p.left() === 0) return { type: "inventorySlot", slot, item: null };
    const itemId = p.int();
    const name = p.string();
    const stack = p.int();
    const graphic = p.int();
    const tint: [number, number, number, number] = [p.int(), p.int(), p.int(), p.int()];
    return { type: "inventorySlot", slot, item: { itemId, name, stack, graphic, tint } };
  },
  SSS: (p) => {
    const slot = p.int() - 1;
    if (p.left() === 0) return { type: "spellSlot", slot, spell: null };
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
    const num = (i: number) => Number.parseInt(fields[i] ?? "0", 10) || 0;
    const text = fields[0] ?? "";
    // Item/text lines: text|stack|item|graphic|* or text|stack|item|graphic|r|g|b|a.
    // Extended lines (Packets.WindowLine, option lists): text|stack|item|sheet|graphic|*
    // or text|stack|item|sheet|graphic|r|g|b|a, i.e. one field more.
    const extended = fields.length === 6 || fields.length === 9;
    const g = extended ? 4 : 3;
    const graphic = num(g);
    const tint: [number, number, number, number] = fields[g + 1] === "*" || fields[g + 1] === undefined
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
    if (p.left() === 0) return { type: "buffSlot", slot, buff: null };
    const graphic = p.int();
    const name = p.left() > 0 ? p.string() : "";
    return { type: "buffSlot", slot, buff: { graphic, name } };
  },
};

export type ParseResult =
  | { ok: true; packet: ServerPacket }
  | { ok: false; reason: "unhandled" | "error"; error?: unknown };

/**
 * Same lookup as PacketManager.Handle: try prefixes of length 1..8 and use the first one
 * that has a handler.
 */
export function parsePacket(packet: string): ParseResult {
  for (let i = 1; i <= Math.min(8, packet.length); i++) {
    const prefix = packet.substring(0, i);
    const parser = PARSERS[prefix];
    if (!parser) continue;
    try {
      return { ok: true, packet: parser(new PacketParser(packet, prefix)) };
    } catch (error) {
      return { ok: false, reason: "error", error };
    }
  }
  return { ok: false, reason: "unhandled" };
}

/** Splits a received stream into packets, keeping any incomplete tail for next time. */
export class PacketBuffer {
  private buffer = "";

  push(data: string): string[] {
    this.buffer += data;
    const parts = this.buffer.split(PACKET_DELIMITER);
    this.buffer = parts.pop() ?? "";
    return parts.filter((p) => p.length > 0);
  }

  clear(): void {
    this.buffer = "";
  }
}

// Client -> server packets, as sent by AsperetaClient/NetworkClient.cs.
export enum Direction { Up = 0, Right = 1, Down = 2, Left = 3 }

export const ClientPackets = {
  login: (user: string, password: string) => `LOGIN${user},${password},GooseClient`,
  loginContinued: () => "LCNT",
  doneLoadingMap: () => "DLM",
  pong: () => "PONG",
  // The old Asp client remaps facing; the desktop client keeps that mapping.
  facing: (d: Direction) => `F${[1, 4, 2, 3][d]}`,
  move: (d: Direction) => `M${d + 1}`,
  chat: (message: string) => `;${message}`,
  command: (command: string) => command,
  attack: () => "ATT",
  pickUp: () => "GET",
  use: (slot: number) => `USE${slot + 1}`,
  cast: (slot: number, targetId: number) => `CAST${slot + 1},${targetId}`,
  // Item moves (NetworkClient.cs). Slots are 0 based here, 1 based on the wire.
  change: (from: number, to: number) => `CHANGE${from + 1},${to + 1}`,
  split: (from: number, to: number) => `SPLIT${from + 1},${to + 1}`,
  drop: (slot: number, stack: number) => `DRP${slot + 1},${stack}`,
  inventoryToWindow: (from: number, windowId: number, to: number) => `ITW${from + 1},${windowId},${to + 1}`,
  windowToInventory: (windowId: number, from: number, to: number) => `WTI${windowId},${from + 1},${to + 1}`,
  windowToWindow: (fromWindow: number, from: number, toWindow: number, to: number) => `WTW${fromWindow},${from + 1},${toWindow},${to + 1}`,
  windowButton: (button: number, w: WindowInfo) => `WBC${button + 1},${w.id},${w.npcId},${w.unknown1},${w.unknown2}`,
  /** NetworkClient.KillBuff: remove the buff in bar slot `slot` (0-based). */
  killBuff: (slot: number) => `KBUF${slot + 1}`,
  /** Click on line `line` (0-based, current page) of an option list. */
  windowLineClick: (line: number, w: WindowInfo) => `WBC${LINE_CLICK_OFFSET + line},${w.id},${w.npcId},${w.unknown1},${w.unknown2}`,
  vendorBuy: (npcId: number, slot: number) => `VPI${npcId},${slot + 1}`,
  vendorSell: (npcId: number, slot: number, stack: number) => `VSI${npcId},${slot + 1},${stack}`,
  itemDetails: (itemId: number) => `GID${itemId}`,
  leftClick: (x: number, y: number) => `LC${x + 1},${y + 1}`,
  rightClick: (x: number, y: number) => `RC${x + 1},${y + 1}`,
};

/** ChatType from GUIElements/ChatListBox.cs. */
export enum ChatType { Chat = 1, Guild, Group, Melee, Spells, Tell, Server, Client }
