export type Command =
  | { t: "MOVE"; unitIds: string[]; x: number; z: number; queue?: boolean }
  | { t: "HARVEST"; unitIds: string[]; resourceId: string }
  | { t: "ATTACK"; unitIds: string[]; targetId: string; queue?: boolean }
  | { t: "STOP"; unitIds: string[] }
  | { t: "HOLD"; unitIds: string[] }
  | { t: "ATTACK_MOVE"; unitIds: string[]; x: number; z: number; queue?: boolean }
  | { t: "AGGRESSIVE"; unitIds: string[] }
  | { t: "PATROL"; unitIds: string[] }
  | { t: "GUARD"; unitIds: string[]; targetId: string }
  | { t: "RETURN_TO_BASE"; unitIds: string[] }
  | { t: "RETURN_TO_GARAGE"; unitIds: string[] }
  | { t: "RETURN_TO_REPAIR"; unitIds: string[] };

export type UnitType = "RESOURCE_COLLECTOR" | "FIGHTER";
export type WeaponType =
  | "LASER"
  | "PLASMA"
  | "RAIL"
  | "MISSILE"
  | "FUSION_PLASMA"
  | "GAUSS_RAIL"
  | "SMART_MISSILE";
export type ModuleType = "TECH_SHOP" | "REPAIR_BAY" | "GARAGE" | "WEAPON_TURRET";

export type UnitState = {
  id: string;
  owner: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  rot: number;
  hp: number;
  shields: number;
  maxShields: number;
  speed: number;
  tgt?: string;
};

export type ShipStats = {
  maxAccel: number;
  maxSpeed: number;
  maxTurnRate: number;
  linearDamp: number;
  arrivalRadius: number;
  weaponRange: number;
  weaponCooldown: number;
  weaponDamage: number;
};

export type Order =
  | { type: "MOVE"; x: number; z: number }
  | { type: "HARVEST"; resourceId: string }
  | { type: "ATTACK"; targetId: string }
  | { type: "ATTACK_MOVE"; x: number; z: number }
  | { type: "AGGRESSIVE" }
  | { type: "HOLD" }
  | { type: "PATROL" }
  | { type: "GUARD"; targetId: string }
  | { type: "RETURN_TO_BASE"; targetId: string }
  | { type: "RETURN_TO_GARAGE"; targetId: string }
  | { type: "RETURN_TO_REPAIR"; targetId: string }
  | { type: "RETURN" }
  | { type: "STOP" };
