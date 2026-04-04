import type { MapSchema } from "@colyseus/schema";
import type {
  BaseModuleSchema,
  BaseSchema,
  ShipStats,
  UnitSchema,
  WeaponType,
} from "@space-combat/shared";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const wrapAngle = (angle: number) => {
  const twoPi = Math.PI * 2;
  let a = angle % twoPi;
  if (a < -Math.PI) a += twoPi;
  if (a > Math.PI) a -= twoPi;
  return a;
};

type UnitCollection = Pick<
  Map<string, UnitSchema> | MapSchema<UnitSchema>,
  "get" | "values"
>;

type BaseCollection = Pick<
  Map<string, BaseSchema> | MapSchema<BaseSchema>,
  "get" | "values"
>;

type ModuleCollection = Pick<
  Map<string, BaseModuleSchema> | MapSchema<BaseModuleSchema>,
  "get" | "values"
>;

export type SimContext = {
  units: UnitCollection;
  bases: BaseCollection;
  modules: ModuleCollection;
  getStats: (unit: UnitSchema) => ShipStats;
  dt: number;
  onEntityDestroyed?: (event: {
    attackerOwnerId: string;
    defenderOwnerId: string;
    entityType: "UNIT" | "BASE";
    entityId: string;
  }) => void;
};

type AttackTarget = Pick<
  UnitSchema | BaseSchema,
  "id" | "owner" | "x" | "z" | "hp" | "shields" | "maxShields"
>;

type VisibilityTarget = Pick<UnitSchema | BaseSchema, "x" | "z">;

const FIGHTER_VISION_RADIUS = 30;
const COLLECTOR_VISION_RADIUS = 60;
const BASE_VISION_RADIUS = 100;
const RADAR_UPGRADE_VISION_STEP = 12;
const PATROL_WANDER_RADIUS = 24;

const BASE_WEAPON_STATS: Record<
  WeaponType,
  Pick<ShipStats, "weaponRange" | "weaponCooldown" | "weaponDamage">
> = {
  LASER: {
    weaponRange: 18,
    weaponCooldown: 1.4,
    weaponDamage: 10,
  },
  PLASMA: {
    weaponRange: 14,
    weaponCooldown: 1.8,
    weaponDamage: 16,
  },
  RAIL: {
    weaponRange: 22,
    weaponCooldown: 2.1,
    weaponDamage: 12,
  },
  MISSILE: {
    weaponRange: 20,
    weaponCooldown: 2,
    weaponDamage: 14,
  },
  FUSION_PLASMA: {
    weaponRange: 15,
    weaponCooldown: 1.7,
    weaponDamage: 18,
  },
  GAUSS_RAIL: {
    weaponRange: 24,
    weaponCooldown: 2,
    weaponDamage: 14,
  },
  SMART_MISSILE: {
    weaponRange: 22,
    weaponCooldown: 1.8,
    weaponDamage: 16,
  },
};

export const simulate = ({
  units,
  bases,
  modules,
  getStats,
  dt,
  onEntityDestroyed,
}: SimContext) => {
  const unitList = Array.from(units.values());
  for (const unit of unitList) {
    const stats = getStats(unit);
    updateUnit(unit, units, bases, stats, dt, onEntityDestroyed);
  }
  const baseList = Array.from(bases.values());
  for (const base of baseList) {
    updateBase(base, units, bases, modules, dt, onEntityDestroyed);
  }
  resolveUnitCollisions(unitList);
};

