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
export const simulate = ({ units, stats, dt }) => {
    for (const unit of units.values()) {
        updateUnit(unit, units, stats, dt);
    }
};
const updateUnit = (unit, units, stats, dt) => {
    const hasTarget = unit.orderType === "ATTACK" && unit.orderTargetId;
    const hasMoveTarget = unit.orderType === "MOVE" || unit.orderType === "ATTACK_MOVE";
    let desiredX = unit.x;
    let desiredZ = unit.z;
    let shouldMove = false;
    if (hasTarget) {
        const target = units.get(unit.orderTargetId);
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
    if (hasMoveTarget) {
        desiredX = unit.orderX;
        desiredZ = unit.orderZ;
        const distToTarget = distance(unit.x, unit.z, desiredX, desiredZ);
        shouldMove = distToTarget > stats.arrivalRadius;
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
    if (distToTarget > stats.weaponRange) {
        return;
    }
    if (unit.weaponCooldownLeft > 0) {
        return;
    }
    unit.weaponCooldownLeft = stats.weaponCooldown;
    target.hp = Math.max(0, target.hp - stats.weaponDamage);
};
const distance = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
