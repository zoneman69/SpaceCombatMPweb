var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Schema, type, MapSchema } from "@colyseus/schema";
export class UnitSchema extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.owner = "";
        this.unitType = "RESOURCE_COLLECTOR";
        this.x = 0;
        this.z = 0;
        this.vx = 0;
        this.vz = 0;
        this.rot = 0;
        this.hp = 100;
        this.tgt = "";
        this.orderType = "STOP";
        this.orderX = 0;
        this.orderZ = 0;
        this.orderTargetId = "";
        this.weaponCooldownLeft = 0;
    }
}
__decorate([
    type("string"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "id", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "owner", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "unitType", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "x", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "z", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "vx", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "vz", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "rot", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "hp", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "tgt", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "orderType", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "orderX", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "orderZ", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "orderTargetId", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], UnitSchema.prototype, "weaponCooldownLeft", void 0);
export class BaseSchema extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.owner = "";
        this.x = 0;
        this.z = 0;
        this.hp = 400;
    }
}
__decorate([
    type("string"),
    __metadata("design:type", Object)
], BaseSchema.prototype, "id", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], BaseSchema.prototype, "owner", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], BaseSchema.prototype, "x", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], BaseSchema.prototype, "z", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], BaseSchema.prototype, "hp", void 0);
export class ResourceNodeSchema extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.x = 0;
        this.z = 0;
        this.amount = 500;
    }
}
__decorate([
    type("string"),
    __metadata("design:type", Object)
], ResourceNodeSchema.prototype, "id", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], ResourceNodeSchema.prototype, "x", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], ResourceNodeSchema.prototype, "z", void 0);
__decorate([
    type("number"),
    __metadata("design:type", Object)
], ResourceNodeSchema.prototype, "amount", void 0);
export class LobbyPlayerSchema extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "";
        this.ready = false;
    }
}
__decorate([
    type("string"),
    __metadata("design:type", Object)
], LobbyPlayerSchema.prototype, "id", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], LobbyPlayerSchema.prototype, "name", void 0);
__decorate([
    type("boolean"),
    __metadata("design:type", Object)
], LobbyPlayerSchema.prototype, "ready", void 0);
export class LobbyRoomSchema extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "";
        this.mode = "";
        this.hostId = "";
        this.hostName = "";
        this.players = new MapSchema();
    }
}
__decorate([
    type("string"),
    __metadata("design:type", Object)
], LobbyRoomSchema.prototype, "id", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], LobbyRoomSchema.prototype, "name", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], LobbyRoomSchema.prototype, "mode", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], LobbyRoomSchema.prototype, "hostId", void 0);
__decorate([
    type("string"),
    __metadata("design:type", Object)
], LobbyRoomSchema.prototype, "hostName", void 0);
__decorate([
    type({ map: LobbyPlayerSchema }),
    __metadata("design:type", Object)
], LobbyRoomSchema.prototype, "players", void 0);
export class SpaceState extends Schema {
    constructor() {
        super(...arguments);
        this.units = new MapSchema();
        this.bases = new MapSchema();
        this.resources = new MapSchema();
        this.lobbyRooms = new MapSchema();
    }
}
__decorate([
    type({ map: UnitSchema }),
    __metadata("design:type", Object)
], SpaceState.prototype, "units", void 0);
__decorate([
    type({ map: BaseSchema }),
    __metadata("design:type", Object)
], SpaceState.prototype, "bases", void 0);
__decorate([
    type({ map: ResourceNodeSchema }),
    __metadata("design:type", Object)
], SpaceState.prototype, "resources", void 0);
__decorate([
    type({ map: LobbyRoomSchema }),
    __metadata("design:type", Object)
], SpaceState.prototype, "lobbyRooms", void 0);