const updateUnit = (
  unit: UnitSchema,
  units: UnitCollection,
  bases: BaseCollection,
  stats: ShipStats,
  dt: number,
  onEntityDestroyed?: SimContext["onEntityDestroyed"],
) => {
  if (unit.harvestWaitLeft > 0 || unit.dropoffWaitLeft > 0) {
    unit.vx = 0;
    unit.vz = 0;
    unit.speed = 0;
    return;
  }
  const hasTarget = unit.orderType === "ATTACK" && unit.orderTargetId;
  const hasMoveTarget =
    unit.orderType === "MOVE" ||
    unit.orderType === "ATTACK_MOVE" ||
    unit.orderType === "HARVEST" ||
    unit.orderType === "RETURN" ||
    unit.orderType === "PATROL" ||
    unit.orderType === "RETURN_TO_BASE" ||
    unit.orderType === "RETURN_TO_GARAGE" ||
    unit.orderType === "RETURN_TO_REPAIR";
  const canPursueAutoTarget =
    unit.orderType === "AGGRESSIVE" || unit.orderType === "PATROL";

  let desiredX = unit.x;
  let desiredZ = unit.z;
  let shouldMove = false;

  if (hasTarget) {
    const target =
      units.get(unit.orderTargetId) ?? bases.get(unit.orderTargetId);
    if (target) {
      if (!isTargetVisibleToOwner(unit.owner, target, units, bases)) {
        unit.tgt = "";
        unit.orderType = "STOP";
        unit.orderTargetId = "";
      } else {
        desiredX = target.x;
        desiredZ = target.z;
        const distToTarget = distance(unit.x, unit.z, target.x, target.z);
        shouldMove = distToTarget > stats.weaponRange * 0.85;
        unit.tgt = target.id;
        maybeFire(unit, target, stats, distToTarget, onEntityDestroyed);
      }
    } else {
      unit.tgt = "";
      unit.orderType = "STOP";
      unit.orderTargetId = "";
    }
  }

  let autoTarget: ReturnType<typeof findAutoTarget> = null;
  if (!hasTarget) {
    autoTarget = findAutoTarget(unit, units, bases, stats);
    if (autoTarget) {
      unit.tgt = autoTarget.target.id;
      maybeFire(unit, autoTarget.target, stats, autoTarget.distance, onEntityDestroyed);
      if (canPursueAutoTarget) {
        desiredX = autoTarget.target.x;
        desiredZ = autoTarget.target.z;
        shouldMove = autoTarget.distance > stats.weaponRange * 0.85;
      }
    } else {
      unit.tgt = "";
    }
  }

  if (unit.orderType === "GUARD" && unit.orderTargetId) {
    const guardedUnit = units.get(unit.orderTargetId);
    if (
      !guardedUnit ||
      guardedUnit.id === unit.id ||
      guardedUnit.owner !== unit.owner
    ) {
      unit.orderType = "STOP";
      unit.orderTargetId = "";
    } else {
      desiredX = guardedUnit.x;
      desiredZ = guardedUnit.z;
      const distToGuarded = distance(unit.x, unit.z, desiredX, desiredZ);
      shouldMove = distToGuarded > Math.max(stats.arrivalRadius * 2, 8);
    }
  }

  if (hasMoveTarget && !(canPursueAutoTarget && autoTarget)) {
    desiredX = unit.orderX;
    desiredZ = unit.orderZ;
    const distToTarget = distance(unit.x, unit.z, desiredX, desiredZ);
    shouldMove = distToTarget > stats.arrivalRadius;
    if (!shouldMove) {
      unit.x = desiredX;
      unit.z = desiredZ;
      unit.vx = 0;
      unit.vz = 0;
      if (unit.orderType === "PATROL") {
        const nextPoint = getRandomPatrolPoint(unit.x, unit.z);
        unit.orderX = nextPoint.x;
        unit.orderZ = nextPoint.z;
      } else if (
        unit.orderType === "MOVE" ||
        unit.orderType === "RETURN_TO_BASE" ||
        unit.orderType === "RETURN_TO_GARAGE" ||
        unit.orderType === "RETURN_TO_REPAIR"
      ) {
        unit.orderType = "STOP";
        unit.orderTargetId = "";
      }
    }
  }

  if (unit.orderType === "HOLD") {
    shouldMove = false;
  }

  if (shouldMove) {
    steer(unit, desiredX, desiredZ, stats, dt);
  } else {
    applyDamping(unit, stats, dt);
  }

  unit.x += unit.vx * dt;
  unit.z += unit.vz * dt;
  unit.speed = Math.hypot(unit.vx, unit.vz);

  if (unit.weaponCooldownLeft > 0) {
    unit.weaponCooldownLeft = Math.max(0, unit.weaponCooldownLeft - dt);
  }
};

