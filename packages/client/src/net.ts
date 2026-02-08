import { Client, Room } from "colyseus.js";

const isHttps = location.protocol === "https:";

// Use nginx proxy path on the same domain (works for HTTPS + no extra ports)
const sameOriginWs = `${isHttps ? "wss" : "ws"}://${location.host}/spacews`;
const devWs = `${isHttps ? "wss" : "ws"}://${location.hostname}:2567`;

export const WS_URL =
  import.meta.env.VITE_WS_URL || (import.meta.env.DEV ? devWs : sameOriginWs);

class QuietRoom<T> extends Room<T> {
  constructor(name: string, rootSchema?: new () => T) {
    super(name, rootSchema);
    this.onError.clear();
    this.onError((code, message) => {
      const detail = `${message ?? ""}`;
      if (detail.includes("seat reservation expired")) {
        return;
      }
      console.warn(`colyseus.js - onError => (${code}) ${detail}`);
    });
  }
}

class QuietClient extends Client {
  createRoom<T>(roomName: string, rootSchema?: new () => T) {
    return new QuietRoom<T>(roomName, rootSchema);
  }
}

export const colyseus = new QuietClient(WS_URL);
