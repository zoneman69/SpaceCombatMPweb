import { Client } from "colyseus.js";

const isHttps = location.protocol === "https:";

// Use nginx proxy path on the same domain (works for HTTPS + no extra ports)
const sameOriginWs = `${isHttps ? "wss" : "ws"}://${location.host}/spacews`;

export const WS_URL = import.meta.env.VITE_WS_URL || sameOriginWs;

export const colyseus = new Client(WS_URL);