const steer = (
  unit: UnitSchema,
  targetX: number,
  targetZ: number,
  stats: ShipStats,
  dt: number,
) => {
  const dx = targetX - unit.x;
  const dz = targetZ - unit.z;
  const desiredAngle = Math.atan2(dz, dx);
  const angleDiff = wrapAngle(desiredAngle - unit.rot);
  const maxTurn = stats.maxTurnRate * dt;
  unit.rot = wrapAngle(unit.rot + clamp(angleDiff, -maxTurn, maxTurn));

  const distanceToTarget = Math.hypot(dx, dz);
  const desiredSpeed =
    distanceToTarget < stats.arrivalRadius
      ? stats.maxSpeed * (distanceToTarget / stats.arrivalRadius)
      : stats.maxSpeed;

  const desiredVx = Math.cos(unit.rot) * desiredSpeed;
  const desiredVz = Math.sin(unit.rot) * desiredSpeed;

  const accelX = clamp(desiredVx - unit.vx, -stats.maxAccel, stats.maxAccel);
  const accelZ = clamp(desiredVz - unit.vz, -stats.maxAccel, stats.maxAccel);

  unit.vx = clamp(unit.vx + accelX * dt, -stats.maxSpeed, stats.maxSpeed);
  unit.vz = clamp(unit.vz + accelZ * dt, -stats.maxSpeed, stats.maxSpeed);
};

const applyDamping = (unit: UnitSchema, stats: ShipStats, dt: number) => {
  const damp = Math.max(0, 1 - stats.linearDamp * dt);
  unit.vx *= damp;
  unit.vz *= damp;
};

const maybeFire = (
  unit: UnitSchema,
  target: AttackTarget,
  stats: ShipStats,
  distToTarget: number,
  onEntityDestroyed?: SimContext["onEntityDestroyed"],
) => {
  const weaponMounts = Math.max(0, unit.weaponMounts ?? 0);
  if (weaponMounts <= 0) {
    return;
  }
  if (distToTarget > stats.weaponRange) {
    return;
  }
  if (unit.weaponCooldownLeft > 0) {
    return;
  }
  unit.weaponCooldownLeft = stats.weaponCooldown;
  let remainingDamage = stats.weaponDamage * weaponMounts;
  if (target.shields > 0) {
    const absorbed = Math.min(target.shields, remainingDamage);
    target.shields = Math.max(0, target.shields - absorbed);
    remainingDamage -= absorbed;
  }
  if (remainingDamage > 0) {
    const hpBeforeDamage = target.hp;
    target.hp = Math.max(0, target.hp - remainingDamage);
    if (hpBeforeDamage > 0 && target.hp === 0) {
      onEntityDestroyed?.({
        attackerOwnerId: unit.owner,
        defenderOwnerId: target.owner,
        entityType: "unitType" in target ? "UNIT" : "BASE",
        entityId: target.id,
      });
    }
  }
};

const distance = (ax: number, az: number, bx: number, bz: number) =>
  Math.hypot(ax - bx, az - bz);

const getRandomPatrolPoint = (centerX: number, centerZ: number) => {
  const angle = Math.random() * Math.PI * 2;
  const radius = PATROL_WANDER_RADIUS * (0.35 + Math.random() * 0.65);
  return {
    x: centerX + Math.cos(angle) * radius,
    z: centerZ + Math.sin(angle) * radius,
  };
};

const isEnemy = (unit: UnitSchema, target: UnitSchema | BaseSchema) =>
  target.owner !== unit.owner;

const isEnemyBase = (base: BaseSchema, target: UnitSchema | BaseSchema) =>
  target.owner !== base.owner;

