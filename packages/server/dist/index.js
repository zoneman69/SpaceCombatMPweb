import http from "http";
import express from "express";
import Colyseus from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { SpaceRoom } from "./rooms/SpaceRoom.js";
const port = Number(process.env.PORT ?? 2567);
const app = express();
app.get("/", (_req, res) => {
    res.send("Space Combat server running");
});
const server = http.createServer(app);
const { Server } = Colyseus;
const gameServer = new Server({
    transport: new WebSocketTransport({ server }),
});
gameServer.define("space", SpaceRoom);
gameServer.listen(port);
console.log(`Space Combat server listening on ws://localhost:${port}`);
