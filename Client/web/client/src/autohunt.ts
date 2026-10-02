// Auto-hunt button state, mirrored from the server's own messages exactly like the desktop
// client's AutoHuntTracker. The server owns auto-hunt; we only send the existing
// /autohunt commands and display what the server says.

export type AutoHuntState = "off" | "on" | "paused";

const PENDING_MS = 3000;

export class AutoHuntTracker {
  state: AutoHuntState = "off";
  private pendingUntil = 0;

  get pending(): boolean {
    return performance.now() < this.pendingUntil;
  }

  /** Returns true when the message changed (or settled) the state. */
  onServerMessage(message: string): boolean {
    const starts = (...prefixes: string[]) => prefixes.some((p) => message.startsWith(p));
    if (starts("Auto-hunt started.", "Auto-hunt resumed.", "Auto-hunt is already running.")) return this.set("on");
    if (starts("Auto-hunt paused.", "Auto-hunt is already paused.")) return this.set("paused");
    if (starts("Auto-hunt stopped:", "Auto-hunt is not running.", "Auto-hunt is disabled")) return this.set("off");
    if (message.toLowerCase().includes("auto-hunt")) {
      this.pendingUntil = 0;
      return true;
    }
    return false;
  }

  /** The command for a left click: on -> pause, otherwise start/resume. */
  next(): string {
    this.pendingUntil = performance.now() + PENDING_MS;
    return this.state === "on" ? "/autohunt pause" : "/autohunt on";
  }

  off(): string {
    this.pendingUntil = performance.now() + PENDING_MS;
    return "/autohunt off";
  }

  reset(): void {
    this.state = "off";
    this.pendingUntil = 0;
  }

  private set(state: AutoHuntState): boolean {
    this.state = state;
    this.pendingUntil = 0;
    return true;
  }
}
