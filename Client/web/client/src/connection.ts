// WebSocket transport. Carries the unchanged game protocol: every message we send is one
// packet plus the \x01 delimiter, exactly the bytes the desktop client writes to TCP, and
// received text is reassembled into packets the same way the desktop client does.

import { PACKET_DELIMITER, PacketBuffer } from "./protocol.js";

export type ConnectionState = "idle" | "connecting" | "open" | "closed";

export interface ConnectionEvents {
  onOpen(): void;
  onPacket(packet: string): void;
  onClose(reason: string, wasOpen: boolean): void;
}

export class Connection {
  private socket: WebSocket | null = null;
  private readonly buffer = new PacketBuffer();
  private closingOnPurpose = false;
  state: ConnectionState = "idle";

  constructor(private readonly events: ConnectionEvents) {}

  connect(url: string): void {
    this.disconnect();
    this.buffer.clear();
    this.closingOnPurpose = false;
    this.state = "connecting";

    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      this.state = "closed";
      this.events.onClose(`Invalid server address: ${url}`, false);
      return;
    }

    this.socket = socket;
    let wasOpen = false;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      wasOpen = true;
      this.state = "open";
      this.events.onOpen();
    };

    socket.onmessage = (ev) => {
      if (this.socket !== socket) return;
      const text = typeof ev.data === "string" ? ev.data : "";
      for (const packet of this.buffer.push(text)) this.events.onPacket(packet);
    };

    socket.onclose = (ev) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.state = "closed";
      if (this.closingOnPurpose) return;
      const reason = wasOpen
        ? `Connection to the server was lost${ev.code ? ` (code ${ev.code})` : ""}.`
        : "Could not connect to the server. Is it running with WebSocket support enabled?";
      this.events.onClose(reason, wasOpen);
    };

    // onerror is always followed by onclose, which reports it.
    socket.onerror = () => {};
  }

  send(packet: string): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(packet + PACKET_DELIMITER);
  }

  /** Closes without raising onClose (logout / reconnect). */
  disconnect(): void {
    if (!this.socket) return;
    this.closingOnPurpose = true;
    const socket = this.socket;
    this.socket = null;
    this.state = "closed";
    try {
      socket.close(1000, "client closed");
    } catch {
      // already closing
    }
  }
}
