// Page wiring: login form, game canvas, chat, connection status and reconnect.

import { Assets, TILE_SIZE } from "./assets.js";
import { dropTarget } from "./dnd.js";
import { Panels } from "./panels.js";
import { Windows } from "./windows.js";
import { Skin } from "./skin.js";
import { ChatType, Direction } from "./protocol.js";
import { Credentials, Session, SessionPhase } from "./session.js";

const SCREEN_W = 640;
const SCREEN_H = 480;
const MAX_CHAT_LINES = 200;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const loginPanel = $<HTMLFormElement>("login");
const serverInput = $<HTMLInputElement>("server");
const userInput = $<HTMLInputElement>("username");
const passInput = $<HTMLInputElement>("password");
const loginButton = $<HTMLButtonElement>("login-button");
const loginError = $<HTMLParagraphElement>("login-error");
const gamePanel = $<HTMLDivElement>("game");
const canvas = $<HTMLCanvasElement>("screen");
const overlay = $<HTMLDivElement>("overlay");
const overlayText = $<HTMLParagraphElement>("overlay-text");
const overlayActions = $<HTMLDivElement>("overlay-actions");
const reconnectButton = $<HTMLButtonElement>("reconnect");
const backButton = $<HTMLButtonElement>("back");
const logoutButton = $<HTMLButtonElement>("logout");
const statusText = $<HTMLSpanElement>("status");
const mapText = $<HTMLSpanElement>("map-name");
const chatLog = $<HTMLDivElement>("chat-log");
const chatInput = $<HTMLInputElement>("chat-input");

const ctx = canvas.getContext("2d")!;
canvas.width = SCREEN_W;
canvas.height = SCREEN_H;
ctx.imageSmoothingEnabled = false;

const assets = new Assets("assets");
const panels = new Panels(assets);
const windows = new Windows(document.getElementById("windows")!, assets, (g, t) => panels.icon(g, t));
assets.onSheetLoaded(() => windows.render());
let assetsReady: Promise<void> | null = null;

// ---- classic look: the game's own skin (when converted), toggled from the top bar ----

const lookButton = $<HTMLButtonElement>("look");
let skin: Skin | null = null;
let classicLook = (() => { try { return localStorage.getItem("aspereta.classic") !== "0"; } catch { return true; } })();

function applyLook(): void {
  const on = classicLook && !!skin;
  panels.setLook(skin, on);
  windows.setLook(skin, on);
  lookButton.hidden = !skin;
  lookButton.textContent = on ? "Plain look" : "Classic look";
  lookButton.title = on ? "Switch to the plain browser look" : `Use the game's ${skin?.name ?? ""} skin`;
}

lookButton.addEventListener("click", () => {
  classicLook = !classicLook;
  try { localStorage.setItem("aspereta.classic", classicLook ? "1" : "0"); } catch { /* private mode */ }
  applyLook();
  canvas.focus();
});

void Skin.load("assets").then((loaded) => {
  skin = loaded;
  applyLook();
});

// Skinned windows are drawn at the game screen's scale, like the desktop client's UI.
const windowLayer = document.getElementById("windows")!;
new ResizeObserver(() => {
  windowLayer.style.setProperty("--ui-scale", String(canvas.clientWidth / SCREEN_W || 1));
}).observe(canvas);
let session: Session | null = null;
let lastCredentials: Credentials | null = null;

// ---- settings (browser storage is fine for the local prototype; never the password) ----

function load(key: string): string | null {
  try { return localStorage.getItem(`aspereta.${key}`); } catch { return null; }
}
function save(key: string, value: string): void {
  try { localStorage.setItem(`aspereta.${key}`, value); } catch { /* private mode */ }
}

const params = new URLSearchParams(location.search);
serverInput.value = params.get("ws") ?? load("server") ?? `ws://${location.hostname || "localhost"}:2007/`;
userInput.value = load("username") ?? "";
(userInput.value ? passInput : userInput).focus();

// ---- login / connection lifecycle ----

loginPanel.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const credentials: Credentials = {
    url: serverInput.value.trim(),
    username: userInput.value.trim(),
    password: passInput.value,
  };
  if (!credentials.username || !credentials.password) {
    loginError.textContent = "Enter your character name and password.";
    return;
  }
  save("server", credentials.url);
  save("username", credentials.username);
  startSession(credentials);
});

reconnectButton.addEventListener("click", () => {
  if (lastCredentials) startSession(lastCredentials);
});

backButton.addEventListener("click", () => showLogin(""));

logoutButton.addEventListener("click", () => {
  session?.stop();
  session = null;
  showLogin("");
});

