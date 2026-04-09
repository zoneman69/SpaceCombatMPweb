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
  @type("number") maxHp = 100;
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
  @type("string") weaponType = "LASER";
  @type("number") cargo = 0;
  @type("number") cargoCapacity = 25;
  @type("number") weaponMounts = 0;
  @type("number") techMounts = 0;
  @type("number") speedBonus = 0;
  @type("number") radarRangeBonus = 0;
  @type("number") weaponDamageBonus = 0;
  @type("number") harvestWaitLeft = 0;
  @type("number") dropoffWaitLeft = 0;
  @type("number") installTimeRemaining = 0;
  @type("string") installState = "IDLE";
  @type("string") pendingInstallType = "";
  @type("string") pendingInstallKey = "";
  @type("string") pendingInstallGarageId = "";
  @type("number") pendingInstallDuration = 0;
  @type("number") techSlotsUsed = 0;
  @type("boolean") techShieldPackage = false;
  @type("boolean") techHullPackage = false;
  @type("boolean") techSpeedPackage = false;
  @type("boolean") techRadarPackage = false;
  @type("boolean") techWeaponPackage = false;
}

export class BaseSchema extends Schema {
  @type("string") id = "";
  @type("string") owner = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") hp = 400;
  @type("number") shields = 0;
  @type("number") maxShields = 0;
  @type("number") weaponMounts = 0;
  @type("number") weaponCooldownLeft = 0;
  @type("number") resourceStock = 0;
  @type("string") activeResearchKey = "";
  @type("number") activeResearchRemaining = 0;
  @type("number") collectorStorageBonus = 0;
  @type("number") shieldUpgradeLevel = 0;
  @type("number") hullUpgradeLevel = 0;
  @type("number") speedUpgradeLevel = 0;
  @type("number") radarUpgradeLevel = 0;
  @type("number") weaponUpgradeLevel = 0;
  @type("boolean") researchRepairBay = false;
  @type("boolean") researchGarage = false;
  @type("boolean") researchWeaponTurret = false;
  @type("boolean") researchPlasma = false;
  @type("boolean") researchRail = false;
  @type("boolean") researchMissile = false;
  @type("boolean") researchFusionPlasma = false;
  @type("boolean") researchGaussRail = false;
  @type("boolean") researchSmartMissile = false;
  @type("boolean") researchWeaponLevel1 = false;
  @type("boolean") researchWeaponLevel2 = false;
  @type("boolean") researchWeaponLevel3 = false;
  @type("boolean") researchShields = false;
  @type("boolean") researchHull = false;
  @type("boolean") researchSpeed = false;
  @type("boolean") researchRadar = false;
  @type("boolean") researchTargeting = false;
  @type("boolean") researchPowerCore = false;
  @type("boolean") researchECM = false;
}

export class BaseModuleSchema extends Schema {
  @type("string") id = "";
  @type("string") owner = "";
  @type("string") baseId = "";
  @type("string") moduleType = "";
  @type("string") weaponType = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") weaponCooldownLeft = 0;
  @type("boolean") active = true;
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
  @type("boolean") isBot = false;
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
  @type({ map: BaseModuleSchema }) modules = new MapSchema<BaseModuleSchema>();
  @type({ map: ResourceNodeSchema })
  resources = new MapSchema<ResourceNodeSchema>();
  @type({ map: LobbyRoomSchema }) lobbyRooms = new MapSchema<LobbyRoomSchema>();
}
