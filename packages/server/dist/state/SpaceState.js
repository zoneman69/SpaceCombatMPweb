var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
import { Schema, type, MapSchema } from "@colyseus/schema";
let UnitSchema = (() => {
    let _classSuper = Schema;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _owner_decorators;
    let _owner_initializers = [];
    let _owner_extraInitializers = [];
    let _x_decorators;
    let _x_initializers = [];
    let _x_extraInitializers = [];
    let _z_decorators;
    let _z_initializers = [];
    let _z_extraInitializers = [];
    let _vx_decorators;
    let _vx_initializers = [];
    let _vx_extraInitializers = [];
    let _vz_decorators;
    let _vz_initializers = [];
    let _vz_extraInitializers = [];
    let _rot_decorators;
    let _rot_initializers = [];
    let _rot_extraInitializers = [];
    let _hp_decorators;
    let _hp_initializers = [];
    let _hp_extraInitializers = [];
    let _tgt_decorators;
    let _tgt_initializers = [];
    let _tgt_extraInitializers = [];
    let _orderType_decorators;
    let _orderType_initializers = [];
    let _orderType_extraInitializers = [];
    let _orderX_decorators;
    let _orderX_initializers = [];
    let _orderX_extraInitializers = [];
    let _orderZ_decorators;
    let _orderZ_initializers = [];
    let _orderZ_extraInitializers = [];
    let _orderTargetId_decorators;
    let _orderTargetId_initializers = [];
    let _orderTargetId_extraInitializers = [];
    let _weaponCooldownLeft_decorators;
    let _weaponCooldownLeft_initializers = [];
    let _weaponCooldownLeft_extraInitializers = [];
    return class UnitSchema extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _id_decorators = [type("string")];
            _owner_decorators = [type("string")];
            _x_decorators = [type("number")];
            _z_decorators = [type("number")];
            _vx_decorators = [type("number")];
            _vz_decorators = [type("number")];
            _rot_decorators = [type("number")];
            _hp_decorators = [type("number")];
            _tgt_decorators = [type("string")];
            _orderType_decorators = [type("string")];
            _orderX_decorators = [type("number")];
            _orderZ_decorators = [type("number")];
            _orderTargetId_decorators = [type("string")];
            _weaponCooldownLeft_decorators = [type("number")];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _owner_decorators, { kind: "field", name: "owner", static: false, private: false, access: { has: obj => "owner" in obj, get: obj => obj.owner, set: (obj, value) => { obj.owner = value; } }, metadata: _metadata }, _owner_initializers, _owner_extraInitializers);
            __esDecorate(null, null, _x_decorators, { kind: "field", name: "x", static: false, private: false, access: { has: obj => "x" in obj, get: obj => obj.x, set: (obj, value) => { obj.x = value; } }, metadata: _metadata }, _x_initializers, _x_extraInitializers);
            __esDecorate(null, null, _z_decorators, { kind: "field", name: "z", static: false, private: false, access: { has: obj => "z" in obj, get: obj => obj.z, set: (obj, value) => { obj.z = value; } }, metadata: _metadata }, _z_initializers, _z_extraInitializers);
            __esDecorate(null, null, _vx_decorators, { kind: "field", name: "vx", static: false, private: false, access: { has: obj => "vx" in obj, get: obj => obj.vx, set: (obj, value) => { obj.vx = value; } }, metadata: _metadata }, _vx_initializers, _vx_extraInitializers);
            __esDecorate(null, null, _vz_decorators, { kind: "field", name: "vz", static: false, private: false, access: { has: obj => "vz" in obj, get: obj => obj.vz, set: (obj, value) => { obj.vz = value; } }, metadata: _metadata }, _vz_initializers, _vz_extraInitializers);
            __esDecorate(null, null, _rot_decorators, { kind: "field", name: "rot", static: false, private: false, access: { has: obj => "rot" in obj, get: obj => obj.rot, set: (obj, value) => { obj.rot = value; } }, metadata: _metadata }, _rot_initializers, _rot_extraInitializers);
            __esDecorate(null, null, _hp_decorators, { kind: "field", name: "hp", static: false, private: false, access: { has: obj => "hp" in obj, get: obj => obj.hp, set: (obj, value) => { obj.hp = value; } }, metadata: _metadata }, _hp_initializers, _hp_extraInitializers);
            __esDecorate(null, null, _tgt_decorators, { kind: "field", name: "tgt", static: false, private: false, access: { has: obj => "tgt" in obj, get: obj => obj.tgt, set: (obj, value) => { obj.tgt = value; } }, metadata: _metadata }, _tgt_initializers, _tgt_extraInitializers);
            __esDecorate(null, null, _orderType_decorators, { kind: "field", name: "orderType", static: false, private: false, access: { has: obj => "orderType" in obj, get: obj => obj.orderType, set: (obj, value) => { obj.orderType = value; } }, metadata: _metadata }, _orderType_initializers, _orderType_extraInitializers);
            __esDecorate(null, null, _orderX_decorators, { kind: "field", name: "orderX", static: false, private: false, access: { has: obj => "orderX" in obj, get: obj => obj.orderX, set: (obj, value) => { obj.orderX = value; } }, metadata: _metadata }, _orderX_initializers, _orderX_extraInitializers);
            __esDecorate(null, null, _orderZ_decorators, { kind: "field", name: "orderZ", static: false, private: false, access: { has: obj => "orderZ" in obj, get: obj => obj.orderZ, set: (obj, value) => { obj.orderZ = value; } }, metadata: _metadata }, _orderZ_initializers, _orderZ_extraInitializers);
            __esDecorate(null, null, _orderTargetId_decorators, { kind: "field", name: "orderTargetId", static: false, private: false, access: { has: obj => "orderTargetId" in obj, get: obj => obj.orderTargetId, set: (obj, value) => { obj.orderTargetId = value; } }, metadata: _metadata }, _orderTargetId_initializers, _orderTargetId_extraInitializers);
            __esDecorate(null, null, _weaponCooldownLeft_decorators, { kind: "field", name: "weaponCooldownLeft", static: false, private: false, access: { has: obj => "weaponCooldownLeft" in obj, get: obj => obj.weaponCooldownLeft, set: (obj, value) => { obj.weaponCooldownLeft = value; } }, metadata: _metadata }, _weaponCooldownLeft_initializers, _weaponCooldownLeft_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        id = __runInitializers(this, _id_initializers, "");
        owner = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _owner_initializers, ""));
        x = (__runInitializers(this, _owner_extraInitializers), __runInitializers(this, _x_initializers, 0));
        z = (__runInitializers(this, _x_extraInitializers), __runInitializers(this, _z_initializers, 0));
        vx = (__runInitializers(this, _z_extraInitializers), __runInitializers(this, _vx_initializers, 0));
        vz = (__runInitializers(this, _vx_extraInitializers), __runInitializers(this, _vz_initializers, 0));
        rot = (__runInitializers(this, _vz_extraInitializers), __runInitializers(this, _rot_initializers, 0));
        hp = (__runInitializers(this, _rot_extraInitializers), __runInitializers(this, _hp_initializers, 100));
        tgt = (__runInitializers(this, _hp_extraInitializers), __runInitializers(this, _tgt_initializers, ""));
        orderType = (__runInitializers(this, _tgt_extraInitializers), __runInitializers(this, _orderType_initializers, "STOP"));
        orderX = (__runInitializers(this, _orderType_extraInitializers), __runInitializers(this, _orderX_initializers, 0));
        orderZ = (__runInitializers(this, _orderX_extraInitializers), __runInitializers(this, _orderZ_initializers, 0));
        orderTargetId = (__runInitializers(this, _orderZ_extraInitializers), __runInitializers(this, _orderTargetId_initializers, ""));
        weaponCooldownLeft = (__runInitializers(this, _orderTargetId_extraInitializers), __runInitializers(this, _weaponCooldownLeft_initializers, 0));
        constructor() {
            super(...arguments);
            __runInitializers(this, _weaponCooldownLeft_extraInitializers);
        }
    };
})();
export { UnitSchema };
let SpaceState = (() => {
    let _classSuper = Schema;
    let _units_decorators;
    let _units_initializers = [];
    let _units_extraInitializers = [];
    return class SpaceState extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _units_decorators = [type({ map: UnitSchema })];
            __esDecorate(null, null, _units_decorators, { kind: "field", name: "units", static: false, private: false, access: { has: obj => "units" in obj, get: obj => obj.units, set: (obj, value) => { obj.units = value; } }, metadata: _metadata }, _units_initializers, _units_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        units = __runInitializers(this, _units_initializers, new MapSchema());
        constructor() {
            super(...arguments);
            __runInitializers(this, _units_extraInitializers);
        }
    };
})();
export { SpaceState };