async function startSession(credentials: Credentials): Promise<void> {
  session?.stop();
  session = null;
  lastCredentials = credentials;
  loginError.textContent = "";
  loginButton.disabled = true;

  try {
    assetsReady ??= assets.loadIndex();
    loginButton.textContent = "Loading…";
    await assetsReady;
  } catch (e) {
    assetsReady = null;
    loginButton.disabled = false;
    loginButton.textContent = "Enter";
    loginError.textContent = `Could not load game assets: ${(e as Error).message}`;
    return;
  }

  loginButton.disabled = false;
  loginButton.textContent = "Enter";
  loginPanel.hidden = true;
  gamePanel.hidden = false;
  chatLog.replaceChildren();
  showOverlay("Connecting…", false);

  const s = new Session(credentials, assets, {
    phase: (phase, detail) => {
      if (session !== s) return;
      onPhase(phase, detail);
    },
    chat: (type, text) => {
      if (session !== s) return;
      addChat(type, text);
    },
    disconnected: (reason, canReconnect) => {
      if (session !== s) return;
      if (!canReconnect) {
        // Never got in (wrong password, server down): back to the form with the reason.
        session = null;
        showLogin(reason);
        return;
      }
      addChat(ChatType.Client, reason);
      showOverlay(reason, true);
    },
    mapChanged: (name) => {
      if (session !== s) return;
      mapText.textContent = name;
    },
    stateChanged: () => {
      if (session !== s) return;
      panels.changed();
      windows.render();
    },
  });
  ctx.font = "11px Verdana, Tahoma, sans-serif";
  s.measureText = (text) => ctx.measureText(text).width;
  session = s;
  panels.attach(s, credentials.username, new URL(credentials.url, location.href).host);
  windows.attach(s);
  s.start();
}

function onPhase(phase: SessionPhase, detail?: string): void {
  const labels: Record<SessionPhase, string> = {
    connecting: "Connecting…",
    loggingIn: "Logging in…",
    loadingMap: `Loading ${detail ?? "map"}…`,
    inGame: "Connected",
    disconnected: "Disconnected",
  };
  statusText.textContent = labels[phase];
  statusText.dataset.phase = phase;

  if (phase === "inGame") hideOverlay();
  else if (phase !== "disconnected") showOverlay(labels[phase], false);
}

function showLogin(message: string): void {
  gamePanel.hidden = true;
  loginPanel.hidden = false;
  loginError.textContent = message;
  passInput.value = "";
  passInput.focus();
}

function showOverlay(text: string, withActions: boolean): void {
  overlay.hidden = false;
  overlayText.textContent = text;
  overlayActions.hidden = !withActions;
  if (withActions) reconnectButton.focus();
}

function hideOverlay(): void {
  overlay.hidden = true;
}

// ---- chat ----

const CHAT_CLASS: Partial<Record<ChatType, string>> = {
  [ChatType.Chat]: "chat",
  [ChatType.Guild]: "guild",
  [ChatType.Group]: "group",
  [ChatType.Tell]: "tell",
  [ChatType.Server]: "server",
  [ChatType.Client]: "client",
};

function addChat(type: ChatType, text: string): void {
  const atBottom = chatLog.scrollTop + chatLog.clientHeight >= chatLog.scrollHeight - 4;
  const line = document.createElement("div");
  line.className = `line ${CHAT_CLASS[type] ?? "other"}`;
  line.textContent = text;
  chatLog.appendChild(line);
  while (chatLog.childElementCount > MAX_CHAT_LINES) chatLog.firstElementChild?.remove();
  if (atBottom) chatLog.scrollTop = chatLog.scrollHeight;
}

// Sent lines, for Up/Down recall (ChatWindow input history).
const chatHistory: string[] = [];
let historyIndex = 0;

chatInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") {
    ev.preventDefault();
    const text = chatInput.value;
    session?.sendChat(text);
    if (text.trim() && chatHistory[chatHistory.length - 1] !== text) chatHistory.push(text);
    historyIndex = chatHistory.length;
    chatInput.value = "";
    chatInput.blur();
  } else if (ev.key === "Escape") {
    chatInput.value = "";
    historyIndex = chatHistory.length;
    chatInput.blur();
  } else if (ev.key === "ArrowUp" && chatHistory.length) {
    ev.preventDefault();
    historyIndex = Math.max(0, historyIndex - 1);
    chatInput.value = chatHistory[historyIndex];
  } else if (ev.key === "ArrowDown" && chatHistory.length) {
    ev.preventDefault();
    historyIndex = Math.min(chatHistory.length, historyIndex + 1);
    chatInput.value = chatHistory[historyIndex] ?? "";
  }
  ev.stopPropagation();
});

/** Opens the chat box with some text already typed (ChatWindow's / G T R shortcuts). */
function openChat(prefill: string): void {
  chatInput.value = prefill;
  chatInput.focus();
  chatInput.setSelectionRange(prefill.length, prefill.length);
}