const findAutoTarget = (
  unit: UnitSchema,
  units: UnitCollection,
  bases: BaseCollection,
  stats: ShipStats,
) => {
  const weaponMounts = Math.max(0, unit.weaponMounts ?? 0);
  if (weaponMounts <= 0) {
    return null;
  }
  let closest: AttackTarget | null = null;
  let closestDistance = 0;
  const searchRange =
    unit.orderType === "AGGRESSIVE" || unit.orderType === "PATROL"
      ? getUnitVisionRadius(unit)
      : stats.weaponRange;
  for (const target of units.values()) {
    if (target.id === unit.id || !isEnemy(unit, target) || target.hp <= 0) {
      continue;
    }
    if (!isTargetVisibleToOwner(unit.owner, target, units, bases)) {
      continue;
    }
    const dist = distance(unit.x, unit.z, target.x, target.z);
    if (dist > searchRange) {
      continue;
    }
    if (!closest || dist < closestDistance) {
      closest = target;
      closestDistance = dist;
    }
  }
  for (const target of bases.values()) {
    if (!isEnemy(unit, target) || target.hp <= 0) {
      continue;
    }
    if (!isTargetVisibleToOwner(unit.owner, target, units, bases)) {
      continue;
    }
    const dist = distance(unit.x, unit.z, target.x, target.z);
    if (dist > searchRange) {
      continue;
    }
    if (!closest || dist < closestDistance) {
      closest = target;
      closestDistance = dist;
    }
  }
  if (!closest) {
    return null;
  }
  return { target: closest, distance: closestDistance };
};

const getUnitVisionRadius = (unit: UnitSchema) =>
  (unit.unitType === "FIGHTER" ? FIGHTER_VISION_RADIUS : COLLECTOR_VISION_RADIUS) +
  Math.max(0, unit.radarRangeBonus ?? 0);

const getBaseVisionRadius = (base: BaseSchema) =>
  BASE_VISION_RADIUS +
  Math.max(0, base.radarUpgradeLevel ?? 0) * RADAR_UPGRADE_VISION_STEP;

const isTargetVisibleToOwner = (
  ownerId: string,
  target: VisibilityTarget,
  units: UnitCollection,
  bases: BaseCollection,
) => {
  for (const source of units.values()) {
    if (source.owner !== ownerId || source.hp <= 0) {
      continue;
    }
    const visionRadius = getUnitVisionRadius(source);
    if (distance(source.x, source.z, target.x, target.z) <= visionRadius) {
      return true;
    }
  }
  for (const base of bases.values()) {
    if (base.owner !== ownerId || base.hp <= 0) {
      continue;
    }
    if (distance(base.x, base.z, target.x, target.z) <= getBaseVisionRadius(base)) {
      return true;
    }
  }
  return false;
};

const updateBase = (
  base: BaseSchema,
  units: UnitCollection,
  bases: BaseCollection,
  modules: ModuleCollection,
  dt: number,
  onEntityDestroyed?: SimContext["onEntityDestroyed"],
) => {
  const baseWeaponStats = BASE_WEAPON_STATS.LASER;
  if (base.weaponCooldownLeft > 0) {
    base.weaponCooldownLeft = Math.max(0, base.weaponCooldownLeft - dt);
  }
  const baseWeaponMounts = Math.max(0, base.weaponMounts ?? 0);
  if (baseWeaponMounts > 0 && base.weaponCooldownLeft <= 0) {
    const closest = findClosestBaseTarget(base, base.x, base.z, units, bases, baseWeaponStats);
    if (closest) {
      base.weaponCooldownLeft = baseWeaponStats.weaponCooldown;
      applyDamage(
        closest.target,
        baseWeaponStats.weaponDamage * baseWeaponMounts,
        base.owner,
        onEntityDestroyed,
      );
    }
  }

  for (const module of modules.values()) {
    if (module.baseId !== base.id || module.moduleType !== "WEAPON_TURRET") {
      continue;
    }
    if (!module.active) {
      continue;
    }
    if (module.weaponCooldownLeft > 0) {
      module.weaponCooldownLeft = Math.max(0, module.weaponCooldownLeft - dt);
      continue;
    }
    const stats =
      BASE_WEAPON_STATS[module.weaponType as WeaponType] ??
      BASE_WEAPON_STATS.LASER;
    const closest = findClosestBaseTarget(base, module.x, module.z, units, bases, stats);
    if (!closest) {
      continue;
    }
    module.weaponCooldownLeft = stats.weaponCooldown;
    applyDamage(closest.target, stats.weaponDamage, base.owner, onEntityDestroyed);
  }
};

