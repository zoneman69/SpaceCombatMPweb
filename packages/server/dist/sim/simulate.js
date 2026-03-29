const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrapAngle = (angle) => {
    const twoPi = Math.PI * 2;
    let a = angle % twoPi;
    if (a < -Math.PI)
        a += twoPi;
    if (a > Math.PI)
        a -= twoPi;
    return a;
};
const BASE_WEAPON_STATS = {
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
export const simulate = ({ units, bases, modules, getStats, dt }) => {
    const unitList = Array.from(units.values());
    for (const unit of unitList) {
        const stats = getStats(unit);
        updateUnit(unit, units, bases, stats, dt);
    }
    const baseList = Array.from(bases.values());
    for (const base of baseList) {
        updateBase(base, units, bases, modules, dt);
    }
    resolveUnitCollisions(unitList);
};
const updateUnit = (unit, units, bases, stats, dt) => {
    if (unit.harvestWaitLeft > 0 || unit.dropoffWaitLeft > 0) {
        unit.vx = 0;
        unit.vz = 0;
        unit.speed = 0;
        return;
    }
    const hasTarget = unit.orderType === "ATTACK" && unit.orderTargetId;
    const hasMoveTarget = unit.orderType === "MOVE" ||
        unit.orderType === "ATTACK_MOVE" ||
        unit.orderType === "HARVEST" ||
        unit.orderType === "RETURN";
    const canPursueAutoTarget = unit.orderType === "ATTACK_MOVE";
    let desiredX = unit.x;
    let desiredZ = unit.z;
    let shouldMove = false;
    if (hasTarget) {
        const target = units.get(unit.orderTargetId) ?? bases.get(unit.orderTargetId);
        if (target) {
            desiredX = target.x;
            desiredZ = target.z;
            const distToTarget = distance(unit.x, unit.z, target.x, target.z);
            shouldMove = distToTarget > stats.weaponRange * 0.85;
            unit.tgt = target.id;
            maybeFire(unit, target, stats, distToTarget);
        }
        else {
            unit.tgt = "";
        }
    }
    let autoTarget = null;
    if (!hasTarget) {
        autoTarget = findAutoTarget(unit, units, bases, stats);
        if (autoTarget) {
            unit.tgt = autoTarget.target.id;
            maybeFire(unit, autoTarget.target, stats, autoTarget.distance);
            if (canPursueAutoTarget) {
                desiredX = autoTarget.target.x;
                desiredZ = autoTarget.target.z;
                shouldMove = autoTarget.distance > stats.weaponRange * 0.85;
            }
        }
        else {
            unit.tgt = "";
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
            if (unit.orderType === "MOVE") {
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
    }
    else {
        applyDamping(unit, stats, dt);
    }
    unit.x += unit.vx * dt;
    unit.z += unit.vz * dt;
    unit.speed = Math.hypot(unit.vx, unit.vz);
    if (unit.weaponCooldownLeft > 0) {
        unit.weaponCooldownLeft = Math.max(0, unit.weaponCooldownLeft - dt);
    }
};
const steer = (unit, targetX, targetZ, stats, dt) => {
    const dx = targetX - unit.x;
    const dz = targetZ - unit.z;
    const desiredAngle = Math.atan2(dz, dx);
    const angleDiff = wrapAngle(desiredAngle - unit.rot);
    const maxTurn = stats.maxTurnRate * dt;
    unit.rot = wrapAngle(unit.rot + clamp(angleDiff, -maxTurn, maxTurn));
    const distanceToTarget = Math.hypot(dx, dz);
    const desiredSpeed = distanceToTarget < stats.arrivalRadius
        ? stats.maxSpeed * (distanceToTarget / stats.arrivalRadius)
        : stats.maxSpeed;
    const desiredVx = Math.cos(unit.rot) * desiredSpeed;
    const desiredVz = Math.sin(unit.rot) * desiredSpeed;
    const accelX = clamp(desiredVx - unit.vx, -stats.maxAccel, stats.maxAccel);
    const accelZ = clamp(desiredVz - unit.vz, -stats.maxAccel, stats.maxAccel);
    unit.vx = clamp(unit.vx + accelX * dt, -stats.maxSpeed, stats.maxSpeed);
    unit.vz = clamp(unit.vz + accelZ * dt, -stats.maxSpeed, stats.maxSpeed);
};
const applyDamping = (unit, stats, dt) => {
    const damp = Math.max(0, 1 - stats.linearDamp * dt);
    unit.vx *= damp;
    unit.vz *= damp;
};
const maybeFire = (unit, target, stats, distToTarget) => {
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
        target.hp = Math.max(0, target.hp - remainingDamage);
    }
};
const distance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const isEnemy = (unit, target) => target.owner !== unit.owner;
const isEnemyBase = (base, target) => target.owner !== base.owner;
const findAutoTarget = (unit, units, bases, stats) => {
    const weaponMounts = Math.max(0, unit.weaponMounts ?? 0);
    if (weaponMounts <= 0) {
        return null;
    }
    let closest = null;
    let closestDistance = 0;
    for (const target of units.values()) {
        if (target.id === unit.id || !isEnemy(unit, target) || target.hp <= 0) {
            continue;
        }
        const dist = distance(unit.x, unit.z, target.x, target.z);
        if (dist > stats.weaponRange) {
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
        const dist = distance(unit.x, unit.z, target.x, target.z);
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
const updateBase = (base, units, bases, modules, dt) => {
    if (base.weaponCooldownLeft > 0) {
        base.weaponCooldownLeft = Math.max(0, base.weaponCooldownLeft - dt);
    }
    let hasWeaponModules = false;
    for (const module of modules.values()) {
        if (module.baseId !== base.id || module.moduleType !== "WEAPON_TURRET") {
            continue;
        }
        if (!module.active) {
            continue;
        }
        hasWeaponModules = true;
        if (module.weaponCooldownLeft > 0) {
            module.weaponCooldownLeft = Math.max(0, module.weaponCooldownLeft - dt);
            continue;
        }
        const stats = BASE_WEAPON_STATS[module.weaponType] ??
            BASE_WEAPON_STATS.LASER;
        let closest = null;
        let closestDistance = 0;
        for (const target of units.values()) {
            if (!isEnemyBase(base, target) || target.hp <= 0) {
                continue;
            }
            const dist = distance(module.x, module.z, target.x, target.z);
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
            const dist = distance(module.x, module.z, target.x, target.z);
            if (dist > stats.weaponRange) {
                continue;
            }
            if (!closest || dist < closestDistance) {
                closest = target;
                closestDistance = dist;
            }
        }
        if (!closest) {
            continue;
        }
        module.weaponCooldownLeft = stats.weaponCooldown;
        let remainingDamage = stats.weaponDamage;
        if (closest.shields > 0) {
            const absorbed = Math.min(closest.shields, remainingDamage);
            closest.shields = Math.max(0, closest.shields - absorbed);
            remainingDamage -= absorbed;
        }
        if (remainingDamage > 0) {
            closest.hp = Math.max(0, closest.hp - remainingDamage);
        }
    }
    if (!hasWeaponModules) {
        return;
    }
};
const UNIT_COLLISION_RADIUS = 2.6;
const COLLISION_SLOP = 0.01;
const COLLISION_DAMPING = 0.35;
const resolveUnitCollisions = (units) => {
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
