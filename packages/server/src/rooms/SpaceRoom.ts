import { Room, Client } from "colyseus";
import { nanoid } from "nanoid";
import type { Command, ShipStats } from "@space-combat/shared";
import { SpaceState, UnitSchema } from "../state/SpaceState.js";
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

export class SpaceRoom extends Room<SpaceState> {
  private readonly stats = DEFAULT_STATS;

  onCreate() {
    this.setState(new SpaceState());
    this.setSimulationInterval((dt) => this.tick(dt), 1000 / TICK_RATE);

    this.onMessage("command", (client, message: Command) => {
      this.handleCommand(client, message);
    });
  }

  onJoin(client: Client) {
    const spawnOffset = this.clients.length * 6;
    for (let i = 0; i < 5; i += 1) {
      const unit = new UnitSchema();
      unit.id = nanoid();
      unit.owner = client.sessionId;
      unit.x = spawnOffset + i * 2;
      unit.z = spawnOffset;
      this.state.units.set(unit.id, unit);
    }
  }

  onLeave(client: Client) {
    for (const [id, unit] of this.state.units.entries()) {
      if (unit.owner === client.sessionId) {
        this.state.units.delete(id);
      }
    }
  }

  private tick(dtMs: number) {
    const dt = dtMs / 1000;
    simulate({ units: this.state.units, stats: this.stats, dt });
  }

  private handleCommand(client: Client, command: Command) {
    const units = this.getClientUnits(client.sessionId, command.unitIds);
    switch (command.t) {
      case "MOVE":
        units.forEach((unit) => {
          unit.orderType = "MOVE";
          unit.orderX = command.x;
          unit.orderZ = command.z;
          unit.orderTargetId = "";
        });
        break;
      case "ATTACK":
        units.forEach((unit) => {
          unit.orderType = "ATTACK";
          unit.orderTargetId = command.targetId;
        });
        break;
      case "ATTACK_MOVE":
        units.forEach((unit) => {
          unit.orderType = "ATTACK_MOVE";
          unit.orderX = command.x;
          unit.orderZ = command.z;
          unit.orderTargetId = "";
        });
        break;
      case "HOLD":
        units.forEach((unit) => {
          unit.orderType = "HOLD";
          unit.orderTargetId = "";
        });
        break;
      case "STOP":
        units.forEach((unit) => {
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
}