const findClosestBaseTarget = (
  base: BaseSchema,
  sourceX: number,
  sourceZ: number,
  units: UnitCollection,
  bases: BaseCollection,
  stats: Pick<ShipStats, "weaponRange">,
) => {
  let closest: AttackTarget | null = null;
  let closestDistance = 0;
  for (const target of units.values()) {
    if (!isEnemyBase(base, target) || target.hp <= 0) {
      continue;
    }
    const dist = distance(sourceX, sourceZ, target.x, target.z);
    if (dist > stats.weaponRange) {
      continue;
    }
    if (!closest || dist < closestDistance) {
      closest = target;
      closestDistance = dist;
    }
  }
  for (const target of bases.values()) {
    if (target.id === base.id || !isEnemyBase(base, target) || target.hp <= 0) {
      continue;
    }
    const dist = distance(sourceX, sourceZ, target.x, target.z);
    if (dist > stats.weaponRange) {
      continue;
    }
    if (!closest || dist < closestDistance) {
      closest = target;
      closestDistance = dist;
    }
  }
  if (!closest) {
    return null;
  }
  return { target: closest, distance: closestDistance };
};

const applyDamage = (
  target: AttackTarget,
  damage: number,
  attackerOwnerId: string,
  onEntityDestroyed?: SimContext["onEntityDestroyed"],
) => {
  let remainingDamage = Math.max(0, damage);
  if (remainingDamage <= 0) {
    return;
  }
  if (target.shields > 0) {
    const absorbed = Math.min(target.shields, remainingDamage);
    target.shields = Math.max(0, target.shields - absorbed);
    remainingDamage -= absorbed;
  }
  if (remainingDamage > 0) {
    const hpBeforeDamage = target.hp;
    target.hp = Math.max(0, target.hp - remainingDamage);
    if (hpBeforeDamage > 0 && target.hp === 0) {
      onEntityDestroyed?.({
        attackerOwnerId,
        defenderOwnerId: target.owner,
        entityType: "unitType" in target ? "UNIT" : "BASE",
        entityId: target.id,
      });
    }
  }
};

const UNIT_COLLISION_RADIUS = 2.6;
const COLLISION_SLOP = 0.01;
const COLLISION_DAMPING = 0.35;

const resolveUnitCollisions = (units: UnitSchema[]) => {
  if (units.length < 2) {
    return;
  }
  const minDistance = UNIT_COLLISION_RADIUS * 2;
  const minDistanceSq = minDistance * minDistance;
  for (let i = 0; i < units.length; i += 1) {
    const unitA = units[i];
    for (let j = i + 1; j < units.length; j += 1) {
      const unitB = units[j];
      const dx = unitB.x - unitA.x;
      const dz = unitB.z - unitA.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDistanceSq) {
        continue;
      }
      const dist = Math.sqrt(distSq);
      const nx = dist > 0.0001 ? dx / dist : 1;
      const nz = dist > 0.0001 ? dz / dist : 0;
      const overlap = minDistance - dist + COLLISION_SLOP;
      const push = overlap * 0.5;
      unitA.x -= nx * push;
      unitA.z -= nz * push;
      unitB.x += nx * push;
      unitB.z += nz * push;

      const relVx = unitA.vx - unitB.vx;
      const relVz = unitA.vz - unitB.vz;
      const relNormal = relVx * nx + relVz * nz;
      if (relNormal < 0) {
        const impulse = -relNormal * COLLISION_DAMPING;
        unitA.vx += nx * impulse;
        unitA.vz += nz * impulse;
        unitB.vx -= nx * impulse;
        unitB.vz -= nz * impulse;
      }
    }
  }
};
