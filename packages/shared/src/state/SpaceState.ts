import { Schema, type, MapSchema } from "@colyseus/schema";
import type { UnitType } from "../types";

export class UnitSchema extends Schema {
  @type("string") id = "";
  @type("string") owner = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") vx = 0;
  @type("number") vz = 0;
  @type("number") rot = 0;
  @type("number") hp = 100;
  @type("number") shields = 0;
  @type("number") maxShields = 0;
  @type("number") speed = 0;
  @type("string") tgt = "";
  @type("string") orderType = "STOP";
  @type("number") orderX = 0;
  @type("number") orderZ = 0;
  @type("string") orderTargetId = "";
  @type("string") harvestTargetId = "";
  @type("number") weaponCooldownLeft = 0;
  @type("string") unitType: UnitType = "RESOURCE_COLLECTOR";
  @type("number") cargo = 0;
  @type("number") cargoCapacity = 25;
  @type("number") weaponMounts = 0;
  @type("number") techMounts = 0;
  @type("number") harvestWaitLeft = 0;
  @type("number") dropoffWaitLeft = 0;
}

export class BaseSchema extends Schema {
  @type("string") id = "";
  @type("string") owner = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") hp = 400;
  @type("number") shields = 0;
  @type("number") maxShields = 0;
  @type("number") resourceStock = 0;
}

export class ResourceNodeSchema extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") amount = 500;
  @type("number") maxAmount = 500;
}

export class LobbyPlayerSchema extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("boolean") ready = false;
}

export class LobbyRoomSchema extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") mode = "";
  @type("string") hostId = "";
  @type("string") hostName = "";
  @type({ map: LobbyPlayerSchema }) players = new MapSchema<LobbyPlayerSchema>();
}

export class SpaceState extends Schema {
  @type({ map: UnitSchema }) units = new MapSchema<UnitSchema>();
  @type({ map: BaseSchema }) bases = new MapSchema<BaseSchema>();
  @type({ map: ResourceNodeSchema })
  resources = new MapSchema<ResourceNodeSchema>();
  @type({ map: LobbyRoomSchema }) lobbyRooms = new MapSchema<LobbyRoomSchema>();
}