// ---- keyboard ----

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: Direction.Up,
  ArrowRight: Direction.Right,
  ArrowDown: Direction.Down,
  ArrowLeft: Direction.Left,
};
const heldKeys: string[] = [];

window.addEventListener("keydown", (ev) => {
  if (gamePanel.hidden || document.activeElement === chatInput) return;
  if (document.activeElement instanceof HTMLInputElement) return;

  // Choosing a spell target takes the arrows, Enter and Esc (Map.HandleEvent).
  if (session?.targeting) {
    if (session.targetKey(ev.key)) ev.preventDefault();
    return;
  }

  if (ev.key === "Enter") {
    ev.preventDefault();
    chatInput.focus();
    return;
  }
  if (ev.key in KEY_DIRECTIONS || ev.key === " ") {
    ev.preventDefault();
    if (!heldKeys.includes(ev.key)) heldKeys.push(ev.key);
    return;
  }
  if (ev.repeat) return;
  if (ev.key === "/") {
    ev.preventDefault();
    openChat("/");
  } else if (ev.key === "g" || ev.key === "G") {
    ev.preventDefault();
    openChat("/guild ");
  } else if (ev.key === "t" || ev.key === "T") {
    ev.preventDefault();
    openChat("/tell ");
  } else if (ev.key === "r" || ev.key === "R") {
    ev.preventDefault();
    openChat(`/tell ${session?.replyTo ? session.replyTo + " " : ""}`);
  } else if (ev.key === ",") {
    session?.pickUp();
  } else if (/^[0-9]$/.test(ev.key)) {
    // 1..9 then 0, like the desktop hotkey bar.
    panels.useHotkey((Number(ev.key) + 9) % 10);
  } else if (ev.key === "i" || ev.key === "I") {
    panels.showTab("inventory");
  } else if (ev.key === "s" || ev.key === "S") {
    panels.showTab("spells");
  } else if (ev.key === "e" || ev.key === "E" || ev.key === "c" || ev.key === "C") {
    panels.showTab("equipment");
  }
});

function screenPoint(ev: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [((ev.clientX - rect.left) / rect.width) * SCREEN_W, ((ev.clientY - rect.top) / rect.height) * SCREEN_H];
}

function characterUnder(ev: MouseEvent) {
  const world = session?.world;
  if (!world) return null;
  const [px, py] = screenPoint(ev);
  const c = world.characterAtPoint(px, py, SCREEN_W, SCREEN_H);
  if (c) return c;
  // Fall back to the tile under the cursor.
  const [camX, camY] = world.camera(SCREEN_W, SCREEN_H);
  return world.characterAt(Math.floor((px + camX) / TILE_SIZE), Math.floor((py + camY) / TILE_SIZE));
}

// While targeting, clicking a character picks it.
canvas.addEventListener("click", (ev) => {
  if (!session?.targeting) return;
  const c = characterUnder(ev);
  if (c) session.pickTarget(c.loginId);
});

// Double-click a character to talk / interact (LC), right-click to look (RC).
canvas.addEventListener("dblclick", (ev) => {
  if (session?.targeting) return;
  const c = characterUnder(ev);
  if (c) session?.clickCharacter(c.loginId, false);
});
canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  const c = characterUnder(ev);
  if (c) session?.clickCharacter(c.loginId, true);
});

// Dropping an inventory item on the world drops it on the ground; equipment comes off.
dropTarget(canvas, (payload) => {
  if (payload.type === "item") session?.moveItem(payload.place, { kind: "ground" });
});
window.addEventListener("keyup", (ev) => {
  const i = heldKeys.indexOf(ev.key);
  if (i >= 0) heldKeys.splice(i, 1);
});
window.addEventListener("blur", () => { heldKeys.length = 0; });
chatInput.addEventListener("focus", () => { heldKeys.length = 0; });

function heldDirection(): Direction | null {
  // GameScreen checks Up, Right, Down, Left in that order.
  for (const key of ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"])
    if (heldKeys.includes(key)) return KEY_DIRECTIONS[key];
  return null;
}

// ---- main loop ----

let last = performance.now();
function frame(now: number): void {
  // Background tabs throttle rAF; cap dt so a long pause does not fling characters.
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;

  const world = session?.world ?? null;
  session?.update(dt, heldDirection(), heldKeys.includes(" "));

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  if (world) world.render(ctx, SCREEN_W, SCREEN_H);
  if (world && session?.targeting) {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, SCREEN_H - 22, SCREEN_W, 22);
    ctx.fillStyle = "#fff";
    ctx.fillText("Choose a target: arrows or click · Enter casts · Esc cancels", 8, SCREEN_H - 16);
  }
  panels.render();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Expose for debugging from the console.
(window as unknown as { aspereta: unknown }).aspereta = { get session() { return session; }, assets };
