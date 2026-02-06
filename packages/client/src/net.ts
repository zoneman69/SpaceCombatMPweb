import { Client } from "colyseus.js";

const isProd = import.meta.env.PROD;

// Prod: same origin websocket via nginx (/spacews)
// Dev: direct to :2567 on the same host
const autoWs = isProd
  ? `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/spacews`
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;

export const WS_URL = import.meta.env.VITE_WS_URL || autoWs;

export const colyseus = new Client(WS_URL);
