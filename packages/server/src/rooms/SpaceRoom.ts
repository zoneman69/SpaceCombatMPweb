import Colyseus from "colyseus";
import { createRequire } from "module";
import { nanoid } from "nanoid";
import type { Command, ShipStats } from "@space-combat/shared";
import {
  BaseSchema,
  LobbyPlayerSchema,
  LobbyRoomSchema,
  ResourceNodeSchema,
  SpaceState,
  UnitSchema,
} from "@space-combat/shared";
import { simulate } from "../sim/simulate.js";

const DEFAULT_STATS: ShipStats = {
  maxAccel: 8,
  maxSpeed: 12,
  maxTurnRate: Math.PI * 0.9,
  linearDamp: 0.6,
  arrivalRadius: 1.5,
  weaponRange: 10,
  weaponCooldown: 1.2,
  weaponDamage: 10,
};

const TICK_RATE = 20;
const DEFAULT_SQUAD_SIZE = 4;
const require = createRequire(import.meta.url);
const colyseusPkg = require("colyseus/package.json");

export class SpaceRoom extends Colyseus.Room<SpaceState> {
  private readonly stats = DEFAULT_STATS;
  private readonly playerNames = new Map<string, string>();
  private readonly playerRoomIds = new Map<string, string>();

  onCreate() {
    this.setState(new SpaceState());
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / TICK_RATE);
    console.log("[lobby] space room created", {
      colyseus: colyseusPkg.version,
    });

    this.onMessage("command", (client, message: Command) => {
      this.handleCommand(client, message);
    });

    this.onMessage("lobby:ensureUnits", (client) => {
      this.ensureUnitsForClient(client.sessionId);
    });

    this.onMessage("lobby:ensureWorld", (client) => {
      this.ensureResourceNodes();
      this.ensureBaseForClient(client.sessionId);
      this.ensureUnitsForClient(client.sessionId);
    });

    this.onMessage("debug:dumpUnits", (client) => {
      const summary = Array.from(this.state.units.values()).map((unit) => ({
        id: unit.id,
        owner: unit.owner,
        x: unit.x,
        z: unit.z,
      }));
      client.send("debug:units", {
        unitCount: summary.length,
        units: summary,
      });
    });

    this.onMessage("lobby:setName", (client, name: string) => {
      console.log("[lobby] setName", {
        sessionId: client.sessionId,
        name,
      });
      if (typeof name !== "string" || name.trim().length === 0) {
        return;
      }
      this.playerNames.set(client.sessionId, name.trim());
      const roomId = this.playerRoomIds.get(client.sessionId);
      if (roomId) {
        const room = this.state.lobbyRooms.get(roomId);
        const player = room?.players.get(client.sessionId);
        if (player) {
          player.name = name.trim();
        }
        if (room && room.hostId === client.sessionId) {
          room.hostName = name.trim();
        }
      }
    });

    this.onMessage(
      "lobby:createRoom",
      (client, payload: { name?: string; mode?: string }) => {
        console.log("[lobby] createRoom", {
          sessionId: client.sessionId,
          payload,
        });
        this.removePlayerFromLobbyRoom(client.sessionId);
        const room = new LobbyRoomSchema();
        room.id = nanoid();
        room.name = payload?.name?.trim() || "Frontier Skirmish";
        room.mode = payload?.mode?.trim() || "Squad Skirmish";
        room.hostId = client.sessionId;
        room.hostName = this.getPlayerName(client.sessionId);
        this.state.lobbyRooms.set(room.id, room);
        this.addPlayerToLobbyRoom(room, client.sessionId);
        this.emitLobbyRooms();
      },
    );

    this.onMessage(
      "lobby:joinRoom",
      (client, payload: { roomId?: string }) => {
        console.log("[lobby] joinRoom", {
          sessionId: client.sessionId,
          payload,
        });
        const roomId = payload?.roomId;
        if (!roomId) {
          return;
        }
        const room = this.state.lobbyRooms.get(roomId);
        if (!room) {
          return;
        }
        this.removePlayerFromLobbyRoom(client.sessionId);
        this.addPlayerToLobbyRoom(room, client.sessionId);
        this.emitLobbyRooms();
      },
    );

    this.onMessage("lobby:toggleReady", (client) => {
      console.log("[lobby] toggleReady", { sessionId: client.sessionId });
      const roomId = this.playerRoomIds.get(client.sessionId);
      if (!roomId) {
        return;
      }
      const room = this.state.lobbyRooms.get(roomId);
      const player = room?.players.get(client.sessionId);
      if (player) {
        player.ready = !player.ready;
        this.emitLobbyRooms();
      }
    });

