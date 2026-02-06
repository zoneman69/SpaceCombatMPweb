import { Client } from "colyseus.js";

export const WS_URL =
  import.meta.env.VITE_WS_URL ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`;

export const colyseus = new Client(WS_URL);

