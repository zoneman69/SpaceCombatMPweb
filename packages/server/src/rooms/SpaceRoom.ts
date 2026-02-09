import Colyseus from "colyseus";
import { createRequire } from "module";
import { nanoid } from "nanoid";
import type { Command, ShipStats, UnitType } from "@space-combat/shared";
import {
  BaseSchema,
  BaseModuleSchema,
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

const UNIT_STATS: Record<UnitType, ShipStats> = {
  RESOURCE_COLLECTOR: DEFAULT_STATS,
  FIGHTER: {
    ...DEFAULT_STATS,
    maxSpeed: 14,
    weaponDamage: 4,
  },
};

const WEAPON_STATS: Record<string, Pick<ShipStats, "weaponRange" | "weaponDamage">> =
  {
    LASER: { weaponRange: 12, weaponDamage: 8 },
    PLASMA: { weaponRange: 9, weaponDamage: 12 },
    RAIL: { weaponRange: 16, weaponDamage: 6 },
  };

const TICK_RATE = 20;
const BASE_STARTING_RESOURCES = 100;
const BASE_STARTING_HULL = 400;
const BASE_STARTING_SHIELDS = 200;
const RESOURCE_COLLECTOR_COST = 100;
const FIGHTER_COST = 150;
const UNIT_WEAPON_MOUNT_COST = 80;
const MODULE_TECH_SHOP_COST = 240;
const MODULE_REPAIR_BAY_COST = 200;
const MODULE_GARAGE_COST = 260;
const MODULE_WEAPON_TURRET_COST = 140;
const MAX_UNIT_WEAPON_MOUNTS = 3;
const MODULE_INTERACTION_RANGE = 6;
const REPAIR_BAY_RANGE = 5;
const REPAIR_HULL_RATE = 18;
const REPAIR_SHIELD_RATE = 26;
const WEAPON_TURRET_RING_COUNT = 8;
const WEAPON_TURRET_RING_RADIUS = 18;
const RESOURCE_HARVEST_RANGE = 4;
const RESOURCE_COLLECTOR_CAPACITY = 25;
const RESOURCE_DROPOFF_RANGE = 6;
const RESOURCE_HARVEST_WAIT = 2;
const RESOURCE_DROPOFF_WAIT = 2;
const RESOURCE_DROPOFF_SPOT_OFFSET = 8;
const RESOURCE_NODE_MIN_AMOUNT = 120;
const RESOURCE_NODE_MAX_AMOUNT = 420;
const BASE_SPAWN_RADIUS = 260;
const MAP_RESOURCE_SPACING = 80;
const MAP_RESOURCE_RADIUS = 320;

const UNIT_CONFIG: Record<
  UnitType,
  {
    cost: number;
    cargoCapacity: number;
    weaponMounts: number;
    techMounts: number;
    shieldCapacity: number;
  }
> = {
  RESOURCE_COLLECTOR: {
    cost: RESOURCE_COLLECTOR_COST,
    cargoCapacity: RESOURCE_COLLECTOR_CAPACITY,
    weaponMounts: 0,
    techMounts: 0,
    shieldCapacity: 40,
  },
  FIGHTER: {
    cost: FIGHTER_COST,
    cargoCapacity: 0,
    weaponMounts: 1,
    techMounts: 1,
    shieldCapacity: 75,
  },
};
const require = createRequire(import.meta.url);
const colyseusPkg = require("colyseus/package.json");

export class SpaceRoom extends Colyseus.Room<SpaceState> {
  private readonly stats = UNIT_STATS;
  private readonly unitConfig = UNIT_CONFIG;
  private readonly playerNames = new Map<string, string>();
  private readonly playerRoomIds = new Map<string, string>();
  private readonly baseDropoffLocks = new Map<string, string>();
  private baseSpawnIndex = 0;
  private readonly eliminatedOwners = new Set<string>();

  onCreate() {
    this.setState(new SpaceState());
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / TICK_RATE);
    console.log("[lobby] space room created", {
      colyseus: colyseusPkg.version,
    });

    this.onMessage("command", (client, message: Command) => {
      this.handleCommand(client, message);
    });

    this.onMessage("lobby:ensureWorld", (client) => {
      console.log("[lobby] ensureWorld requested", {
        sessionId: client.sessionId,
      });
      this.ensureResourceNodes();
      this.ensureBaseForClient(client.sessionId);
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

    this.onMessage(
      "base:build",
      (
        client,
        payload: { baseId?: string; unitType?: UnitSchema["unitType"] },
      ) => {
        this.handleBuildRequest(client, payload);
      },
    );

    this.onMessage(
      "base:purchaseModule",
      (
        client,
        payload: {
          baseId?: string;
          moduleType?: string;
          weaponType?: string;
        },
      ) => {
        this.handleModulePurchase(client, payload);
      },
    );

    this.onMessage(
      "module:visit",
      (client, payload: { moduleId?: string; unitIds?: string[] }) => {
        this.handleModuleVisit(client, payload);
      },
    );

    this.onMessage(
      "module:garageWeapon",
      (
        client,
        payload: { moduleId?: string; unitId?: string; weaponType?: string },
      ) => {
        this.handleGarageWeaponUpgrade(client, payload);
      },
    );

    this.onMessage(
      "module:techUpgrade",
      (
        client,
        payload: { moduleId?: string; unitId?: string; upgradeType?: string },
      ) => {
        this.handleTechUpgrade(client, payload);
      },
    );

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
        console.log("[lobby] createRoom complete", {
          roomId: room.id,
          hostId: room.hostId,
          players: room.players.size,
        });
        client.send("lobby:joinedRoom", { roomId: room.id });
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
        console.log("[lobby] joinRoom complete", {
          roomId: room.id,
          sessionId: client.sessionId,
          players: room.players.size,
        });
        client.send("lobby:joinedRoom", { roomId: room.id });
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
    console.log("[lobby] join world state", {
      sessionId: client.sessionId,
      bases: this.state.bases.size,
      resources: this.state.resources.size,
      units: this.state.units.size,
    });
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
    for (const [id, module] of this.state.modules.entries()) {
      if (module.owner === client.sessionId) {
        this.state.modules.delete(id);
      }
    }
  }

  private getUnitStats(unit: UnitSchema): ShipStats {
    const baseStats = this.stats[unit.unitType] ?? DEFAULT_STATS;
    const weaponStats = WEAPON_STATS[unit.weaponType] ?? WEAPON_STATS.LASER;
    return {
      ...baseStats,
      maxSpeed: baseStats.maxSpeed + Math.max(0, unit.speedBonus ?? 0),
      weaponRange: weaponStats.weaponRange,
      weaponDamage:
        weaponStats.weaponDamage + Math.max(0, unit.weaponDamageBonus ?? 0),
    };
  }

  private tick(dtMs: number) {
    const dt = dtMs / 1000;
    this.ensureBasesForAllClients();
    this.ensureResourceNodes();
    this.advanceCollectorTimers(dt);
    simulate({
      units: this.state.units,
      bases: this.state.bases,
      modules: this.state.modules,
      getStats: (unit) => this.getUnitStats(unit),
      dt,
    });
    this.removeDestroyedUnits();
    this.removeDestroyedBases();
    this.processCollectorHarvesting();
    this.processRepairBays(dt);
  }

  private removeDestroyedUnits() {
    const destroyedIds = new Set<string>();
    for (const [id, unit] of this.state.units.entries()) {
      if (unit.hp <= 0) {
        destroyedIds.add(id);
      }
    }
    if (destroyedIds.size === 0) {
      return;
    }
    for (const unitId of destroyedIds) {
      this.state.units.delete(unitId);
    }
    for (const [baseId, lockedBy] of this.baseDropoffLocks.entries()) {
      if (destroyedIds.has(lockedBy)) {
        this.baseDropoffLocks.delete(baseId);
      }
    }
  }

  private removeDestroyedBases() {
    const destroyedIds = new Set<string>();
    for (const [id, base] of this.state.bases.entries()) {
      if (base.hp <= 0) {
        destroyedIds.add(id);
        this.eliminatedOwners.add(base.owner);
      }
    }
    if (destroyedIds.size === 0) {
      return;
    }
    for (const baseId of destroyedIds) {
      this.state.bases.delete(baseId);
      this.baseDropoffLocks.delete(baseId);
      for (const [moduleId, module] of this.state.modules.entries()) {
        if (module.baseId === baseId) {
          this.state.modules.delete(moduleId);
        }
      }
    }
  }

  private advanceCollectorTimers(dt: number) {
    for (const unit of this.state.units.values()) {
      if (unit.unitType !== "RESOURCE_COLLECTOR") {
        continue;
      }
      if (unit.harvestWaitLeft > 0) {
        unit.harvestWaitLeft = Math.max(0, unit.harvestWaitLeft - dt);
        if (unit.harvestWaitLeft === 0) {
          this.finishHarvest(unit);
        }
      }
      if (unit.dropoffWaitLeft > 0) {
        unit.dropoffWaitLeft = Math.max(0, unit.dropoffWaitLeft - dt);
        if (unit.dropoffWaitLeft === 0) {
          this.finishDropoff(unit);
        }
      }
    }
  }

  private finishHarvest(unit: UnitSchema) {
    const resourceId = unit.harvestTargetId || unit.orderTargetId;
    const resource = this.state.resources.get(resourceId);
    if (!resource) {
      unit.orderType = "STOP";
      unit.orderTargetId = "";
      unit.harvestTargetId = "";
      return;
    }
    const available = unit.cargoCapacity - unit.cargo;
    if (available <= 0) {
      this.sendCollectorToBase(unit);
      return;
    }
    const harvested = Math.min(resource.amount, available);
    if (harvested <= 0) {
      unit.orderType = "STOP";
      unit.orderTargetId = "";
      unit.harvestTargetId = "";
      return;
    }
    resource.amount -= harvested;
    unit.cargo += harvested;
    if (resource.amount <= 0) {
      this.state.resources.delete(resource.id);
    }
    this.sendCollectorToBase(unit);
  }

  private finishDropoff(unit: UnitSchema) {
    const base =
      this.state.bases.get(unit.orderTargetId) ??
      this.getClosestBaseForOwner(unit.owner, unit.x, unit.z);
    if (!base) {
      unit.orderType = "STOP";
      unit.orderTargetId = "";
      this.baseDropoffLocks.delete(unit.orderTargetId);
      return;
    }
    if (unit.cargo > 0) {
      base.resourceStock += unit.cargo;
      unit.cargo = 0;
    }
    this.baseDropoffLocks.delete(base.id);
    if (unit.harvestTargetId) {
      const resource = this.state.resources.get(unit.harvestTargetId);
      if (resource && resource.amount > 0) {
        unit.orderType = "HARVEST";
        unit.orderTargetId = resource.id;
        unit.orderX = resource.x;
        unit.orderZ = resource.z;
        return;
      }
      unit.harvestTargetId = "";
    }
    unit.orderType = "STOP";
    unit.orderTargetId = "";
  }

  private processCollectorHarvesting() {
    if (this.state.bases.size === 0) {
      return;
    }
    for (const unit of this.state.units.values()) {
      if (unit.unitType !== "RESOURCE_COLLECTOR") {
        continue;
      }
      if (unit.dropoffWaitLeft > 0) {
        continue;
      }
      if (unit.orderType === "RETURN") {
        this.processCollectorReturn(unit);
        continue;
      }
      if (unit.orderType !== "HARVEST") {
        continue;
      }
      const resourceId = unit.harvestTargetId || unit.orderTargetId;
      const resource = this.state.resources.get(resourceId);
      if (!resource) {
        if (unit.cargo > 0) {
          this.sendCollectorToBase(unit);
        } else {
          unit.orderType = "STOP";
          unit.orderTargetId = "";
          unit.harvestTargetId = "";
        }
        continue;
      }
      unit.harvestTargetId = resource.id;
      unit.orderX = resource.x;
      unit.orderZ = resource.z;
      const distance = Math.hypot(unit.x - resource.x, unit.z - resource.z);
      if (distance > RESOURCE_HARVEST_RANGE) {
        continue;
      }
      if (unit.harvestWaitLeft <= 0) {
        unit.harvestWaitLeft = RESOURCE_HARVEST_WAIT;
        unit.vx = 0;
        unit.vz = 0;
      }
    }
  }

  private processCollectorReturn(unit: UnitSchema) {
    const base =
      this.state.bases.get(unit.orderTargetId) ??
      this.getClosestBaseForOwner(unit.owner, unit.x, unit.z);
    if (!base) {
      unit.orderType = "STOP";
      unit.orderTargetId = "";
      return;
    }
    const dropoffSpot = this.getBaseDropoffSpot(base);
    unit.orderX = dropoffSpot.x;
    unit.orderZ = dropoffSpot.z;
    const distance = Math.hypot(unit.x - dropoffSpot.x, unit.z - dropoffSpot.z);
    if (distance > RESOURCE_DROPOFF_RANGE) {
      return;
    }
    const lockedBy = this.baseDropoffLocks.get(base.id);
    if (lockedBy && lockedBy !== unit.id) {
      unit.vx = 0;
      unit.vz = 0;
      return;
    }
    if (!lockedBy) {
      this.baseDropoffLocks.set(base.id, unit.id);
    }
    if (unit.dropoffWaitLeft <= 0) {
      unit.dropoffWaitLeft = RESOURCE_DROPOFF_WAIT;
      unit.vx = 0;
      unit.vz = 0;
    }
  }

  private sendCollectorToBase(unit: UnitSchema) {
    const base = this.getClosestBaseForOwner(unit.owner, unit.x, unit.z);
    if (!base) {
      unit.orderType = "STOP";
      unit.orderTargetId = "";
      return;
    }
    const dropoffSpot = this.getBaseDropoffSpot(base);
    unit.orderType = "RETURN";
    unit.orderTargetId = base.id;
    unit.orderX = dropoffSpot.x;
    unit.orderZ = dropoffSpot.z;
  }

  private getBaseDropoffSpot(base: BaseSchema) {
    return {
      x: base.x + RESOURCE_DROPOFF_SPOT_OFFSET,
      z: base.z,
    };
  }

  private handleCommand(client: Colyseus.Client, command: Command) {
    const units = this.getClientUnits(client.sessionId, command.unitIds);
    let targetUnits = units;
    if (targetUnits.length === 0) {
      targetUnits = this.getAllUnitsForClient(client.sessionId);
    }
    if (targetUnits.length === 0) {
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
      case "HARVEST": {
        const resource = this.state.resources.get(command.resourceId);
        console.log("[lobby] harvest command", {
          sessionId: client.sessionId,
          unitIds: command.unitIds,
          resourceId: command.resourceId,
          resourceFound: !!resource,
          targetUnitCount: targetUnits.length,
        });
        targetUnits.forEach((unit) => {
          if (unit.unitType !== "RESOURCE_COLLECTOR") {
            console.log("[lobby] harvest rejected (not collector)", {
              unitId: unit.id,
              unitType: unit.unitType,
              orderType: unit.orderType,
            });
            return;
          }
          if (!resource) {
            unit.orderType = "STOP";
            unit.orderTargetId = "";
            unit.harvestTargetId = "";
            console.log("[lobby] harvest rejected (missing resource)", {
              unitId: unit.id,
              resourceId: command.resourceId,
              orderType: unit.orderType,
            });
            return;
          }
          unit.orderType = "HARVEST";
          unit.orderTargetId = resource.id;
          unit.harvestTargetId = resource.id;
          unit.orderX = resource.x;
          unit.orderZ = resource.z;
          console.log("[lobby] harvest accepted", {
            unitId: unit.id,
            resourceId: resource.id,
            resourceX: resource.x,
            resourceZ: resource.z,
            orderType: unit.orderType,
          });
        });
        break;
      }
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

  private getClosestBaseForOwner(ownerId: string, unitX: number, unitZ: number) {
    let closest: BaseSchema | null = null;
    for (const base of this.state.bases.values()) {
      if (base.owner !== ownerId) {
        continue;
      }
      if (!closest) {
        closest = base;
        continue;
      }
      const currentDistance = Math.hypot(base.x - unitX, base.z - unitZ);
      const closestDistance = Math.hypot(
        closest.x - unitX,
        closest.z - unitZ,
      );
      if (currentDistance < closestDistance) {
        closest = base;
      }
    }
    return closest;
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
    if (this.eliminatedOwners.has(sessionId)) {
      return;
    }
    let hasBase = false;
    for (const base of this.state.bases.values()) {
      if (base.owner === sessionId) {
        hasBase = true;
        break;
      }
    }
    if (hasBase) {
      console.log("[lobby] ensureBase skipped (already has base)", {
        sessionId,
      });
      return;
    }
    const base = new BaseSchema();
    base.id = nanoid();
    base.owner = sessionId;
    const spawnIndex = this.baseSpawnIndex;
    this.baseSpawnIndex += 1;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const angle = spawnIndex * goldenAngle;
    base.x = Math.cos(angle) * BASE_SPAWN_RADIUS;
    base.z = Math.sin(angle) * BASE_SPAWN_RADIUS;
    base.hp = BASE_STARTING_HULL;
    base.shields = BASE_STARTING_SHIELDS;
    base.maxShields = BASE_STARTING_SHIELDS;
    base.weaponMounts = 0;
    base.weaponCooldownLeft = 0;
    base.resourceStock = BASE_STARTING_RESOURCES;
    this.state.bases.set(base.id, base);
    console.log("[lobby] base spawned", {
      sessionId,
      baseId: base.id,
      x: base.x,
      z: base.z,
      resources: base.resourceStock,
    });
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
      if (this.eliminatedOwners.has(client.sessionId)) {
        return;
      }
      if (!owners.has(client.sessionId)) {
        this.ensureBaseForClient(client.sessionId);
      }
    });
  }

  private ensureResourceNodes() {
    if (this.state.resources.size > 0) {
      console.log("[lobby] resource nodes already seeded", {
        count: this.state.resources.size,
      });
      return;
    }
    let seeded = 0;
    for (
      let x = -MAP_RESOURCE_RADIUS;
      x <= MAP_RESOURCE_RADIUS;
      x += MAP_RESOURCE_SPACING
    ) {
      for (
        let z = -MAP_RESOURCE_RADIUS;
        z <= MAP_RESOURCE_RADIUS;
        z += MAP_RESOURCE_SPACING
      ) {
        const radius = Math.hypot(x, z);
        if (radius < MAP_RESOURCE_SPACING * 0.6) {
          continue;
        }
        const resource = new ResourceNodeSchema();
        resource.id = nanoid();
        resource.x = x;
        resource.z = z;
        resource.amount =
          RESOURCE_NODE_MIN_AMOUNT +
          Math.random() * (RESOURCE_NODE_MAX_AMOUNT - RESOURCE_NODE_MIN_AMOUNT);
        resource.maxAmount = resource.amount;
        this.state.resources.set(resource.id, resource);
        seeded += 1;
      }
    }
    console.log("[lobby] resource nodes seeded", { count: seeded });
  }

  private handleBuildRequest(
    client: Colyseus.Client,
    payload: { baseId?: string; unitType?: UnitSchema["unitType"] },
  ) {
    console.log("[lobby] build request", {
      sessionId: client.sessionId,
      payload,
    });
    const unitType = payload?.unitType ?? null;
    const config = unitType ? this.unitConfig[unitType] : null;
    if (!payload?.baseId || !unitType || !config) {
      console.log("[lobby] build rejected (invalid payload)", {
        sessionId: client.sessionId,
        payload,
      });
      return;
    }
    const base = this.state.bases.get(payload.baseId);
    if (!base || base.owner !== client.sessionId) {
      console.log("[lobby] build rejected (invalid base)", {
        sessionId: client.sessionId,
        baseId: payload.baseId,
      });
      return;
    }
    if (base.resourceStock < config.cost) {
      console.log("[lobby] build rejected (insufficient resources)", {
        sessionId: client.sessionId,
        baseId: base.id,
        resources: base.resourceStock,
        cost: config.cost,
      });
      return;
    }
    base.resourceStock -= config.cost;
    const unit = new UnitSchema();
    unit.id = nanoid();
    unit.owner = client.sessionId;
    unit.unitType = unitType;
    unit.weaponType = "LASER";
    unit.cargo = 0;
    unit.cargoCapacity = config.cargoCapacity;
    unit.weaponMounts = config.weaponMounts;
    unit.techMounts = config.techMounts;
    unit.maxHp = 100;
    unit.hp = unit.maxHp;
    unit.shields = config.shieldCapacity;
    unit.maxShields = config.shieldCapacity;
    unit.speedBonus = 0;
    unit.radarRangeBonus = 0;
    unit.weaponDamageBonus = 0;
    unit.x = base.x + 6;
    unit.z = base.z + 6;
    this.state.units.set(unit.id, unit);
    console.log("[lobby] build success", {
      sessionId: client.sessionId,
      unitId: unit.id,
      baseId: base.id,
      unitType,
      remaining: base.resourceStock,
    });
  }

  private handleModulePurchase(
    client: Colyseus.Client,
    payload: { baseId?: string; moduleType?: string; weaponType?: string },
  ) {
    console.log("[lobby] module purchase request", {
      sessionId: client.sessionId,
      payload,
    });
    const baseId = payload?.baseId;
    const moduleType = payload?.moduleType ?? "";
    if (!baseId || !moduleType) {
      console.log("[lobby] module purchase rejected (invalid payload)", {
        sessionId: client.sessionId,
        payload,
      });
      return;
    }
    const base = this.state.bases.get(baseId);
    if (!base || base.owner !== client.sessionId) {
      console.log("[lobby] module purchase rejected (invalid base)", {
        sessionId: client.sessionId,
        baseId,
      });
      return;
    }
    const moduleCost = this.getModuleCost(moduleType);
    if (moduleCost <= 0) {
      console.log("[lobby] module purchase rejected (unknown type)", {
        sessionId: client.sessionId,
        moduleType,
      });
      return;
    }
    if (base.resourceStock < moduleCost) {
      console.log("[lobby] module purchase rejected (insufficient resources)", {
        sessionId: client.sessionId,
        baseId,
        resources: base.resourceStock,
        cost: moduleCost,
      });
      return;
    }
    if (moduleType !== "WEAPON_TURRET") {
      const existing = this.findModuleByType(baseId, moduleType);
      if (existing) {
        console.log("[lobby] module purchase rejected (already exists)", {
          sessionId: client.sessionId,
          baseId,
          moduleType,
        });
        return;
      }
    } else if (!payload?.weaponType || !WEAPON_STATS[payload.weaponType]) {
      console.log("[lobby] module purchase rejected (missing weapon type)", {
        sessionId: client.sessionId,
        baseId,
      });
      return;
    }
    const position = this.getModuleSpawnPosition(base, moduleType);
    if (!position) {
      console.log("[lobby] module purchase rejected (no slot)", {
        sessionId: client.sessionId,
        baseId,
        moduleType,
      });
      return;
    }
    const module = new BaseModuleSchema();
    module.id = nanoid();
    module.owner = client.sessionId;
    module.baseId = baseId;
    module.moduleType = moduleType;
    module.weaponType =
      moduleType === "WEAPON_TURRET" ? payload?.weaponType ?? "LASER" : "";
    module.x = position.x;
    module.z = position.z;
    module.weaponCooldownLeft = 0;
    module.active = true;
    base.resourceStock -= moduleCost;
    this.state.modules.set(module.id, module);
    console.log("[lobby] module purchase success", {
      sessionId: client.sessionId,
      baseId,
      moduleId: module.id,
      moduleType,
      remaining: base.resourceStock,
    });
  }

  private handleModuleVisit(
    client: Colyseus.Client,
    payload: { moduleId?: string; unitIds?: string[] },
  ) {
    const moduleId = payload?.moduleId;
    const unitIds = payload?.unitIds ?? [];
    if (!moduleId || unitIds.length === 0) {
      return;
    }
    const module = this.state.modules.get(moduleId);
    if (!module || module.owner !== client.sessionId) {
      return;
    }
    const units = this.getClientUnits(client.sessionId, unitIds);
    units.forEach((unit) => {
      unit.orderType = "MOVE";
      unit.orderX = module.x;
      unit.orderZ = module.z;
      unit.orderTargetId = module.id;
    });
  }

  private handleGarageWeaponUpgrade(
    client: Colyseus.Client,
    payload: { moduleId?: string; unitId?: string; weaponType?: string },
  ) {
    const moduleId = payload?.moduleId;
    const unitId = payload?.unitId;
    const weaponType = payload?.weaponType ?? "";
    if (!moduleId || !unitId || !weaponType) {
      return;
    }
    if (!WEAPON_STATS[weaponType]) {
      return;
    }
    const module = this.state.modules.get(moduleId);
    const unit = this.state.units.get(unitId);
    if (
      !module ||
      module.owner !== client.sessionId ||
      module.moduleType !== "GARAGE" ||
      !unit ||
      unit.owner !== client.sessionId
    ) {
      return;
    }
    const base = this.state.bases.get(module.baseId);
    if (!base || base.owner !== client.sessionId) {
      return;
    }
    const dist = Math.hypot(module.x - unit.x, module.z - unit.z);
    if (dist > MODULE_INTERACTION_RANGE) {
      return;
    }
    if (base.resourceStock < UNIT_WEAPON_MOUNT_COST) {
      return;
    }
    unit.weaponType = weaponType;
    unit.weaponMounts = Math.min(MAX_UNIT_WEAPON_MOUNTS, unit.weaponMounts + 1);
    base.resourceStock -= UNIT_WEAPON_MOUNT_COST;
  }

  private handleTechUpgrade(
    client: Colyseus.Client,
    payload: { moduleId?: string; unitId?: string; upgradeType?: string },
  ) {
    const moduleId = payload?.moduleId;
    const unitId = payload?.unitId;
    const upgradeType = payload?.upgradeType ?? "";
    if (!moduleId || !unitId || !upgradeType) {
      return;
    }
    const module = this.state.modules.get(moduleId);
    const unit = this.state.units.get(unitId);
    if (
      !module ||
      module.owner !== client.sessionId ||
      module.moduleType !== "TECH_SHOP" ||
      !unit ||
      unit.owner !== client.sessionId
    ) {
      return;
    }
    const base = this.state.bases.get(module.baseId);
    if (!base || base.owner !== client.sessionId) {
      return;
    }
    const dist = Math.hypot(module.x - unit.x, module.z - unit.z);
    if (dist > MODULE_INTERACTION_RANGE) {
      return;
    }
    const cost = this.getTechUpgradeCost(upgradeType);
    if (cost <= 0 || base.resourceStock < cost) {
      return;
    }
    base.resourceStock -= cost;
    switch (upgradeType) {
      case "SHIELDS":
        unit.maxShields += 15;
        unit.shields = unit.maxShields;
        break;
      case "HULL":
        unit.maxHp += 20;
        unit.hp = Math.min(unit.maxHp, unit.hp + 20);
        break;
      case "SPEED":
        unit.speedBonus += 1.5;
        break;
      case "RADAR":
        unit.radarRangeBonus += 6;
        break;
      case "WEAPON":
        unit.weaponDamageBonus += 2;
        break;
      default:
        break;
    }
  }

  private processRepairBays(dt: number) {
    for (const module of this.state.modules.values()) {
      if (module.moduleType !== "REPAIR_BAY" || !module.active) {
        continue;
      }
      for (const unit of this.state.units.values()) {
        if (unit.owner !== module.owner) {
          continue;
        }
        const dist = Math.hypot(module.x - unit.x, module.z - unit.z);
        if (dist > REPAIR_BAY_RANGE) {
          continue;
        }
        if (unit.hp < unit.maxHp) {
          unit.hp = Math.min(unit.maxHp, unit.hp + REPAIR_HULL_RATE * dt);
        }
        if (unit.shields < unit.maxShields) {
          unit.shields = Math.min(
            unit.maxShields,
            unit.shields + REPAIR_SHIELD_RATE * dt,
          );
        }
      }
    }
  }

  private getModuleCost(moduleType: string) {
    switch (moduleType) {
      case "TECH_SHOP":
        return MODULE_TECH_SHOP_COST;
      case "REPAIR_BAY":
        return MODULE_REPAIR_BAY_COST;
      case "GARAGE":
        return MODULE_GARAGE_COST;
      case "WEAPON_TURRET":
        return MODULE_WEAPON_TURRET_COST;
      default:
        return 0;
    }
  }

  private getTechUpgradeCost(upgradeType: string) {
    switch (upgradeType) {
      case "SHIELDS":
        return 80;
      case "HULL":
        return 90;
      case "SPEED":
        return 110;
      case "RADAR":
        return 75;
      case "WEAPON":
        return 120;
      default:
        return 0;
    }
  }

  private findModuleByType(baseId: string, moduleType: string) {
    for (const module of this.state.modules.values()) {
      if (module.baseId === baseId && module.moduleType === moduleType) {
        return module;
      }
    }
    return null;
  }

  private getModuleSpawnPosition(base: BaseSchema, moduleType: string) {
    if (moduleType === "WEAPON_TURRET") {
      const usedSlots = new Set<number>();
      for (const module of this.state.modules.values()) {
        if (module.baseId === base.id && module.moduleType === "WEAPON_TURRET") {
          const angle = Math.atan2(module.z - base.z, module.x - base.x);
          const slot = Math.round(
            ((angle + Math.PI) / (Math.PI * 2)) * WEAPON_TURRET_RING_COUNT,
          );
          usedSlots.add(
            (slot + WEAPON_TURRET_RING_COUNT) % WEAPON_TURRET_RING_COUNT,
          );
        }
      }
      for (let i = 0; i < WEAPON_TURRET_RING_COUNT; i += 1) {
        if (usedSlots.has(i)) {
          continue;
        }
        const angle = (i / WEAPON_TURRET_RING_COUNT) * Math.PI * 2;
        return {
          x: base.x + Math.cos(angle) * WEAPON_TURRET_RING_RADIUS,
          z: base.z + Math.sin(angle) * WEAPON_TURRET_RING_RADIUS,
        };
      }
      return null;
    }
    switch (moduleType) {
      case "TECH_SHOP":
        return { x: base.x + 14, z: base.z + 12 };
      case "REPAIR_BAY":
        return { x: base.x - 16, z: base.z + 10 };
      case "GARAGE":
        return { x: base.x, z: base.z - 18 };
      default:
        return null;
    }
  }

  private removePlayerFromLobbyRoom(sessionId: string) {
    const roomId = this.playerRoomIds.get(sessionId);
    console.log("[lobby] removePlayerFromLobbyRoom", {
      sessionId,
      roomId: roomId ?? "n/a",
    });
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
    console.log("[lobby] removed player from room", {
      roomId,
      remainingPlayers: room.players.size,
    });
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
      hostId: room.hostId,
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
