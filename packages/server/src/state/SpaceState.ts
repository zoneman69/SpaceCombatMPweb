import { Schema, type, MapSchema } from "@colyseus/schema";

export class UnitSchema extends Schema {
  @type("string") id = "";
  @type("string") owner = "";
  @type("number") x = 0;
  @type("number") z = 0;
  @type("number") vx = 0;
  @type("number") vz = 0;
  @type("number") rot = 0;
  @type("number") hp = 100;
  @type("string") tgt = "";
  @type("string") orderType = "STOP";
  @type("number") orderX = 0;
  @type("number") orderZ = 0;
  @type("string") orderTargetId = "";
  @type("number") weaponCooldownLeft = 0;
}

export class SpaceState extends Schema {
  @type({ map: UnitSchema }) units = new MapSchema<UnitSchema>();
}