    this.ensureResourceNodes();
  }

  onJoin(client: Colyseus.Client) {
    console.log("[lobby] client joined space", {
      sessionId: client.sessionId,
    });
    this.playerNames.set(client.sessionId, this.getPlayerName(client.sessionId));
    this.emitLobbyRooms(client);
    this.ensureResourceNodes();
    this.ensureBaseForClient(client.sessionId);
    this.ensureUnitsForClient(client.sessionId);
  }

  onLeave(client: Colyseus.Client) {
    console.log("[lobby] client left space", {
      sessionId: client.sessionId,
    });
    this.removePlayerFromLobbyRoom(client.sessionId);
    this.emitLobbyRooms();
    this.playerNames.delete(client.sessionId);
    for (const [id, unit] of this.state.units.entries()) {
      if (unit.owner === client.sessionId) {
        this.state.units.delete(id);
      }
    }
    for (const [id, base] of this.state.bases.entries()) {
      if (base.owner === client.sessionId) {
        this.state.bases.delete(id);
      }
    }
  }

  private tick(dtMs: number) {
    const dt = dtMs / 1000;
    this.ensureUnitsForAllClients();
    this.ensureBasesForAllClients();
    this.ensureResourceNodes();
    this.assignCollectorsToResources();
    simulate({ units: this.state.units, stats: this.stats, dt });
  }

  private assignCollectorsToResources() {
    if (this.state.resources.size === 0) {
      return;
    }
    const resources = Array.from(this.state.resources.values());
    for (const unit of this.state.units.values()) {
      if (unit.unitType !== "RESOURCE_COLLECTOR") {
        continue;
      }
      if (unit.orderType !== "STOP") {
        continue;
      }
      const target = resources.reduce((closest, resource) => {
        if (!closest) {
          return resource;
        }
        const currentDistance = Math.hypot(
          unit.x - resource.x,
          unit.z - resource.z,
        );
        const closestDistance = Math.hypot(
          unit.x - closest.x,
          unit.z - closest.z,
        );
        return currentDistance < closestDistance ? resource : closest;
      }, null as ResourceNodeSchema | null);
      if (!target) {
        continue;
      }
      unit.orderType = "MOVE";
      unit.orderX = target.x;
      unit.orderZ = target.z;
      unit.orderTargetId = "";
    }
  }

  private handleCommand(client: Colyseus.Client, command: Command) {
    const units = this.getClientUnits(client.sessionId, command.unitIds);
    let targetUnits = units;
    if (targetUnits.length === 0) {
      targetUnits = this.getAllUnitsForClient(client.sessionId);
    }
    if (targetUnits.length === 0) {
      this.ensureUnitsForClient(client.sessionId);
      this.ensureBaseForClient(client.sessionId);
      this.ensureResourceNodes();
    }
    switch (command.t) {
      case "MOVE":
        targetUnits.forEach((unit) => {
          unit.orderType = "MOVE";
          unit.orderX = command.x;
          unit.orderZ = command.z;
          unit.orderTargetId = "";
        });
        break;
      case "ATTACK":
        targetUnits.forEach((unit) => {
          unit.orderType = "ATTACK";
          unit.orderTargetId = command.targetId;
        });
        break;
      case "ATTACK_MOVE":
        targetUnits.forEach((unit) => {
          unit.orderType = "ATTACK_MOVE";
          unit.orderX = command.x;
          unit.orderZ = command.z;
          unit.orderTargetId = "";
        });
        break;
      case "HOLD":
        targetUnits.forEach((unit) => {
          unit.orderType = "HOLD";
          unit.orderTargetId = "";
        });
        break;
      case "STOP":
        targetUnits.forEach((unit) => {
          unit.orderType = "STOP";
          unit.orderTargetId = "";
          unit.vx = 0;
          unit.vz = 0;
        });
        break;
      default:
        break;
    }
  }

  private getClientUnits(ownerId: string, unitIds: string[]) {
    const result: UnitSchema[] = [];
    unitIds.forEach((id) => {
      const unit = this.state.units.get(id);
      if (unit && unit.owner === ownerId) {
        result.push(unit);
      }
    });
    return result;
  }

  private getAllUnitsForClient(ownerId: string) {
    const result: UnitSchema[] = [];
    for (const unit of this.state.units.values()) {
      if (unit.owner === ownerId) {
        result.push(unit);
      }
    }
    return result;
  }

  private addPlayerToLobbyRoom(room: LobbyRoomSchema, sessionId: string) {
    const player = new LobbyPlayerSchema();
    player.id = sessionId;
    player.name = this.getPlayerName(sessionId);
    player.ready = false;
    room.players.set(sessionId, player);
    this.playerRoomIds.set(sessionId, room.id);
  }

  private ensureBaseForClient(sessionId: string) {
    let hasBase = false;
    for (const base of this.state.bases.values()) {
      if (base.owner === sessionId) {
        hasBase = true;
        break;
      }
    }
    if (hasBase) {
      return;
    }
    const base = new BaseSchema();
    base.id = nanoid();
    base.owner = sessionId;
    const spawnOffset = this.clients.length * 6;
    base.x = spawnOffset;
    base.z = spawnOffset - 12;
    this.state.bases.set(base.id, base);
  }

  private ensureBasesForAllClients() {
    if (this.clients.length === 0) {
      return;
    }
    const owners = new Set<string>();
    for (const base of this.state.bases.values()) {
      owners.add(base.owner);
    }
    this.clients.forEach((client) => {
      if (!owners.has(client.sessionId)) {
        this.ensureBaseForClient(client.sessionId);
      }
    });
  }

  private ensureResourceNodes() {
    if (this.state.resources.size > 0) {
      return;
    }
    const nodes = [
      { x: -24, z: -10 },
      { x: 0, z: 26 },
      { x: 24, z: -8 },
      { x: -36, z: 24 },
      { x: 36, z: 22 },
    ];
    nodes.forEach((node) => {
      const resource = new ResourceNodeSchema();
      resource.id = nanoid();
      resource.x = node.x;
      resource.z = node.z;
      this.state.resources.set(resource.id, resource);
    });
  }

  private ensureUnitsForClient(sessionId: string) {
    let unitCount = 0;
    for (const unit of this.state.units.values()) {
      if (unit.owner === sessionId) {
        unitCount += 1;
      }
    }
    if (unitCount >= DEFAULT_SQUAD_SIZE) {
      console.log("[lobby] ensureUnits skipped (already has units)", {
        sessionId,
        units: this.state.units.size,
      });
      return;
    }
    console.log("[lobby] spawning units", { sessionId });
    const spawnOffset = this.clients.length * 6;
    for (let i = unitCount; i < DEFAULT_SQUAD_SIZE; i += 1) {
      const unit = new UnitSchema();
      unit.id = nanoid();
      unit.owner = sessionId;
      unit.unitType = "RESOURCE_COLLECTOR";
      unit.x = spawnOffset + i * 2;
      unit.z = spawnOffset;
      this.state.units.set(unit.id, unit);
    }
  }

  private ensureUnitsForAllClients() {
    if (this.clients.length === 0) {
      return;
    }
    const owners = new Set<string>();
    for (const unit of this.state.units.values()) {
      owners.add(unit.owner);
    }
    this.clients.forEach((client) => {
      if (!owners.has(client.sessionId)) {
        this.ensureUnitsForClient(client.sessionId);
      }
    });
  }

  private removePlayerFromLobbyRoom(sessionId: string) {
    const roomId = this.playerRoomIds.get(sessionId);
    if (!roomId) {
      return;
    }
    const room = this.state.lobbyRooms.get(roomId);
    if (!room) {
      this.playerRoomIds.delete(sessionId);
      return;
    }
    room.players.delete(sessionId);
    this.playerRoomIds.delete(sessionId);
    if (room.players.size === 0) {
      this.state.lobbyRooms.delete(roomId);
      return;
    }
    if (room.hostId === sessionId) {
      const [nextHost] = Array.from(
        room.players.values(),
      ) as LobbyPlayerSchema[];
      if (nextHost) {
        room.hostId = nextHost.id;
        room.hostName = nextHost.name;
      }
    }
  }

  private getPlayerName(sessionId: string) {
    return this.playerNames.get(sessionId) ?? `Pilot-${sessionId.slice(0, 4)}`;
  }

  private emitLobbyRooms(target?: Colyseus.Client) {
    const payload = Array.from(this.state.lobbyRooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      mode: room.mode,
      host: room.hostName,
      players: Array.from(room.players.values()).map((player) => ({
        id: player.id,
        name: player.name,
        ready: player.ready,
      })),
    }));
    if (target) {
      target.send("lobby:rooms", payload);
      return;
    }
    this.broadcast("lobby:rooms", payload);
  }
}
