import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import type {
  BaseSchema,
  BaseModuleSchema,
  ResourceNodeSchema,
  SpaceState,
  UnitSchema,
} from "@space-combat/shared";

type TacticalViewProps = {
  room: Room<SpaceState> | null;
  localSessionId: string | null;
  onExit?: () => void;
};

type Selection = { id: string } | null;
type CameraMode = "squad" | "selected" | "free";

type UnitRender = {
  mesh: THREE.Mesh;
  owner: string;
  attachmentGroup: THREE.Group;
  thrusters: THREE.Mesh[];
  attachmentSignature: string;
  usesImportedMaterial: boolean;
  selectionOutline: THREE.LineSegments | null;
  selectionOutlineGeometrySource: string | null;
};

type MapRender = {
  mesh: THREE.Mesh;
};

type ModuleRender = {
  mesh: THREE.Mesh;
};

type DebugUnit = {
  id: string;
  owner: string;
  x: number;
  z: number;
};

type FiringEffect = {
  line: THREE.Line;
  ttl: number;
  maxTtl: number;
  fromId: string;
  toId: string;
};

const getUnitFogRadius = (unit: UnitSchema | DebugUnit) => {
  if ("unitType" in unit) {
    const bonus = unit.radarRangeBonus ?? 0;
    return unit.unitType === "FIGHTER"
      ? FOG_FIGHTER_VISION_RADIUS + bonus
      : FOG_COLLECTOR_VISION_RADIUS + bonus;
  }
  return FOG_COLLECTOR_VISION_RADIUS;
};

const UNIT_COLORS = {
  friendly: new THREE.Color("#7dd3fc"),
  enemy: new THREE.Color("#f87171"),
  selected: new THREE.Color("#facc15"),
};
const BASE_COLOR = new THREE.Color("#a855f7");
const RESOURCE_COLOR = new THREE.Color("#34d399");
const MODULE_COLORS = {
  TECH_SHOP: new THREE.Color("#38bdf8"),
  REPAIR_BAY: new THREE.Color("#f472b6"),
  GARAGE: new THREE.Color("#fbbf24"),
  WEAPON_TURRET: new THREE.Color("#fb7185"),
};

const PLANE_SIZE = 720;
const GRID_DIVISIONS = 36;
const CAMERA_HEIGHT = 190;
const CAMERA_DISTANCE = 300;
const CAMERA_LERP_SPEED = 2.5;
const CAMERA_ROTATE_SPEED = 0.005;
const CAMERA_PAN_SPEED = 0.9;
const CAMERA_KEY_PAN_SPEED = 12;
const CAMERA_ZOOM_SPEED = 0.25;
const CAMERA_PITCH_MIN = 0.2;
const CAMERA_PITCH_MAX = 1.25;
const CAMERA_RADIUS_MIN = 80;
const CAMERA_RADIUS_MAX = 620;
const MOVE_EPSILON = 0.25;
const THRUSTER_SPEED_THRESHOLD = 0.45;
const THRUSTER_MAX_SCALE_Z = 1.6;
const RESOURCE_COLLECTOR_COST = 100;
const FIGHTER_COST = 150;
const UNIT_WEAPON_MOUNT_COST = 80;
const MODULE_TECH_SHOP_COST = 240;
const MODULE_REPAIR_BAY_COST = 200;
const MODULE_GARAGE_COST = 260;
const MODULE_WEAPON_TURRET_COST = 140;
const TECH_UPGRADE_COSTS = {
  SHIELDS: 80,
  HULL: 90,
  SPEED: 110,
  RADAR: 75,
  WEAPON: 120,
  STORAGE: 100,
};
const LAB_RESEARCH_TREE = [
  {
    key: "REPAIR_BAY",
    title: "Repair Bay Protocols",
    description: "Unlock repair bay station module.",
    cost: 120,
    durationSeconds: 15,
    prerequisiteKeys: [],
    unlockedBy: "researchRepairBay",
  },
  {
    key: "GARAGE",
    title: "Garage Tooling",
    description: "Unlock garage station module.",
    cost: 140,
    durationSeconds: 18,
    prerequisiteKeys: [],
    unlockedBy: "researchGarage",
  },
  {
    key: "WEAPON_TURRET",
    title: "Orbital Turret Grid",
    description: "Unlock weapon turret station module.",
    cost: 160,
    durationSeconds: 20,
    prerequisiteKeys: [],
    unlockedBy: "researchWeaponTurret",
  },
  {
    key: "PLASMA_WEAPONS",
    title: "Plasma Weapons",
    description: "Tier 2 weapon unlock with higher damage and slight AoE.",
    cost: 130,
    durationSeconds: 16,
    prerequisiteKeys: [],
    unlockedBy: "researchPlasma",
  },
  {
    key: "RAIL_WEAPONS",
    title: "Rail Weapons",
    description: "Tier 2 weapon unlock with high single-target hitscan damage.",
    cost: 150,
    durationSeconds: 18,
    prerequisiteKeys: [],
    unlockedBy: "researchRail",
  },
  {
    key: "MISSILE_SYSTEMS",
    title: "Missile Systems",
    description: "Tier 2 weapon unlock with tracking projectiles.",
    cost: 170,
    durationSeconds: 20,
    prerequisiteKeys: [],
    unlockedBy: "researchMissile",
  },
  {
    key: "FUSION_PLASMA",
    title: "Fusion Plasma",
    description: "Tier 3 plasma upgrade (larger AoE and burn-ready platform).",
    cost: 210,
    durationSeconds: 24,
    prerequisiteKeys: ["PLASMA_WEAPONS"],
    unlockedBy: "researchFusionPlasma",
  },
  {
    key: "GAUSS_RAILGUN",
    title: "Gauss Railgun",
    description: "Tier 3 rail upgrade with stronger armor penetration profile.",
    cost: 220,
    durationSeconds: 24,
    prerequisiteKeys: ["RAIL_WEAPONS"],
    unlockedBy: "researchGaussRail",
  },
  {
    key: "SMART_MISSILES",
    title: "Smart Missiles",
    description: "Tier 3 missile upgrade with better tracking and warheads.",
    cost: 230,
    durationSeconds: 24,
    prerequisiteKeys: ["MISSILE_SYSTEMS"],
    unlockedBy: "researchSmartMissile",
  },
  {
    key: "WEAPON_LEVEL_1",
    title: "Weapon Upgrade Lv1",
    description: "+15% damage to all weapon families.",
    cost: 120,
    durationSeconds: 14,
    prerequisiteKeys: [],
    unlockedBy: "researchWeaponLevel1",
  },
  {
    key: "WEAPON_LEVEL_2",
    title: "Weapon Upgrade Lv2",
    description: "+30% damage and +10% fire rate to all weapon families.",
    cost: 180,
    durationSeconds: 18,
    prerequisiteKeys: ["WEAPON_LEVEL_1"],
    unlockedBy: "researchWeaponLevel2",
  },
  {
    key: "WEAPON_LEVEL_3",
    title: "Weapon Upgrade Lv3",
    description: "+50% damage, +20% fire rate, and special trait unlock hooks.",
    cost: 240,
    durationSeconds: 24,
    prerequisiteKeys: ["WEAPON_LEVEL_2"],
    unlockedBy: "researchWeaponLevel3",
  },
  {
    key: "SHIELDS",
    title: "Shield Amplifiers",
    description: "Enable shield upgrades in the lab.",
    cost: 130,
    durationSeconds: 16,
    prerequisiteKeys: [],
    unlockedBy: "researchShields",
  },
  {
    key: "HULL",
    title: "Hull Reinforcement",
    description: "Enable hull upgrades in the lab.",
    cost: 140,
    durationSeconds: 18,
    prerequisiteKeys: [],
    unlockedBy: "researchHull",
  },
  {
    key: "SPEED",
    title: "Engine Overdrive",
    description: "Enable speed upgrades in the lab.",
    cost: 155,
    durationSeconds: 20,
    prerequisiteKeys: [],
    unlockedBy: "researchSpeed",
  },
  {
    key: "RADAR",
    title: "Deep Radar",
    description: "Enable radar upgrades in the lab.",
    cost: 125,
    durationSeconds: 14,
    prerequisiteKeys: [],
    unlockedBy: "researchRadar",
  },
  {
    key: "TARGETING_SYSTEMS",
    title: "Targeting Systems",
    description: "Advanced tracking, predictive aiming, and target lock speed.",
    cost: 175,
    durationSeconds: 20,
    prerequisiteKeys: ["RADAR"],
    unlockedBy: "researchTargeting",
  },
  {
    key: "POWER_CORE",
    title: "Power Core",
    description: "Improves regen/fire throughput and unlocks overdrive hooks.",
    cost: 185,
    durationSeconds: 22,
    prerequisiteKeys: ["SHIELDS", "SPEED"],
    unlockedBy: "researchPowerCore",
  },
  {
    key: "ECM_STEALTH",
    title: "ECM / Stealth",
    description: "Radar suppression and lock disruption for stealth gameplay.",
    cost: 195,
    durationSeconds: 22,
    prerequisiteKeys: ["RADAR"],
    unlockedBy: "researchECM",
  },
] as const;
const MAX_UNIT_WEAPON_MOUNTS = 3;
const WEAPON_TURRET_RING_COUNT = 8;
const MODULE_INTERACTION_RANGE = 6;
const RESOURCE_SCALE_MIN = 0.5;
const RESOURCE_SCALE_MAX = 1.6;
const SELECTION_DRAG_THRESHOLD = 6;
const FOG_FIGHTER_VISION_RADIUS = 30;
const FOG_COLLECTOR_VISION_RADIUS = 60;
const FOG_BASE_VISION_RADIUS = 100;
const FOG_VISIBILITY_EPSILON = 0.01;
const WEAPON_TYPES = [
  "LASER",
  "PLASMA",
  "RAIL",
  "MISSILE",
  "FUSION_PLASMA",
  "GAUSS_RAIL",
  "SMART_MISSILE",
] as const;
const FIGHTER_MODEL_PATH = "assets/models/fighter.glb";
const COLLECTOR_MODEL_PATH = "assets/models/collector.glb";
const STORAGE_CONTAINER_MODEL_PATH = "assets/models/storage_container.glb";
const FIGHTER_MODEL_TARGET_SIZE = 6;
const COLLECTOR_MODEL_TARGET_SIZE = 6.5;
const STORAGE_CONTAINER_MODEL_TARGET_SIZE = 1.8;
const COLLECTOR_BASE_CAPACITY = 25;
const COLLECTOR_TANK_CAPACITY_STEP = 25;
const COLLECTOR_MAX_TANK_UPGRADES = 4;
const COLLECTOR_MAX_STORAGE_BONUS =
  COLLECTOR_TANK_CAPACITY_STEP * COLLECTOR_MAX_TANK_UPGRADES;
const MAX_SHIP_TECH_UPGRADE_LEVEL = 3;
const DEBUG_COLLECTOR_ATTACHMENTS = true;
const USE_COLLECTOR_MODEL_TANK_SOCKETS = true;

const resolveRuntimeAssetUrl = (assetPath: string) => {
  const normalizedBase = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${normalizedBase}${assetPath}`;
};

const getCollectorTankUpgradeCount = (unit: UnitSchema | DebugUnit) => {
  if (!("cargoCapacity" in unit)) {
    return 0;
  }
  const capacityDelta = Math.max(0, unit.cargoCapacity - COLLECTOR_BASE_CAPACITY);
  return Math.min(
    COLLECTOR_MAX_TANK_UPGRADES,
    Math.floor(capacityDelta / COLLECTOR_TANK_CAPACITY_STEP),
  );
};

export default function TacticalView({
  room,
  localSessionId,
  onExit,
}: TacticalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const requestRef = useRef<number | null>(null);
  const unitsRef = useRef<SpaceState["units"] | null>(null);
  const basesRef = useRef<SpaceState["bases"] | null>(null);
  const modulesRef = useRef<SpaceState["modules"] | null>(null);
  const resourcesRef = useRef<SpaceState["resources"] | null>(null);
  const meshesRef = useRef<Map<string, UnitRender>>(new Map());
  const baseMeshesRef = useRef<Map<string, MapRender>>(new Map());
  const moduleMeshesRef = useRef<Map<string, ModuleRender>>(new Map());
  const resourceMeshesRef = useRef<Map<string, MapRender>>(new Map());
  const fallbackUnitsRef = useRef<Map<string, DebugUnit>>(new Map());
  const collectorAttachmentDebugRef = useRef<Map<string, string>>(new Map());
  const localSessionIdRef = useRef<string | null>(localSessionId);
  const selectionRef = useRef<Selection>(null);
  const selectedBaseIdRef = useRef<string | null>(null);
  const selectedModuleIdRef = useRef<string | null>(null);
  const cameraModeRef = useRef<CameraMode>("squad");
  const firingEffectsRef = useRef<FiringEffect[]>([]);
  const weaponCooldownsRef = useRef<Map<string, number>>(new Map());
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraDesiredTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraYawRef = useRef(0);
  const cameraPitchRef = useRef(
    Math.atan2(CAMERA_HEIGHT, CAMERA_DISTANCE),
  );
  const cameraRadiusRef = useRef(
    Math.sqrt(CAMERA_HEIGHT ** 2 + CAMERA_DISTANCE ** 2),
  );
  const dragStateRef = useRef<{
    mode: "select" | "pan" | "rotate" | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    active: boolean;
    moved: boolean;
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    active: false,
    moved: false,
  });
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [selectedHp, setSelectedHp] = useState(0);
  const [selectedShields, setSelectedShields] = useState(0);
  const [selectedSpeed, setSelectedSpeed] = useState(0);
  const [unitCount, setUnitCount] = useState(0);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("squad");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectionBox, setSelectionBox] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    visible: boolean;
  }>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    visible: false,
  });
  const [isPointerInsideCanvas, setIsPointerInsideCanvas] = useState(false);
  const [lastResourceClick, setLastResourceClick] = useState<{
    id: string;
    at: number;
  } | null>(null);
  const [debugInfo, setDebugInfo] = useState({
    roomId: "n/a",
    sessionId: "n/a",
    hasRoom: false,
    hasUnits: false,
    unitTotal: 0,
  });
  const [moduleWeaponType, setModuleWeaponType] =
    useState<(typeof WEAPON_TYPES)[number]>("LASER");
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);
  const [isGarageModalOpen, setIsGarageModalOpen] = useState(false);
  const [isUnitModalOpen, setIsUnitModalOpen] = useState(false);
  const [isBaseModalOpen, setIsBaseModalOpen] = useState(false);
  const [isModuleModalOpen, setIsModuleModalOpen] = useState(false);
  const [shouldAutoOpenLabAfterPurchase, setShouldAutoOpenLabAfterPurchase] =
    useState(false);

  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const targetPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    [],
  );

  useEffect(() => {
    document.body.classList.toggle(
      "tactical-view-scroll-locked",
      isPointerInsideCanvas,
    );
    return () => {
      document.body.classList.remove("tactical-view-scroll-locked");
    };
  }, [isPointerInsideCanvas]);

  useEffect(() => {
    localSessionIdRef.current = localSessionId;
  }, [localSessionId]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPointerInsideCanvas || !cameraRef.current) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      let forwardAmount = 0;
      let rightAmount = 0;
      switch (event.key) {
        case "w":
        case "W":
        case "ArrowUp":
          forwardAmount = 1;
          break;
        case "s":
        case "S":
        case "ArrowDown":
          forwardAmount = -1;
          break;
        case "a":
        case "A":
        case "ArrowLeft":
          rightAmount = -1;
          break;
        case "d":
        case "D":
        case "ArrowRight":
          rightAmount = 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      const camera = cameraRef.current;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      const panStep = Math.min(
        40,
        Math.max(6, (cameraRadiusRef.current / 300) * CAMERA_KEY_PAN_SPEED),
      );
      cameraTargetRef.current.addScaledVector(forward, forwardAmount * panStep);
      cameraTargetRef.current.addScaledVector(right, rightAmount * panStep);
      setCameraMode("free");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPointerInsideCanvas]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    selectedBaseIdRef.current = selectedBaseId;
  }, [selectedBaseId]);

  useEffect(() => {
    selectedModuleIdRef.current = selectedModuleId;
  }, [selectedModuleId]);

  useEffect(() => {
    if (!room) {
      return;
    }
    room.send("lobby:ensureWorld");
    room.send("debug:dumpUnits");
  }, [room]);

  useEffect(() => {
    if (!room) {
      return;
    }
    let attempts = 0;
    const interval = window.setInterval(() => {
      if (
        room.state?.units?.size &&
        room.state?.bases?.size &&
        room.state?.resources?.size
      ) {
        return;
      }
      room.send("lobby:ensureWorld");
      room.send("debug:dumpUnits");
      attempts += 1;
      if (attempts >= 5) {
        window.clearInterval(interval);
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [room]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1226");

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    rendererRef.current = renderer;
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1200);
    camera.position.set(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const grid = new THREE.GridHelper(
      PLANE_SIZE,
      GRID_DIVISIONS,
      "#2a3b64",
      "#1d2a4c",
    );
    scene.add(grid);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const rim = new THREE.DirectionalLight(0x86efac, 0.6);
    rim.position.set(-60, 90, 120);
    scene.add(rim);

    const fighterGeometry = new THREE.ConeGeometry(2.2, 6, 12);
    fighterGeometry.rotateZ(-Math.PI / 2);
    fighterGeometry.translate(0.8, 0, 0);
    const fighterModelUrl = resolveRuntimeAssetUrl(FIGHTER_MODEL_PATH);
    const collectorModelUrl = resolveRuntimeAssetUrl(COLLECTOR_MODEL_PATH);
    const storageContainerModelUrl = resolveRuntimeAssetUrl(STORAGE_CONTAINER_MODEL_PATH);
    let loadedFighterGeometry: THREE.BufferGeometry | null = null;
    let loadedCollectorGeometry: THREE.BufferGeometry | null = null;
    let loadedStorageContainerGeometry: THREE.BufferGeometry | null = null;
    let loadedFighterMaterial:
      | THREE.Material
      | THREE.Material[]
      | null = null;
    let loadedCollectorMaterial:
      | THREE.Material
      | THREE.Material[]
      | null = null;
    let isDisposed = false;

    const collectorBody = new THREE.BoxGeometry(4.6, 2.6, 2.8);
    const collectorNose = new THREE.ConeGeometry(1.5, 2.8, 10);
    collectorNose.rotateZ(-Math.PI / 2);
    collectorNose.translate(3.4, 0, 0);
    const collectorGeometry =
      mergeGeometries([collectorBody, collectorNose]) ?? collectorBody.clone();
    collectorBody.dispose();
    collectorNose.dispose();

    const getUnitGeometry = (unit: UnitSchema | DebugUnit) => {
      if ("unitType" in unit && unit.unitType === "FIGHTER") {
        return loadedFighterGeometry ?? fighterGeometry;
      }
      return loadedCollectorGeometry ?? collectorGeometry;
    };
    const defaultFighterWeaponMountPoints = [
      new THREE.Vector3(0.8, 0.2, -0.9),
      new THREE.Vector3(0.8, 0.2, 0.9),
      new THREE.Vector3(-0.1, 0.35, 0),
    ];
    const defaultCollectorTankMountPoints = [
      new THREE.Vector3(-1.2, 0.9, -1.3),
      new THREE.Vector3(-1.2, 0.9, 1.3),
      new THREE.Vector3(-2.8, 0.9, -1.3),
      new THREE.Vector3(-2.8, 0.9, 1.3),
    ];
    const defaultFighterThrusterMountPoints = [
      new THREE.Vector3(-1.5, 0.15, -0.9),
      new THREE.Vector3(-1.5, 0.15, 0.9),
    ];
    const defaultCollectorThrusterMountPoints = [
      new THREE.Vector3(-2.9, 0.2, -0.75),
      new THREE.Vector3(-2.9, 0.2, 0.75),
    ];
    const defaultCollectorWeaponMountPoint = new THREE.Vector3(2.3, 0.65, 0);
    let fighterWeaponMountPoints = [...defaultFighterWeaponMountPoints];
    let collectorTankMountPoints = [...defaultCollectorTankMountPoints];
    let fighterThrusterMountPoints = [...defaultFighterThrusterMountPoints];
    let collectorThrusterMountPoints = [...defaultCollectorThrusterMountPoints];
    let collectorWeaponMountPoint = defaultCollectorWeaponMountPoint.clone();
    const fighterWeaponGeometry = new THREE.BoxGeometry(0.85, 0.35, 0.35);
    const collectorTankGeometry = new THREE.CylinderGeometry(0.38, 0.38, 1.65, 12);
    collectorTankGeometry.rotateZ(Math.PI / 2);
    const collectorWeaponGeometry = new THREE.CylinderGeometry(0.2, 0.2, 1.7, 12);
    collectorWeaponGeometry.rotateZ(Math.PI / 2);
    const thrusterGeometry = new THREE.ConeGeometry(0.3, 1.5, 10);
    // Thruster flame should point backward on the ship's local X axis.
    thrusterGeometry.rotateZ(Math.PI / 2);
    thrusterGeometry.translate(0.75, 0, 0);

    const createThrusters = (unit: UnitSchema | DebugUnit) => {
      if (!("unitType" in unit)) {
        return [];
      }
      const thrusterOffsets =
        unit.unitType === "FIGHTER"
          ? fighterThrusterMountPoints
          : collectorThrusterMountPoints;
      return thrusterOffsets.map((offset) => {
        const thruster = new THREE.Mesh(
          thrusterGeometry.clone(),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color("#60a5fa"),
            transparent: true,
            opacity: 0,
            depthWrite: false,
          }),
        );
        thruster.position.copy(offset);
        thruster.visible = false;
        return thruster;
      });
    };

    const replaceRenderThrusters = (unit: UnitSchema | DebugUnit, render: UnitRender) => {
      render.thrusters.forEach((thruster) => {
        render.mesh.remove(thruster);
        thruster.geometry.dispose();
        (thruster.material as THREE.Material).dispose();
      });
      render.thrusters = createThrusters(unit);
      render.thrusters.forEach((thruster) => render.mesh.add(thruster));
    };

    const updateUnitAttachments = (
      unit: UnitSchema | DebugUnit,
      render: UnitRender,
      color: THREE.ColorRepresentation,
    ) => {
      if (!("unitType" in unit)) {
        return;
      }
      const tankCount =
        unit.unitType === "RESOURCE_COLLECTOR" ? getCollectorTankUpgradeCount(unit) : 0;
      const weaponMounts = Math.max(0, Math.min(1, unit.weaponMounts ?? 0));
      const signature = `${unit.unitType}:${tankCount}:${weaponMounts}`;
      if (signature === render.attachmentSignature) {
        return;
      }
      if (DEBUG_COLLECTOR_ATTACHMENTS && unit.unitType === "RESOURCE_COLLECTOR") {
        const previousSignature = collectorAttachmentDebugRef.current.get(unit.id);
        if (previousSignature !== signature) {
          console.log("[tactical] collector attachment recompute", {
            unitId: unit.id,
            signature,
            previousSignature: previousSignature ?? "none",
            cargo: unit.cargo,
            cargoCapacity: unit.cargoCapacity,
            tankCount,
            weaponMounts,
            hasStorageContainerGeometry: !!loadedStorageContainerGeometry,
            activeTankMountPoints: collectorTankMountPoints.map((point, index) => ({
              index,
              x: Number(point.x.toFixed(2)),
              y: Number(point.y.toFixed(2)),
              z: Number(point.z.toFixed(2)),
            })),
          });
          collectorAttachmentDebugRef.current.set(unit.id, signature);
        }
      }

      while (render.attachmentGroup.children.length > 0) {
        const child = render.attachmentGroup.children[0];
        if (!child) {
          continue;
        }
        render.attachmentGroup.remove(child);
        const childMesh = child as THREE.Mesh;
        childMesh.geometry.dispose();
        (childMesh.material as THREE.Material).dispose();
      }

      if (unit.unitType === "RESOURCE_COLLECTOR") {
        for (let index = 0; index < tankCount; index += 1) {
          const mountPoint =
            collectorTankMountPoints[index] ??
            defaultCollectorTankMountPoints[index] ??
            defaultCollectorTankMountPoints[defaultCollectorTankMountPoints.length - 1];
          if (!mountPoint) {
            continue;
          }
          const tank = new THREE.Mesh(
            (loadedStorageContainerGeometry ?? collectorTankGeometry).clone(),
            new THREE.MeshStandardMaterial({
              color,
              emissive: new THREE.Color("#0b1b3a"),
              metalness: 0.45,
              roughness: 0.45,
            }),
          );
          tank.position.copy(mountPoint);
          render.attachmentGroup.add(tank);
        }
        if (weaponMounts > 0) {
          const weapon = new THREE.Mesh(
            collectorWeaponGeometry.clone(),
            new THREE.MeshStandardMaterial({
              color,
              emissive: new THREE.Color("#0b1b3a"),
              metalness: 0.2,
              roughness: 0.35,
            }),
          );
          weapon.position.copy(collectorWeaponMountPoint);
          render.attachmentGroup.add(weapon);
        }
      } else if (unit.unitType === "FIGHTER") {
        const fighterMounts = Math.max(
          1,
          Math.min(fighterWeaponMountPoints.length, unit.weaponMounts ?? 0),
        );
        for (let index = 0; index < fighterMounts; index += 1) {
          const pod = new THREE.Mesh(
            fighterWeaponGeometry.clone(),
            new THREE.MeshStandardMaterial({
              color,
              emissive: new THREE.Color("#081324"),
              metalness: 0.3,
              roughness: 0.5,
            }),
          );
          pod.position.copy(fighterWeaponMountPoints[index]);
          render.attachmentGroup.add(pod);
        }
      }
      render.attachmentSignature = signature;
    };
    const baseGeometry = new THREE.CylinderGeometry(4.4, 5.6, 4, 12);
    const resourceGeometry = new THREE.OctahedronGeometry(3.4, 0);
    const techGeometry = new THREE.DodecahedronGeometry(2.4, 0);
    const repairCore = new THREE.BoxGeometry(1.4, 1.2, 4.2);
    const repairCross = new THREE.BoxGeometry(4.2, 1.2, 1.4);
    const repairGeometry =
      mergeGeometries([repairCore, repairCross]) ?? repairCore.clone();
    repairCore.dispose();
    repairCross.dispose();
    const garageGeometry = new THREE.BoxGeometry(3.2, 2.2, 3.2);
    const turretGeometry = new THREE.CylinderGeometry(1.6, 1.6, 2.8, 8);

    const getModuleGeometry = (module: BaseModuleSchema) => {
      switch (module.moduleType) {
        case "TECH_SHOP":
          return techGeometry;
        case "REPAIR_BAY":
          return repairGeometry;
        case "GARAGE":
          return garageGeometry;
        case "WEAPON_TURRET":
          return turretGeometry;
        default:
          return garageGeometry;
      }
    };

    const parseSocketOrder = (name: string, prefix: string) => {
      const match = name.match(new RegExp(`^${prefix}_(\\d+)$`, "i"));
      if (!match) {
        return Number.MAX_SAFE_INTEGER;
      }
      return Number.parseInt(match[1] ?? "0", 10);
    };

    const isSocketPositionUsable = (position: THREE.Vector3) => {
      if (
        !Number.isFinite(position.x) ||
        !Number.isFinite(position.y) ||
        !Number.isFinite(position.z)
      ) {
        return false;
      }
      // Guard against malformed socket transforms that place attachments far away.
      return position.lengthSq() <= 15 ** 2;
    };

    const extractNormalizedModelData = (
      gltf: GLTF,
      mesh: THREE.Mesh,
      targetSize: number,
    ) => {
      const geometry = mesh.geometry.clone();
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      const center = new THREE.Vector3();
      let scale = 1;
      if (box) {
        box.getCenter(center);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDimension = Math.max(size.x, size.y, size.z);
        if (maxDimension > 0) {
          scale = targetSize / maxDimension;
          geometry.scale(scale, scale, scale);
        }
      }
      const scaledCenter = center.multiplyScalar(scale);
      geometry.translate(-scaledCenter.x, -scaledCenter.y, -scaledCenter.z);

      gltf.scene.updateMatrixWorld(true);
      const sockets: { name: string; position: THREE.Vector3 }[] = [];
      gltf.scene.traverse((object) => {
        const normalizedName = object.name.toLowerCase();
        if (
          !normalizedName.startsWith("socket_") &&
          !normalizedName.startsWith("main_")
        ) {
          return;
        }
        const worldPosition = new THREE.Vector3();
        object.getWorldPosition(worldPosition);
        const meshLocal = mesh.worldToLocal(worldPosition.clone());
        const normalized = meshLocal.multiplyScalar(scale).sub(scaledCenter);
        sockets.push({ name: object.name, position: normalized });
      });

      return { geometry, sockets };
    };

    const cloneMaterialSet = (
      material: THREE.Material | THREE.Material[],
    ): THREE.Material | THREE.Material[] =>
      Array.isArray(material)
        ? material.map((item) => item.clone())
        : material.clone();

    const disposeMaterialSet = (
      material: THREE.Material | THREE.Material[] | null | undefined,
    ) => {
      if (!material) {
        return;
      }
      if (Array.isArray(material)) {
        material.forEach((item) => item.dispose());
        return;
      }
      material.dispose();
    };

    const inspectModelMeshMaterials = (gltf: GLTF, modelLabel: string) => {
      let meshCount = 0;
      let meshWithMaterialCount = 0;
      let meshWithTextureCount = 0;
      gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) {
          return;
        }
        meshCount += 1;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        const hasMaterial = materials.every((material) => material instanceof THREE.Material);
        if (hasMaterial) {
          meshWithMaterialCount += 1;
        }
        const hasTexture = materials.some((material) => {
          if (!(material instanceof THREE.MeshStandardMaterial)) {
            return false;
          }
          return !!material.map;
        });
        if (hasTexture) {
          meshWithTextureCount += 1;
        }
      });
      console.log(`[tactical] ${modelLabel} mesh/material inspection`, {
        meshCount,
        meshWithMaterialCount,
        meshWithTextureCount,
      });
    };

    const ensureUnitMesh = (unit: UnitSchema | DebugUnit) => {
      if (meshesRef.current.has(unit.id)) {
        return;
      }
      const importedMaterial =
        "unitType" in unit && unit.unitType === "FIGHTER"
          ? loadedFighterMaterial
          : "unitType" in unit && unit.unitType === "RESOURCE_COLLECTOR"
            ? loadedCollectorMaterial
            : null;
      const usesImportedMaterial = !!importedMaterial;
      const material = importedMaterial
        ? cloneMaterialSet(importedMaterial)
        : new THREE.MeshStandardMaterial({
            color:
              unit.owner === localSessionIdRef.current
                ? UNIT_COLORS.friendly.clone()
                : UNIT_COLORS.enemy.clone(),
            emissive: new THREE.Color("#0b1b3a"),
          });
      const mesh = new THREE.Mesh(getUnitGeometry(unit).clone(), material);
      const attachmentGroup = new THREE.Group();
      mesh.add(attachmentGroup);
      const thrusters = createThrusters(unit);
      thrusters.forEach((thruster) => mesh.add(thruster));
      mesh.position.set(unit.x, 0, unit.z);
      mesh.userData = { id: unit.id };
      scene.add(mesh);
      const color =
        unit.owner === localSessionIdRef.current
          ? UNIT_COLORS.friendly
          : UNIT_COLORS.enemy;
      const render: UnitRender = {
        mesh,
        owner: unit.owner,
        attachmentGroup,
        thrusters,
        attachmentSignature: "",
        usesImportedMaterial,
        selectionOutline: null,
        selectionOutlineGeometrySource: null,
      };
      updateUnitAttachments(unit, render, color);
      meshesRef.current.set(unit.id, render);
    };

    const applyLoadedFighterGeometry = () => {
      const units = unitsRef.current;
      if (!units || !loadedFighterGeometry) {
        return;
      }
      units.forEach((unit) => {
        if (unit.unitType !== "FIGHTER") {
          return;
        }
        const render = meshesRef.current.get(unit.id);
        if (!render) {
          return;
        }
        render.mesh.geometry.dispose();
        render.mesh.geometry = loadedFighterGeometry.clone();
        if (loadedFighterMaterial) {
          disposeMaterialSet(render.mesh.material as THREE.Material | THREE.Material[]);
          render.mesh.material = cloneMaterialSet(loadedFighterMaterial);
          render.usesImportedMaterial = true;
        }
        if (render.selectionOutline) {
          render.mesh.remove(render.selectionOutline);
          render.selectionOutline.geometry.dispose();
          (render.selectionOutline.material as THREE.Material).dispose();
          render.selectionOutline = null;
          render.selectionOutlineGeometrySource = null;
        }
        const color =
          render.owner === localSessionIdRef.current
            ? UNIT_COLORS.friendly
            : UNIT_COLORS.enemy;
        replaceRenderThrusters(unit, render);
        render.attachmentSignature = "";
        updateUnitAttachments(unit, render, color);
      });
    };

    const applyLoadedCollectorGeometry = () => {
      const units = unitsRef.current;
      if (!units || !loadedCollectorGeometry) {
        return;
      }
      units.forEach((unit) => {
        if (unit.unitType !== "RESOURCE_COLLECTOR") {
          return;
        }
        const render = meshesRef.current.get(unit.id);
        if (!render) {
          return;
        }
        render.mesh.geometry.dispose();
        render.mesh.geometry = loadedCollectorGeometry.clone();
        if (loadedCollectorMaterial) {
          disposeMaterialSet(render.mesh.material as THREE.Material | THREE.Material[]);
          render.mesh.material = cloneMaterialSet(loadedCollectorMaterial);
          render.usesImportedMaterial = true;
        }
        if (render.selectionOutline) {
          render.mesh.remove(render.selectionOutline);
          render.selectionOutline.geometry.dispose();
          (render.selectionOutline.material as THREE.Material).dispose();
          render.selectionOutline = null;
          render.selectionOutlineGeometrySource = null;
        }
        const color =
          render.owner === localSessionIdRef.current
            ? UNIT_COLORS.friendly
            : UNIT_COLORS.enemy;
        replaceRenderThrusters(unit, render);
        render.attachmentSignature = "";
        updateUnitAttachments(unit, render, color);
      });
    };

    const loadFighterModel = async () => {
      const loader = new GLTFLoader();
      try {
        const gltf = await loader.loadAsync(fighterModelUrl);
        if (isDisposed) {
          return;
        }
        inspectModelMeshMaterials(gltf, "fighter");
        let fighterMesh: THREE.Mesh | null = null;
        gltf.scene.traverse((object) => {
          if (
            !fighterMesh &&
            object instanceof THREE.Mesh &&
            object.material
          ) {
            fighterMesh = object;
          }
        });
        if (!fighterMesh) {
          console.warn(
            `[tactical] fighter model at ${fighterModelUrl} had no mesh; using primitive fallback`,
          );
          return;
        }
        loadedFighterGeometry?.dispose();
        const fighterModelData = extractNormalizedModelData(
          gltf,
          fighterMesh,
          FIGHTER_MODEL_TARGET_SIZE,
        );
        loadedFighterGeometry = fighterModelData.geometry;
        disposeMaterialSet(loadedFighterMaterial);
        loadedFighterMaterial = cloneMaterialSet(
          fighterMesh.material as THREE.Material | THREE.Material[],
        );
        const fighterSockets = fighterModelData.sockets
          .filter((socket) => socket.name.toLowerCase().startsWith("socket_weapon_"))
          .sort(
            (a, b) =>
              parseSocketOrder(a.name, "socket_weapon") -
              parseSocketOrder(b.name, "socket_weapon"),
          )
          .map((socket) => socket.position);
        if (fighterSockets.length > 0) {
          fighterWeaponMountPoints = fighterSockets;
          console.log(
            `[tactical] using ${fighterSockets.length} fighter weapon sockets from model`,
          );
        } else {
          fighterWeaponMountPoints = [...defaultFighterWeaponMountPoints];
        }
        const fighterThrusterSockets = fighterModelData.sockets
          .filter((socket) =>
            socket.name.toLowerCase().startsWith("main_thruster_mount_"),
          )
          .sort(
            (a, b) =>
              parseSocketOrder(a.name, "main_thruster_mount") -
              parseSocketOrder(b.name, "main_thruster_mount"),
          )
          .map((socket) => socket.position)
          .filter((socket) => isSocketPositionUsable(socket));
        fighterThrusterMountPoints =
          fighterThrusterSockets.length > 0
            ? fighterThrusterSockets
            : [...defaultFighterThrusterMountPoints];
        applyLoadedFighterGeometry();
        if (fighterThrusterSockets.length > 0) {
          console.log(
            `[tactical] using ${fighterThrusterSockets.length} fighter thruster mount(s) from model`,
          );
        }
        console.log(
          `[tactical] loaded fighter GLB model from ${fighterModelUrl}`,
        );
      } catch (error) {
        console.warn(
          `[tactical] failed to load fighter GLB model from ${fighterModelUrl}; using primitive fallback`,
          error,
        );
      }
    };

    const loadCollectorModel = async () => {
      const loader = new GLTFLoader();
      try {
        const gltf = await loader.loadAsync(collectorModelUrl);
        if (isDisposed) {
          return;
        }
        inspectModelMeshMaterials(gltf, "collector");
        let collectorMesh: THREE.Mesh | null = null;
        gltf.scene.traverse((object) => {
          if (
            !collectorMesh &&
            object instanceof THREE.Mesh &&
            object.material
          ) {
            collectorMesh = object;
          }
        });
        if (!collectorMesh) {
          console.warn(
            `[tactical] collector model at ${collectorModelUrl} had no mesh; using primitive fallback`,
          );
          return;
        }
        loadedCollectorGeometry?.dispose();
        const collectorModelData = extractNormalizedModelData(
          gltf,
          collectorMesh,
          COLLECTOR_MODEL_TARGET_SIZE,
        );
        loadedCollectorGeometry = collectorModelData.geometry;
        disposeMaterialSet(loadedCollectorMaterial);
        loadedCollectorMaterial = cloneMaterialSet(
          collectorMesh.material as THREE.Material | THREE.Material[],
        );
        const collectorWeaponSockets = collectorModelData.sockets
          .filter((socket) => socket.name.toLowerCase().startsWith("socket_weapon_"))
          .sort(
            (a, b) =>
              parseSocketOrder(a.name, "socket_weapon") -
              parseSocketOrder(b.name, "socket_weapon"),
          );
        const usableCollectorWeaponSocket = collectorWeaponSockets.find((socket) =>
          isSocketPositionUsable(socket.position),
        );
        collectorWeaponMountPoint =
          usableCollectorWeaponSocket?.position.clone() ??
          defaultCollectorWeaponMountPoint.clone();
        const collectorTankSockets = collectorModelData.sockets
          .filter((socket) => socket.name.toLowerCase().startsWith("socket_tank_"))
          .sort(
            (a, b) =>
              parseSocketOrder(a.name, "socket_tank") -
              parseSocketOrder(b.name, "socket_tank"),
          )
          .map((socket) => socket.position);
        const usableCollectorTankSockets = collectorTankSockets
          .filter((socket) => isSocketPositionUsable(socket))
          .slice(0, defaultCollectorTankMountPoints.length);
        collectorTankMountPoints = [...defaultCollectorTankMountPoints];
        if (USE_COLLECTOR_MODEL_TANK_SOCKETS) {
          usableCollectorTankSockets.forEach((socket, index) => {
            collectorTankMountPoints[index] = socket;
          });
        }
        const collectorThrusterSockets = collectorModelData.sockets
          .filter((socket) =>
            socket.name.toLowerCase().startsWith("main_thruster_mount_"),
          )
          .sort(
            (a, b) =>
              parseSocketOrder(a.name, "main_thruster_mount") -
              parseSocketOrder(b.name, "main_thruster_mount"),
          )
          .map((socket) => socket.position)
          .filter((socket) => isSocketPositionUsable(socket));
        collectorThrusterMountPoints =
          collectorThrusterSockets.length > 0
            ? collectorThrusterSockets
            : [...defaultCollectorThrusterMountPoints];
        applyLoadedCollectorGeometry();
        if (usableCollectorTankSockets.length > 0 || usableCollectorWeaponSocket) {
          console.log(
            `[tactical] using ${usableCollectorTankSockets.length} collector tank socket(s) and ${
              usableCollectorWeaponSocket ? 1 : 0
            } weapon socket from model (tank sockets applied: ${USE_COLLECTOR_MODEL_TANK_SOCKETS})`,
          );
        }
        if (collectorThrusterSockets.length > 0) {
          console.log(
            `[tactical] using ${collectorThrusterSockets.length} collector thruster mount(s) from model`,
          );
        }
        console.log(
          `[tactical] loaded collector GLB model from ${collectorModelUrl}`,
        );
      } catch (error) {
        console.warn(
          `[tactical] failed to load collector GLB model from ${collectorModelUrl}; using primitive fallback`,
          error,
        );
      }
    };

    const loadStorageContainerModel = async () => {
      const loader = new GLTFLoader();
      try {
        const gltf = await loader.loadAsync(storageContainerModelUrl);
        if (isDisposed) {
          return;
        }
        let containerMesh: THREE.Mesh | null = null;
        gltf.scene.traverse((object) => {
          if (!containerMesh && object instanceof THREE.Mesh) {
            containerMesh = object;
          }
        });
        if (!containerMesh) {
          console.warn(
            `[tactical] storage container model at ${storageContainerModelUrl} had no mesh; using primitive fallback`,
          );
          return;
        }
        loadedStorageContainerGeometry?.dispose();
        const containerModelData = extractNormalizedModelData(
          gltf,
          containerMesh,
          STORAGE_CONTAINER_MODEL_TARGET_SIZE,
        );
        loadedStorageContainerGeometry = containerModelData.geometry;
        if (DEBUG_COLLECTOR_ATTACHMENTS) {
          loadedStorageContainerGeometry.computeBoundingBox();
          const box = loadedStorageContainerGeometry.boundingBox;
          console.log("[tactical] storage container geometry ready", {
            source: storageContainerModelUrl,
            vertexCount:
              loadedStorageContainerGeometry.getAttribute("position")?.count ?? 0,
            bounds: box
              ? {
                  min: {
                    x: Number(box.min.x.toFixed(2)),
                    y: Number(box.min.y.toFixed(2)),
                    z: Number(box.min.z.toFixed(2)),
                  },
                  max: {
                    x: Number(box.max.x.toFixed(2)),
                    y: Number(box.max.y.toFixed(2)),
                    z: Number(box.max.z.toFixed(2)),
                  },
                }
              : null,
          });
        }
        const units = unitsRef.current;
        if (units) {
          units.forEach((unit) => {
            if (unit.unitType !== "RESOURCE_COLLECTOR") {
              return;
            }
            const render = meshesRef.current.get(unit.id);
            if (!render) {
              return;
            }
            const color =
              render.owner === localSessionIdRef.current
                ? UNIT_COLORS.friendly
                : UNIT_COLORS.enemy;
            render.attachmentSignature = "";
            updateUnitAttachments(unit, render, color);
          });
        }
        console.log(
          `[tactical] loaded storage container GLB model from ${storageContainerModelUrl}`,
        );
      } catch (error) {
        console.warn(
          `[tactical] failed to load storage container GLB model from ${storageContainerModelUrl}; using primitive fallback`,
          error,
        );
      }
    };

    void loadFighterModel();
    void loadCollectorModel();
    void loadStorageContainerModel();

    const removeUnitMesh = (unitId: string) => {
      const render = meshesRef.current.get(unitId);
      if (!render) {
        return;
      }
      scene.remove(render.mesh);
      render.attachmentGroup.children.forEach((child) => {
        (child as THREE.Mesh).geometry.dispose();
        ((child as THREE.Mesh).material as THREE.Material).dispose();
      });
      render.mesh.geometry.dispose();
      (render.mesh.material as THREE.Material).dispose();
      meshesRef.current.delete(unitId);
      collectorAttachmentDebugRef.current.delete(unitId);
    };

    const ensureBaseMesh = (base: BaseSchema) => {
      if (baseMeshesRef.current.has(base.id)) {
        return;
      }
      const material = new THREE.MeshStandardMaterial({
        color: BASE_COLOR.clone(),
        emissive: new THREE.Color("#2b0f4a"),
      });
      const mesh = new THREE.Mesh(baseGeometry.clone(), material);
      mesh.position.set(base.x, 0, base.z);
      mesh.userData = { id: base.id };
      scene.add(mesh);
      baseMeshesRef.current.set(base.id, { mesh });
    };

    const removeBaseMesh = (baseId: string) => {
      const render = baseMeshesRef.current.get(baseId);
      if (!render) {
        return;
      }
      scene.remove(render.mesh);
      render.mesh.geometry.dispose();
      (render.mesh.material as THREE.Material).dispose();
      baseMeshesRef.current.delete(baseId);
    };

    const ensureModuleMesh = (module: BaseModuleSchema) => {
      if (moduleMeshesRef.current.has(module.id)) {
        return;
      }
      const material = new THREE.MeshStandardMaterial({
        color:
          MODULE_COLORS[module.moduleType as keyof typeof MODULE_COLORS]?.clone() ??
          MODULE_COLORS.GARAGE.clone(),
        emissive: new THREE.Color("#10203f"),
      });
      const mesh = new THREE.Mesh(getModuleGeometry(module).clone(), material);
      mesh.position.set(module.x, 0, module.z);
      mesh.userData = { id: module.id };
      scene.add(mesh);
      moduleMeshesRef.current.set(module.id, { mesh });
    };

    const removeModuleMesh = (moduleId: string) => {
      const render = moduleMeshesRef.current.get(moduleId);
      if (!render) {
        return;
      }
      scene.remove(render.mesh);
      render.mesh.geometry.dispose();
      (render.mesh.material as THREE.Material).dispose();
      moduleMeshesRef.current.delete(moduleId);
    };

    const getResourceScale = (resource: ResourceNodeSchema) => {
      const maxAmount = resource.maxAmount || 1;
      const ratio = Math.min(1, Math.max(0, resource.amount / maxAmount));
      return (
        RESOURCE_SCALE_MIN +
        (RESOURCE_SCALE_MAX - RESOURCE_SCALE_MIN) * ratio
      );
    };

    const ensureResourceMesh = (resource: ResourceNodeSchema) => {
      if (resourceMeshesRef.current.has(resource.id)) {
        return;
      }
      const material = new THREE.MeshStandardMaterial({
        color: RESOURCE_COLOR.clone(),
        emissive: new THREE.Color("#0f2f24"),
      });
      const mesh = new THREE.Mesh(resourceGeometry.clone(), material);
      mesh.position.set(resource.x, 0, resource.z);
      const scale = getResourceScale(resource);
      mesh.scale.set(scale, scale, scale);
      mesh.userData = { id: resource.id };
      scene.add(mesh);
      resourceMeshesRef.current.set(resource.id, { mesh });
    };

    const removeResourceMesh = (resourceId: string) => {
      const render = resourceMeshesRef.current.get(resourceId);
      if (!render) {
        return;
      }
      scene.remove(render.mesh);
      render.mesh.geometry.dispose();
      (render.mesh.material as THREE.Material).dispose();
      resourceMeshesRef.current.delete(resourceId);
    };

    const bindUnits = (units: SpaceState["units"]) => {
      if (unitsRef.current === units) {
        return;
      }
      unitsRef.current = units;
      console.log("[tactical] bindUnits", {
        size: units.size,
        sessionId: room?.sessionId ?? "n/a",
        roomId: room?.roomId ?? "n/a",
      });
      fallbackUnitsRef.current.clear();
      units.forEach((unit) => ensureUnitMesh(unit));
      setUnitCount(units.size);
      units.onAdd((unit) => {
        console.log("[tactical] unit added", {
          id: unit.id,
          owner: unit.owner,
          x: unit.x,
          z: unit.z,
        });
        ensureUnitMesh(unit);
        setUnitCount((prev) => prev + 1);
      });
      units.onRemove((unit) => {
        console.log("[tactical] unit removed", { id: unit.id });
        removeUnitMesh(unit.id);
        setSelection((prev) => (prev?.id === unit.id ? null : prev));
        setSelectedUnitIds((prev) => prev.filter((id) => id !== unit.id));
        setUnitCount((prev) => Math.max(0, prev - 1));
      });
    };

    const bindBases = (bases: SpaceState["bases"]) => {
      if (basesRef.current === bases) {
        return;
      }
      basesRef.current = bases;
      bases.forEach((base) => ensureBaseMesh(base));
      bases.onAdd((base) => ensureBaseMesh(base));
      bases.onRemove((base) => removeBaseMesh(base.id));
    };

    const bindResources = (resources: SpaceState["resources"]) => {
      if (resourcesRef.current === resources) {
        return;
      }
      resourcesRef.current = resources;
      resources.forEach((resource) => ensureResourceMesh(resource));
      resources.onAdd((resource) => ensureResourceMesh(resource));
      resources.onRemove((resource) => removeResourceMesh(resource.id));
    };

    const bindModules = (modules: SpaceState["modules"]) => {
      if (modulesRef.current === modules) {
        return;
      }
      modulesRef.current = modules;
      modules.forEach((module) => ensureModuleMesh(module));
      modules.onAdd((module) => ensureModuleMesh(module));
      modules.onRemove((module) => removeModuleMesh(module.id));
    };

    let bindPoll: number | null = null;
    let debugPoll: number | null = null;

    if (room?.state?.units) {
      console.log("[tactical] binding units from initial state", {
        roomId: room.roomId,
        sessionId: room.sessionId,
        units: room.state.units.size,
      });
      bindUnits(room.state.units);
    } else if (room) {
      console.log("[tactical] waiting for units state", {
        roomId: room.roomId,
        sessionId: room.sessionId,
      });
      room.onStateChange((state) => {
        if (state?.units) {
          console.log("[tactical] binding units from state change", {
            units: state.units.size,
          });
          bindUnits(state.units);
          return;
        }
        console.log("[tactical] state change without units", {
          hasUnits: !!state?.units,
        });
      });
      bindPoll = window.setInterval(() => {
        if (room.state?.units && unitsRef.current !== room.state.units) {
          console.log("[tactical] binding units from poll", {
            units: room.state.units.size,
          });
          bindUnits(room.state.units);
        }
      }, 250);
    }

    if (room?.state?.bases) {
      bindBases(room.state.bases);
    }

    if (room?.state?.resources) {
      bindResources(room.state.resources);
    }

    if (room?.state?.modules) {
      bindModules(room.state.modules);
    }

    room?.onStateChange((state) => {
      if (state?.bases) {
        bindBases(state.bases);
      }
      if (state?.resources) {
        bindResources(state.resources);
      }
      if (state?.modules) {
        bindModules(state.modules);
      }
    });

    room?.onMessage?.("debug:units", (payload) => {
      console.log("[tactical] debug units payload", payload);
      if (
        !payload ||
        !Array.isArray(payload.units) ||
        payload.units.length === 0
      ) {
        return;
      }
      if ((unitsRef.current?.size ?? 0) > 0) {
        return;
      }
      fallbackUnitsRef.current.clear();
      payload.units.forEach((unit: DebugUnit) => {
        fallbackUnitsRef.current.set(unit.id, unit);
        ensureUnitMesh(unit);
      });
      setUnitCount(payload.unitCount ?? fallbackUnitsRef.current.size);
    });

    debugPoll = window.setInterval(() => {
      const stateUnitCount = room?.state?.units?.size ?? 0;
      const fallbackCount = fallbackUnitsRef.current.size;
      const effectiveUnitCount = Math.max(stateUnitCount, fallbackCount);
      setDebugInfo({
        roomId: room?.roomId ?? "n/a",
        sessionId: room?.sessionId ?? "n/a",
        hasRoom: !!room,
        hasUnits: effectiveUnitCount > 0,
        unitTotal: effectiveUnitCount,
      });
    }, 1000);

    const resize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) {
        return;
      }
      const { width, height } = container.getBoundingClientRect();
      rendererRef.current.setSize(width, height, false);
      const aspect = width / height;
      cameraRef.current.aspect = aspect;
      cameraRef.current.updateProjectionMatrix();
    };

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    const cameraTarget = cameraTargetRef.current;
    const cameraDesiredTarget = cameraDesiredTargetRef.current;
    const cameraPosition = new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE);
    const cameraOffset = new THREE.Vector3();
    const fogSources: Array<{ x: number; z: number; radius: number }> = [];
    const isVisibleInFog = (x: number, z: number) => {
      if (fogSources.length === 0) {
        return true;
      }
      for (const source of fogSources) {
        const dx = x - source.x;
        const dz = z - source.z;
        if (dx * dx + dz * dz <= source.radius * source.radius) {
          return true;
        }
      }
      return false;
    };
    const animate = () => {
      const delta = clock.getDelta();
      const units = unitsRef.current;
      const fallbackUnits = fallbackUnitsRef.current;
      const activeUnits = units?.size
        ? units
        : fallbackUnits.size
          ? fallbackUnits
          : null;
      const activeUnitIds = new Set<string>();
      if (activeUnits) {
        activeUnits.forEach((unit) => {
          activeUnitIds.add(unit.id);
          const render = meshesRef.current.get(unit.id);
          if (!render) {
            return;
          }
          const { mesh } = render;
          const target = new THREE.Vector3(unit.x, 0, unit.z);
          const distance = mesh.position.distanceTo(target);
          if (distance > MOVE_EPSILON) {
            mesh.position.lerp(target, Math.min(1, delta * 6));
          } else {
            mesh.position.copy(target);
          }
          mesh.rotation.y = -("rot" in unit ? unit.rot : 0);
          if ("vx" in unit && "vz" in unit && render.thrusters.length > 0) {
            const speed = Math.hypot(unit.vx, unit.vz);
            const normalized =
              speed <= THRUSTER_SPEED_THRESHOLD
                ? 0
                : Math.min(
                    1,
                    (speed - THRUSTER_SPEED_THRESHOLD) /
                      Math.max(THRUSTER_SPEED_THRESHOLD, unit.speed || 1),
                  );
            render.thrusters.forEach((thruster) => {
              const material = thruster.material as THREE.MeshBasicMaterial;
              if (normalized <= 0) {
                thruster.visible = false;
                material.opacity = 0;
                return;
              }
              thruster.visible = true;
              thruster.scale.set(1, 1, 0.45 + normalized * THRUSTER_MAX_SCALE_Z);
              material.opacity = 0.22 + normalized * 0.5;
            });
          }
          const tint =
            unit.owner === localSessionIdRef.current
              ? UNIT_COLORS.friendly
              : UNIT_COLORS.enemy;
          updateUnitAttachments(unit, render, tint);
        });
      }
      const weaponCooldowns = weaponCooldownsRef.current;
      if (activeUnits) {
        activeUnits.forEach((unit) => {
          const cooldown =
            "weaponCooldownLeft" in unit ? unit.weaponCooldownLeft : 0;
          const previousCooldown = weaponCooldowns.get(unit.id) ?? 0;
          if (cooldown > 0 && previousCooldown <= 0 && "tgt" in unit) {
            const targetId = unit.tgt;
            if (targetId) {
              const target =
                unitsRef.current?.get(targetId) ??
                fallbackUnitsRef.current.get(targetId);
              if (target) {
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute(
                  "position",
                  new THREE.BufferAttribute(new Float32Array(6), 3),
                );
                const material = new THREE.LineBasicMaterial({
                  color: UNIT_COLORS.selected,
                  transparent: true,
                  opacity: 0.9,
                });
                const line = new THREE.Line(geometry, material);
                scene.add(line);
                const ttl = 0.25;
                firingEffectsRef.current.push({
                  line,
                  ttl,
                  maxTtl: ttl,
                  fromId: unit.id,
                  toId: targetId,
                });
              }
            }
          }
          weaponCooldowns.set(unit.id, cooldown);
        });
      }
      if (weaponCooldowns.size > activeUnitIds.size) {
        for (const unitId of weaponCooldowns.keys()) {
          if (!activeUnitIds.has(unitId)) {
            weaponCooldowns.delete(unitId);
          }
        }
      }
      if (firingEffectsRef.current.length > 0) {
        const effects = firingEffectsRef.current;
        for (let i = effects.length - 1; i >= 0; i -= 1) {
          const effect = effects[i];
          effect.ttl -= delta;
          const from =
            unitsRef.current?.get(effect.fromId) ??
            fallbackUnitsRef.current.get(effect.fromId);
          const to =
            unitsRef.current?.get(effect.toId) ??
            fallbackUnitsRef.current.get(effect.toId);
          if (!from || !to || effect.ttl <= 0) {
            scene.remove(effect.line);
            effect.line.geometry.dispose();
            (effect.line.material as THREE.Material).dispose();
            effects.splice(i, 1);
            continue;
          }
          const positions = effect.line.geometry.getAttribute(
            "position",
          ) as THREE.BufferAttribute;
          positions.setXYZ(0, from.x, 2, from.z);
          positions.setXYZ(1, to.x, 2, to.z);
          positions.needsUpdate = true;
          const material = effect.line.material as THREE.LineBasicMaterial;
          material.opacity = Math.max(0, effect.ttl / effect.maxTtl);
        }
      }
      basesRef.current?.forEach((base) => {
        const render = baseMeshesRef.current.get(base.id);
        if (!render) {
          return;
        }
        render.mesh.position.set(base.x, 0, base.z);
      });
      modulesRef.current?.forEach((module) => {
        const render = moduleMeshesRef.current.get(module.id);
        if (!render) {
          return;
        }
        render.mesh.position.set(module.x, 0, module.z);
      });
      resourcesRef.current?.forEach((resource) => {
        const render = resourceMeshesRef.current.get(resource.id);
        if (!render) {
          return;
        }
        render.mesh.position.set(resource.x, 0, resource.z);
        const scale = getResourceScale(resource);
        render.mesh.scale.set(scale, scale, scale);
      });

      fogSources.length = 0;
      const localOwner = localSessionIdRef.current;
      if (localOwner) {
        (unitsRef.current ?? fallbackUnitsRef.current).forEach((unit) => {
          if (unit.owner !== localOwner) {
            return;
          }
          fogSources.push({
            x: unit.x,
            z: unit.z,
            radius: getUnitFogRadius(unit),
          });
        });
        basesRef.current?.forEach((base) => {
          if (base.owner !== localOwner) {
            return;
          }
          fogSources.push({
            x: base.x,
            z: base.z,
            radius: FOG_BASE_VISION_RADIUS,
          });
        });
      }

      meshesRef.current.forEach((render, unitId) => {
        const unit =
          unitsRef.current?.get(unitId) ??
          fallbackUnitsRef.current.get(unitId);
        if (!unit) {
          return;
        }
        const isVisible =
          render.owner === localOwner ||
          isVisibleInFog(unit.x + FOG_VISIBILITY_EPSILON, unit.z);
        render.mesh.visible = isVisible;
      });
      baseMeshesRef.current.forEach((render, baseId) => {
        const base = basesRef.current?.get(baseId);
        if (!base) {
          return;
        }
        const isVisible =
          base.owner === localOwner || isVisibleInFog(base.x, base.z);
        render.mesh.visible = isVisible;
      });
      moduleMeshesRef.current.forEach((render, moduleId) => {
        const module = modulesRef.current?.get(moduleId);
        if (!module) {
          return;
        }
        const isVisible =
          module.owner === localOwner || isVisibleInFog(module.x, module.z);
        render.mesh.visible = isVisible;
      });
      resourceMeshesRef.current.forEach((render, resourceId) => {
        const resource = resourcesRef.current?.get(resourceId);
        if (!resource) {
          return;
        }
        render.mesh.visible = isVisibleInFog(resource.x, resource.z);
      });

      const selectedId = selectionRef.current?.id;
      if (selectedId) {
        const selectedRender = meshesRef.current.get(selectedId);
        if (selectedRender && !selectedRender.mesh.visible) {
          setSelection(null);
          setSelectedUnitIds([]);
          setSelectedBaseId(null);
        }
      }
      const baseSelectionId = selectedBaseIdRef.current;
      if (baseSelectionId) {
        const baseRender = baseMeshesRef.current.get(baseSelectionId);
        if (baseRender && !baseRender.mesh.visible) {
          setSelectedBaseId(null);
        }
      }
      const moduleSelectionId = selectedModuleIdRef.current;
      if (moduleSelectionId) {
        const moduleRender = moduleMeshesRef.current.get(moduleSelectionId);
        if (moduleRender && !moduleRender.mesh.visible) {
          setSelectedModuleId(null);
        }
      }
      const activeCameraMode = cameraModeRef.current;
      if (activeCameraMode !== "free") {
        const localOwner = localSessionIdRef.current;
        let targetFound = false;
        if (activeCameraMode === "selected") {
          const selectedId = selectionRef.current?.id;
          const selectedUnit =
            selectedId &&
            (unitsRef.current?.get(selectedId) ??
              fallbackUnitsRef.current.get(selectedId));
          if (selectedUnit) {
            cameraDesiredTarget.set(selectedUnit.x, 0, selectedUnit.z);
            targetFound = true;
          }
        }
        if (!targetFound && localOwner) {
          let centerX = 0;
          let centerZ = 0;
          let count = 0;
          unitsRef.current?.forEach((unit) => {
            if (unit.owner !== localOwner) {
              return;
            }
            centerX += unit.x;
            centerZ += unit.z;
            count += 1;
          });
          if (count === 0) {
            basesRef.current?.forEach((base) => {
              if (base.owner !== localOwner) {
                return;
              }
              centerX += base.x;
              centerZ += base.z;
              count += 1;
            });
          }
          if (count > 0) {
            cameraDesiredTarget.set(centerX / count, 0, centerZ / count);
            targetFound = true;
          }
        }
        if (targetFound) {
          cameraTarget.lerp(
            cameraDesiredTarget,
            Math.min(1, delta * CAMERA_LERP_SPEED),
          );
        }
      }

      const yaw = cameraYawRef.current;
      const pitch = cameraPitchRef.current;
      const radius = cameraRadiusRef.current;
      cameraOffset.set(
        Math.sin(yaw) * Math.cos(pitch) * radius,
        Math.sin(pitch) * radius,
        Math.cos(yaw) * Math.cos(pitch) * radius,
      );
      cameraPosition.copy(cameraTarget).add(cameraOffset);
      camera.position.lerp(
        cameraPosition,
        Math.min(1, delta * CAMERA_LERP_SPEED),
      );
      camera.lookAt(cameraTarget);
      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      if (bindPoll) {
        window.clearInterval(bindPoll);
      }
      if (debugPoll) {
        window.clearInterval(debugPoll);
      }
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      firingEffectsRef.current.forEach((effect) => {
        scene.remove(effect.line);
        effect.line.geometry.dispose();
        (effect.line.material as THREE.Material).dispose();
      });
      firingEffectsRef.current = [];
      renderer.dispose();
      fighterGeometry.dispose();
      loadedFighterGeometry?.dispose();
      loadedCollectorGeometry?.dispose();
      loadedStorageContainerGeometry?.dispose();
      disposeMaterialSet(loadedFighterMaterial);
      disposeMaterialSet(loadedCollectorMaterial);
      collectorGeometry.dispose();
      fighterWeaponGeometry.dispose();
      collectorTankGeometry.dispose();
      collectorWeaponGeometry.dispose();
      baseGeometry.dispose();
      resourceGeometry.dispose();
      techGeometry.dispose();
      repairGeometry.dispose();
      garageGeometry.dispose();
      turretGeometry.dispose();
      meshesRef.current.forEach((render) => {
        render.attachmentGroup.children.forEach((child) => {
          (child as THREE.Mesh).geometry.dispose();
          ((child as THREE.Mesh).material as THREE.Material).dispose();
        });
        render.mesh.geometry.dispose();
        disposeMaterialSet(render.mesh.material as THREE.Material | THREE.Material[]);
        if (render.selectionOutline) {
          render.mesh.remove(render.selectionOutline);
          render.selectionOutline.geometry.dispose();
          (render.selectionOutline.material as THREE.Material).dispose();
          render.selectionOutline = null;
        }
      });
      meshesRef.current.clear();
      baseMeshesRef.current.forEach((render) => {
        render.mesh.geometry.dispose();
        (render.mesh.material as THREE.Material).dispose();
      });
      baseMeshesRef.current.clear();
      moduleMeshesRef.current.forEach((render) => {
        render.mesh.geometry.dispose();
        (render.mesh.material as THREE.Material).dispose();
      });
      moduleMeshesRef.current.clear();
      resourceMeshesRef.current.forEach((render) => {
        render.mesh.geometry.dispose();
        (render.mesh.material as THREE.Material).dispose();
      });
      resourceMeshesRef.current.clear();
      container.removeChild(renderer.domElement);
    };
  }, [room, pointerNdc, raycaster, targetPlane]);

  useEffect(() => {
    const selectedId = selection?.id;
    const selectedSet = new Set(selectedUnitIds);
    const selectedOutlineColor = UNIT_COLORS.selected.clone();

    meshesRef.current.forEach((render, unitId) => {
      let color: THREE.Color;
      const isSelected = selectedSet.has(unitId);
      if (isSelected) {
        color = UNIT_COLORS.selected.clone();
      } else {
        color =
          render.owner === localSessionId
            ? UNIT_COLORS.friendly.clone()
            : UNIT_COLORS.enemy.clone();
      }
      if (!render.usesImportedMaterial) {
        const material = render.mesh.material as THREE.MeshStandardMaterial;
        material.color = color;
      }
      const sourceGeometryId = render.mesh.geometry.uuid;
      if (isSelected) {
        const needsNewOutline =
          !render.selectionOutline ||
          render.selectionOutlineGeometrySource !== sourceGeometryId;
        if (needsNewOutline) {
          if (render.selectionOutline) {
            render.mesh.remove(render.selectionOutline);
            render.selectionOutline.geometry.dispose();
            (render.selectionOutline.material as THREE.Material).dispose();
          }
          const geometry = new THREE.EdgesGeometry(render.mesh.geometry);
          const material = new THREE.LineBasicMaterial({
            color: selectedOutlineColor,
            transparent: true,
            opacity: 0.95,
          });
          const outline = new THREE.LineSegments(geometry, material);
          outline.scale.setScalar(1.035);
          outline.renderOrder = 10;
          render.mesh.add(outline);
          render.selectionOutline = outline;
          render.selectionOutlineGeometrySource = sourceGeometryId;
        } else {
          const outlineMaterial =
            render.selectionOutline.material as THREE.LineBasicMaterial;
          outlineMaterial.color = selectedOutlineColor.clone();
        }
      } else if (render.selectionOutline) {
        render.mesh.remove(render.selectionOutline);
        render.selectionOutline.geometry.dispose();
        (render.selectionOutline.material as THREE.Material).dispose();
        render.selectionOutline = null;
        render.selectionOutlineGeometrySource = null;
      }
      render.attachmentGroup.children.forEach((child) => {
        const childMaterial = (child as THREE.Mesh)
          .material as THREE.MeshStandardMaterial;
        childMaterial.color = color.clone();
      });
    });

    if (!selectedId) {
      setSelectedHp(0);
      setSelectedShields(0);
      setSelectedSpeed(0);
      return;
    }
    const selectedUnit =
      unitsRef.current?.get(selectedId) ??
      fallbackUnitsRef.current.get(selectedId);
    setSelectedHp(
      selectedUnit && "hp" in selectedUnit ? selectedUnit.hp : 100,
    );
    setSelectedShields(
      selectedUnit && "shields" in selectedUnit ? selectedUnit.shields : 0,
    );
    setSelectedSpeed(
      selectedUnit && "speed" in selectedUnit ? selectedUnit.speed : 0,
    );
  }, [localSessionId, selection, selectedUnitIds]);

  useEffect(() => {
    if (!selection?.id) {
      return;
    }
    const interval = window.setInterval(() => {
      const unit =
        unitsRef.current?.get(selection.id) ??
        fallbackUnitsRef.current.get(selection.id);
      if (unit) {
        setSelectedHp("hp" in unit ? unit.hp : 100);
        setSelectedShields("shields" in unit ? unit.shields : 0);
        setSelectedSpeed("speed" in unit ? unit.speed : 0);
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [selection]);

  const getCanvasCoords = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds =
      rendererRef.current?.domElement.getBoundingClientRect() ??
      event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  };

  const updateSelectionFromBox = (box: {
    left: number;
    top: number;
    width: number;
    height: number;
  }) => {
    if (!rendererRef.current || !cameraRef.current) {
      return;
    }
    const camera = cameraRef.current;
    const bounds = rendererRef.current.domElement.getBoundingClientRect();
    const left = Math.min(box.left, box.left + box.width);
    const right = Math.max(box.left, box.left + box.width);
    const top = Math.min(box.top, box.top + box.height);
    const bottom = Math.max(box.top, box.top + box.height);
    const selected: string[] = [];

    meshesRef.current.forEach((render, unitId) => {
      if (render.owner !== localSessionIdRef.current) {
        return;
      }
      const position = render.mesh.position.clone().project(camera);
      const screenX = ((position.x + 1) / 2) * bounds.width;
      const screenY = ((-position.y + 1) / 2) * bounds.height;
      if (
        screenX >= left &&
        screenX <= right &&
        screenY >= top &&
        screenY <= bottom
      ) {
        selected.push(unitId);
      }
    });

    setSelectedUnitIds(selected);
    setSelection(selected.length > 0 ? { id: selected[0] } : null);
    setSelectedBaseId(null);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!rendererRef.current) {
      return;
    }
    if (event.button === 2) {
      dragStateRef.current = {
        mode: "rotate",
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        active: true,
        moved: false,
      };
      setCameraMode("free");
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 1) {
      dragStateRef.current = {
        mode: "pan",
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        active: true,
        moved: false,
      };
      setCameraMode("free");
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const { x, y } = getCanvasCoords(event);
    dragStateRef.current = {
      mode: "select",
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      active: true,
      moved: false,
    };
    setSelectionBox({
      left: x,
      top: y,
      width: 0,
      height: 0,
      visible: true,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active || !rendererRef.current) {
      return;
    }
    const state = dragStateRef.current;
    if (state.mode === "select") {
      const { x, y } = getCanvasCoords(event);
      const deltaX = x - state.startX;
      const deltaY = y - state.startY;
      if (
        Math.abs(deltaX) > SELECTION_DRAG_THRESHOLD ||
        Math.abs(deltaY) > SELECTION_DRAG_THRESHOLD
      ) {
        state.moved = true;
      }
      state.lastX = x;
      state.lastY = y;
      setSelectionBox({
        left: state.startX,
        top: state.startY,
        width: deltaX,
        height: deltaY,
        visible: true,
      });
      return;
    }
    if (!cameraRef.current) {
      return;
    }
    const camera = cameraRef.current;
    const deltaX = event.clientX - state.lastX;
    const deltaY = event.clientY - state.lastY;
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    state.moved = true;
    if (state.mode === "rotate") {
      cameraYawRef.current -= deltaX * CAMERA_ROTATE_SPEED;
      cameraPitchRef.current = Math.min(
        CAMERA_PITCH_MAX,
        Math.max(
          CAMERA_PITCH_MIN,
          cameraPitchRef.current - deltaY * CAMERA_ROTATE_SPEED,
        ),
      );
      return;
    }
    if (state.mode === "pan") {
      const bounds = rendererRef.current.domElement.getBoundingClientRect();
      const panScale =
        (cameraRadiusRef.current / Math.max(1, bounds.height)) *
        CAMERA_PAN_SPEED;
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      cameraTargetRef.current.addScaledVector(right, -deltaX * panScale);
      cameraTargetRef.current.addScaledVector(forward, deltaY * panScale);
    }
  };

  const handlePointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsPointerInsideCanvas(false);
    if (!dragStateRef.current.active) {
      return;
    }
    handlePointerUp(event);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!rendererRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const nextRadius =
      cameraRadiusRef.current + event.deltaY * CAMERA_ZOOM_SPEED;
    cameraRadiusRef.current = Math.min(
      CAMERA_RADIUS_MAX,
      Math.max(CAMERA_RADIUS_MIN, nextRadius),
    );
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (dragState.active && dragState.mode === "select") {
      const deltaX = dragState.lastX - dragState.startX;
      const deltaY = dragState.lastY - dragState.startY;
      if (
        Math.abs(deltaX) > SELECTION_DRAG_THRESHOLD ||
        Math.abs(deltaY) > SELECTION_DRAG_THRESHOLD
      ) {
        updateSelectionFromBox({
          left: dragState.startX,
          top: dragState.startY,
          width: deltaX,
          height: deltaY,
        });
        setSelectionBox((prev) => ({ ...prev, visible: false }));
        dragStateRef.current.active = false;
        dragStateRef.current.mode = null;
        return;
      }
    }
    if (dragState.active && dragState.mode !== "select" && dragState.moved) {
      dragStateRef.current.active = false;
      dragStateRef.current.mode = null;
      return;
    }
    dragStateRef.current.active = false;
    dragStateRef.current.mode = null;
    setSelectionBox((prev) => ({ ...prev, visible: false }));
    if (!rendererRef.current || !cameraRef.current) {
      return;
    }
    const { x, y, width, height } = getCanvasCoords(event);
    pointerNdc.x = (x / width) * 2 - 1;
    pointerNdc.y = -(y / height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, cameraRef.current);

    const moduleMeshes = Array.from(moduleMeshesRef.current.values()).map(
      (render) => render.mesh,
    );
    const moduleHits = raycaster.intersectObjects(moduleMeshes, false);
    if (moduleHits.length > 0) {
      const hitId = moduleHits[0].object.userData.id as string;
      const module = modulesRef.current?.get(hitId);
      if (module && module.owner === localSessionId) {
        const isTechShop = module.moduleType === "TECH_SHOP";
        setSelectedModuleId(hitId);
        setSelectedBaseId(isTechShop ? module.baseId : null);
        setIsModuleModalOpen(!isTechShop);
        setIsBaseModalOpen(false);
        setIsUnitModalOpen(false);
        if (isTechShop) {
          setIsLabModalOpen(true);
        }
        if (room && selectedUnitIds.length > 0) {
          room.send("module:visit", {
            moduleId: hitId,
            unitIds: selectedUnitIds,
          });
        }
      }
      return;
    }

    const baseMeshes = Array.from(baseMeshesRef.current.values()).map(
      (render) => render.mesh,
    );
    const baseHits = raycaster.intersectObjects(baseMeshes, false);
    if (baseHits.length > 0) {
      const hitId = baseHits[0].object.userData.id as string;
      const base = basesRef.current?.get(hitId);
      if (base && base.owner === localSessionId) {
        setSelectedBaseId(hitId);
        setSelectedModuleId(null);
        setSelection(null);
        setSelectedUnitIds([]);
        setIsBaseModalOpen(true);
        setIsModuleModalOpen(false);
        setIsUnitModalOpen(false);
      } else if (room && selectedUnitIds.length > 0 && base) {
        const weaponUnitIds = selectedUnitIds.filter((unitId) => {
          const unit =
            unitsRef.current?.get(unitId) ??
            fallbackUnitsRef.current.get(unitId);
          return !!unit && "weaponMounts" in unit && unit.weaponMounts > 0;
        });
        if (weaponUnitIds.length > 0) {
          setSelectedBaseId(null);
          setSelectedModuleId(null);
          setIsBaseModalOpen(false);
          setIsModuleModalOpen(false);
          room.send("command", {
            t: "ATTACK",
            unitIds: weaponUnitIds,
            targetId: hitId,
          });
        }
      } else {
        setSelectedBaseId(null);
        setSelectedModuleId(null);
        setSelection(null);
        setSelectedUnitIds([]);
        setIsBaseModalOpen(false);
        setIsModuleModalOpen(false);
        setIsUnitModalOpen(false);
      }
      return;
    }

    const meshes = Array.from(meshesRef.current.values()).map(
      (render) => render.mesh,
    );

    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hitId = hits[0].object.userData.id as string;
      const render = meshesRef.current.get(hitId);
      if (render && render.owner === localSessionId) {
        setSelection({ id: hitId });
        setSelectedUnitIds([hitId]);
        setSelectedBaseId(null);
        setSelectedModuleId(null);
        setIsUnitModalOpen(true);
        setIsBaseModalOpen(false);
        setIsModuleModalOpen(false);
      } else if (room && selectedUnitIds.length > 0) {
        const weaponUnitIds = selectedUnitIds.filter((unitId) => {
          const unit =
            unitsRef.current?.get(unitId) ??
            fallbackUnitsRef.current.get(unitId);
          return !!unit && "weaponMounts" in unit && unit.weaponMounts > 0;
        });
        if (weaponUnitIds.length > 0) {
          setSelectedBaseId(null);
          setSelectedModuleId(null);
          setIsBaseModalOpen(false);
          setIsModuleModalOpen(false);
          room.send("command", {
            t: "ATTACK",
            unitIds: weaponUnitIds,
            targetId: hitId,
          });
        }
      }
      return;
    }

    const resourceMeshes = Array.from(resourceMeshesRef.current.values()).map(
      (render) => render.mesh,
    );
    const resourceHits = raycaster.intersectObjects(resourceMeshes, false);
    if (resourceHits.length > 0) {
      const resourceId = resourceHits[0].object.userData.id as string;
      const resource = resourcesRef.current?.get(resourceId);
      const selectedUnit =
        selection?.id
          ? unitsRef.current?.get(selection.id) ??
            fallbackUnitsRef.current.get(selection.id) ??
            null
          : null;
      console.log("[tactical] resource click", {
        resourceId,
        hasRoom: !!room,
        selectedId: selection?.id ?? null,
        resourceFound: !!resource,
      });
      setLastResourceClick({ id: resourceId, at: Date.now() });
      if (room && selectedUnitIds.length > 0 && resource) {
        setSelectedBaseId(null);
        setSelectedModuleId(null);
        setIsBaseModalOpen(false);
        setIsModuleModalOpen(false);
        console.log("[tactical] harvest command", {
          unitIds: selectedUnitIds,
          resourceId: resource.id,
          unit: selectedUnit,
        });
        room.send("command", {
          t: "HARVEST",
          unitIds: selectedUnitIds,
          resourceId: resource.id,
        });
        return;
      }
    }

    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(targetPlane, target)) {
      if (!room) {
        return;
      }
      if (selectedUnitIds.length > 0) {
        setSelectedBaseId(null);
        setSelectedModuleId(null);
        setIsBaseModalOpen(false);
        setIsModuleModalOpen(false);
        room.send("command", {
          t: "MOVE",
          unitIds: selectedUnitIds,
          x: target.x,
          z: target.z,
        });
      } else {
        setSelection(null);
        setSelectedUnitIds([]);
        setSelectedModuleId(null);
        setIsUnitModalOpen(false);
        setIsBaseModalOpen(false);
        setIsModuleModalOpen(false);
      }
    }
  };

  const handleDeselectAllUnits = () => {
    setSelection(null);
    setSelectedUnitIds([]);
    setIsUnitModalOpen(false);
  };

  const handleReturnCameraToBase = () => {
    const localOwner = localSessionIdRef.current;
    if (!localOwner) {
      return;
    }
    let centerX = 0;
    let centerZ = 0;
    let count = 0;
    basesRef.current?.forEach((base) => {
      if (base.owner !== localOwner) {
        return;
      }
      centerX += base.x;
      centerZ += base.z;
      count += 1;
    });
    if (count === 0) {
      return;
    }
    const targetX = centerX / count;
    const targetZ = centerZ / count;
    cameraTargetRef.current.set(targetX, 0, targetZ);
    cameraDesiredTargetRef.current.set(targetX, 0, targetZ);
    setCameraMode("free");
  };

  const selectedUnit = selection?.id
    ? unitsRef.current?.get(selection.id) ??
      fallbackUnitsRef.current.get(selection.id) ??
      null
    : null;
  const selectedUnitCount = selectedUnitIds.length;
  const selectedBase = selectedBaseId
    ? basesRef.current?.get(selectedBaseId) ?? null
    : null;
  const canBuildCollector =
    !!selectedBase && selectedBase.resourceStock >= RESOURCE_COLLECTOR_COST;
  const canBuildFighter =
    !!selectedBase && selectedBase.resourceStock >= FIGHTER_COST;
  const researchStateByKey = new Map(
    LAB_RESEARCH_TREE.map((research) => [
      research.key,
      !!selectedBase?.[research.unlockedBy],
    ]),
  );
  const selectedModule = selectedModuleId
    ? modulesRef.current?.get(selectedModuleId) ?? null
    : null;
  const baseModules = selectedBase
    ? Array.from(modulesRef.current?.values() ?? []).filter(
        (module) => module.baseId === selectedBase.id,
      )
    : [];
  const weaponTurretCount = baseModules.filter(
    (module) => module.moduleType === "WEAPON_TURRET",
  ).length;
  const hasTechShop = baseModules.some(
    (module) => module.moduleType === "TECH_SHOP",
  );
  const hasRepairBay = baseModules.some(
    (module) => module.moduleType === "REPAIR_BAY",
  );
  const hasGarage = baseModules.some(
    (module) => module.moduleType === "GARAGE",
  );
  const canPurchaseTechShop =
    !!selectedBase &&
    !hasTechShop &&
    selectedBase.resourceStock >= MODULE_TECH_SHOP_COST;
  const canPurchaseRepairBay =
    !!selectedBase &&
    !!selectedBase.researchRepairBay &&
    !hasRepairBay &&
    selectedBase.resourceStock >= MODULE_REPAIR_BAY_COST;
  const canPurchaseGarage =
    !!selectedBase &&
    !!selectedBase.researchGarage &&
    !hasGarage &&
    selectedBase.resourceStock >= MODULE_GARAGE_COST;
  const canPurchaseWeaponTurret =
    !!selectedBase &&
    !!selectedBase.researchWeaponTurret &&
    weaponTurretCount < WEAPON_TURRET_RING_COUNT &&
    selectedBase.resourceStock >= MODULE_WEAPON_TURRET_COST;

  useEffect(() => {
    if (!shouldAutoOpenLabAfterPurchase || !hasTechShop) {
      return;
    }
    setIsLabModalOpen(true);
    setShouldAutoOpenLabAfterPurchase(false);
  }, [hasTechShop, shouldAutoOpenLabAfterPurchase]);
  useEffect(() => {
    if (!hasGarage) {
      setIsGarageModalOpen(false);
    }
  }, [hasGarage]);
  const availableWeaponTypes = WEAPON_TYPES.filter((weaponType) => {
    if (!selectedBase) {
      return weaponType === "LASER";
    }
    if (weaponType === "LASER") {
      return true;
    }
    if (weaponType === "PLASMA") {
      return selectedBase.researchPlasma;
    }
    if (weaponType === "RAIL") {
      return selectedBase.researchRail;
    }
    if (weaponType === "MISSILE") {
      return selectedBase.researchMissile;
    }
    if (weaponType === "FUSION_PLASMA") {
      return selectedBase.researchFusionPlasma;
    }
    if (weaponType === "GAUSS_RAIL") {
      return selectedBase.researchGaussRail;
    }
    return selectedBase.researchSmartMissile;
  });
  const availableTechUpgrades = Object.entries(TECH_UPGRADE_COSTS).filter(
    ([upgradeType]) => {
      if (!selectedBase) {
        return false;
      }
      switch (upgradeType) {
        case "SHIELDS":
          return (
            selectedBase.researchShields &&
            selectedBase.shieldUpgradeLevel < MAX_SHIP_TECH_UPGRADE_LEVEL
          );
        case "HULL":
          return (
            selectedBase.researchHull &&
            selectedBase.hullUpgradeLevel < MAX_SHIP_TECH_UPGRADE_LEVEL
          );
        case "SPEED":
          return (
            selectedBase.researchSpeed &&
            selectedBase.speedUpgradeLevel < MAX_SHIP_TECH_UPGRADE_LEVEL
          );
        case "RADAR":
          return (
            selectedBase.researchRadar &&
            selectedBase.radarUpgradeLevel < MAX_SHIP_TECH_UPGRADE_LEVEL
          );
        case "WEAPON":
          return (
            selectedBase.researchWeaponLevel1 &&
            selectedBase.weaponUpgradeLevel < MAX_SHIP_TECH_UPGRADE_LEVEL
          );
        case "STORAGE":
          return selectedBase.collectorStorageBonus < COLLECTOR_MAX_STORAGE_BONUS;
        default:
          return false;
      }
    },
  );
  const effectiveModuleWeaponType = availableWeaponTypes.includes(moduleWeaponType)
    ? moduleWeaponType
    : "LASER";
  const selectedUnitType =
    selectedUnit && "unitType" in selectedUnit
      ? selectedUnit.unitType
      : "RESOURCE_COLLECTOR";
  const selectedUnitSource = selection?.id
    ? unitsRef.current?.has(selection.id)
      ? "state"
      : fallbackUnitsRef.current.has(selection.id)
        ? "fallback"
        : "missing"
    : "none";
  const selectedUnitOrder =
    selectedUnit && "orderType" in selectedUnit ? selectedUnit.orderType : "n/a";
  const selectedUnitTarget =
    selectedUnit && "orderTargetId" in selectedUnit
      ? selectedUnit.orderTargetId
      : "n/a";
  const selectedUnitDestination =
    selectedUnit && "orderX" in selectedUnit && "orderZ" in selectedUnit
      ? `${selectedUnit.orderX.toFixed(1)}, ${selectedUnit.orderZ.toFixed(1)}`
      : "n/a";
  const selectedUnitCargo =
    selectedUnit && "cargo" in selectedUnit ? selectedUnit.cargo : 0;
  const selectedUnitCargoCapacity =
    selectedUnit && "cargoCapacity" in selectedUnit
      ? selectedUnit.cargoCapacity
      : 0;
  const selectedUnitMaxShields =
    selectedUnit && "maxShields" in selectedUnit ? selectedUnit.maxShields : 0;
  const selectedUnitMaxHp =
    selectedUnit && "maxHp" in selectedUnit ? selectedUnit.maxHp : 100;
  const selectedUnitWeaponMounts =
    selectedUnit && "weaponMounts" in selectedUnit ? selectedUnit.weaponMounts : 0;
  const selectedUnitTechMounts =
    selectedUnit && "techMounts" in selectedUnit ? selectedUnit.techMounts : 0;
  const selectedUnitWeaponType =
    selectedUnit && "weaponType" in selectedUnit ? selectedUnit.weaponType : "LASER";
  const selectedUnitAtModule =
    selectedUnit && selectedModule
      ? Math.hypot(
          selectedUnit.x - selectedModule.x,
          selectedUnit.z - selectedModule.z,
        ) <= MODULE_INTERACTION_RANGE
      : false;
  const resourceCount = resourcesRef.current?.size ?? 0;
  const localResourceTotal = Array.from(basesRef.current?.values() ?? [])
    .filter((base) => base.owner === localSessionId)
    .reduce((total, base) => total + base.resourceStock, 0);

  return (
    <div className="tactical-view">
      <div
        className="tactical-canvas"
        ref={containerRef}
        onPointerEnter={() => setIsPointerInsideCanvas(true)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      >
        <div className="play-hud" role="status" aria-live="polite">
          <div className="play-hud-card play-hud-card--wide">
            <p className="play-hud-label">Combat HUD</p>
            <p className="play-hud-copy play-hud-copy--resource">
              Resources {Math.floor(localResourceTotal)}
            </p>
            {selectedUnit ? (
              <p className="play-hud-copy">
                {selectedUnitCount > 1 ? `${selectedUnitCount} selected · ` : ""}
                HP {Math.floor(selectedHp)}/{selectedUnitMaxHp} · Shields{" "}
                {Math.floor(selectedShields)}/{selectedUnitMaxShields} · Speed{" "}
                {selectedSpeed.toFixed(1)} · Weapon {selectedUnitWeaponType}
              </p>
            ) : (
              <p className="play-hud-copy">No unit selected</p>
            )}
          </div>
        </div>
        {selectionBox.visible && (
          <div
            className="selection-box"
            style={{
              left: Math.min(
                selectionBox.left,
                selectionBox.left + selectionBox.width,
              ),
              top: Math.min(
                selectionBox.top,
                selectionBox.top + selectionBox.height,
              ),
              width: Math.abs(selectionBox.width),
              height: Math.abs(selectionBox.height),
            }}
          />
        )}
      </div>
      {createPortal(
        <div
          className="play-hud"
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: 16,
            left: 16,
            zIndex: 9999,
            display: "grid",
            gap: 10,
            width: "min(460px, calc(100% - 32px))",
            pointerEvents: "none",
          }}
        >
          <div
            className="play-hud-card play-hud-card--wide"
            style={{
              border: "1px solid rgba(96, 165, 250, 0.65)",
              background: "rgba(7, 13, 28, 0.72)",
              borderRadius: 12,
              padding: "9px 12px 10px",
            }}
          >
            <p className="play-hud-label">Combat HUD</p>
            <p className="play-hud-copy play-hud-copy--resource">
              Resources {Math.floor(localResourceTotal)}
            </p>
            {selectedUnit ? (
              <p className="play-hud-copy">
                {selectedUnitCount > 1 ? `${selectedUnitCount} selected · ` : ""}
                HP {Math.floor(selectedHp)}/{selectedUnitMaxHp} · Shields{" "}
                {Math.floor(selectedShields)}/{selectedUnitMaxShields} · Speed{" "}
                {selectedSpeed.toFixed(1)} · Weapon {selectedUnitWeaponType}
              </p>
            ) : (
              <p className="play-hud-copy">No unit selected</p>
            )}
          </div>
        </div>,
        document.body,
      )}
      <aside
        className={`tactical-sidebar ${isSidebarOpen ? "open" : "closed"}`}
        aria-hidden={!isSidebarOpen}
      >
        <div className="tactical-sidebar-inner">
          <section className="tactical-panel tactical-panel--primary">
            <div>
              <p className="hud-title">Squad Tactical View</p>
              <p className="hud-copy">
                Drag to box-select multiple ships, then click the field to issue
                group orders. Use right-drag to rotate, middle-drag or WASD/arrow
                keys to pan, and scroll to zoom the camera.
              </p>
            </div>
            {onExit ? (
              <button className="hud-button" type="button" onClick={onExit}>
                Return to lobby
              </button>
            ) : null}
          </section>

          <section className="tactical-panel tactical-panel--primary">
            <div className="tactical-panel-header">
              <p className="hud-title">Credits</p>
              <div className="hud-status">
                <span>Total available</span>
                <strong>{Math.floor(localResourceTotal)}</strong>
              </div>
            </div>
            <p className="hud-copy">
              Total credits across all of your owned bases.
            </p>
          </section>

          <section className="tactical-panel">
            <div className="tactical-panel-header">
              <p className="hud-title">Camera controls</p>
              <div className="hud-status">
                <span>Active ships</span>
                <strong>{unitCount}</strong>
              </div>
            </div>
            <div className="hud-actions">
              <button
                className="hud-button"
                type="button"
                onClick={() => setCameraMode("squad")}
                disabled={cameraMode === "squad"}
              >
                Track squad
              </button>
              <button
                className="hud-button"
                type="button"
                onClick={() => setCameraMode("selected")}
                disabled={cameraMode === "selected" || !selection?.id}
              >
                Track selected
              </button>
              <button
                className="hud-button"
                type="button"
                onClick={() => setCameraMode("free")}
                disabled={cameraMode === "free"}
              >
                Free camera
              </button>
              <button
                className="hud-button"
                type="button"
                onClick={handleDeselectAllUnits}
                disabled={selectedUnitIds.length === 0 && !selection?.id}
              >
                Deselect all units
              </button>
              <button
                className="hud-button"
                type="button"
                onClick={handleReturnCameraToBase}
              >
                Return camera to base
              </button>
            </div>
          </section>

          <section className="tactical-panel">
            <p className="hud-title">
              {selectedUnit ? "Unit status" : "No unit selected"}
            </p>
            {selectedUnit ? (
              <p className="hud-copy">
                {selectedUnitCount > 1
                  ? `${selectedUnitCount} units selected · `
                  : ""}
                Hull {Math.floor(selectedHp)}/{selectedUnitMaxHp} · Shields{" "}
                {Math.floor(selectedShields)}/{selectedUnitMaxShields} · Speed{" "}
                {selectedSpeed.toFixed(1)} · Cargo{" "}
                {Math.floor(selectedUnitCargo)}/{selectedUnitCargoCapacity} ·
                Type {selectedUnitType} · Weapon {selectedUnitWeaponType} · Mounts{" "}
                {selectedUnitWeaponMounts}/{selectedUnitTechMounts} · Order{" "}
                {selectedUnitOrder} · Target {selectedUnitTarget} · Dest{" "}
                {selectedUnitDestination} · Source {selectedUnitSource} · Owner{" "}
                {selectedUnit.owner}.
              </p>
            ) : (
              <p className="hud-copy">
                Click one of your ships to set it as the active unit.
              </p>
            )}
          </section>

          <section className="tactical-panel">
            <p className="hud-title">
              {selectedBase ? "Base command" : "No base selected"}
            </p>
            {selectedBase ? (
              <>
                <p className="hud-copy">
                  Resources: {Math.floor(selectedBase.resourceStock)} · Owner{" "}
                  {selectedBase.owner} · Modules {baseModules.length} · Turrets{" "}
                  {weaponTurretCount}/{WEAPON_TURRET_RING_COUNT}.
                </p>
                <p className="hud-copy">
                  Hull: {Math.max(0, Math.floor(selectedBase.hp))} · Shields:{" "}
                  {Math.max(0, Math.floor(selectedBase.shields))}/
                  {Math.max(0, Math.floor(selectedBase.maxShields))}
                </p>
                <button
                  className="hud-button"
                  type="button"
                  disabled={!canBuildCollector}
                  onClick={() => {
                    if (!room || !selectedBase) {
                      return;
                    }
                    room.send("base:build", {
                      baseId: selectedBase.id,
                      unitType: "RESOURCE_COLLECTOR",
                    });
                  }}
                >
                  Build resource collector ({RESOURCE_COLLECTOR_COST})
                </button>
                <button
                  className="hud-button"
                  type="button"
                  disabled={!canBuildFighter}
                  onClick={() => {
                    if (!room || !selectedBase) {
                      return;
                    }
                    room.send("base:build", {
                      baseId: selectedBase.id,
                      unitType: "FIGHTER",
                    });
                  }}
                >
                  Build fighter ({FIGHTER_COST})
                </button>
              </>
            ) : (
              <p className="hud-copy">
                Click your base to open the build menu.
              </p>
            )}
          </section>

          <section className="tactical-panel">
            <p className="hud-title">Station modules</p>
            <p className="hud-copy">
              Purchase orbital modules around your base to unlock tech upgrades,
              repairs, and weapon outfitting.
            </p>
            <div className="mount-shop">
              <div className="mount-card">
                <div className="mount-card-header">
                  <div>
                    <p className="mount-label">Research</p>
                    <p className="mount-title">Lab</p>
                  </div>
                  <span className="mount-badge">
                    {hasTechShop ? "Online" : "Offline"}
                  </span>
                </div>
                <div className="mount-card-body">
                  <p className="mount-meta">
                    Cost: {MODULE_TECH_SHOP_COST} · Unlock the lab tech tree.
                  </p>
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseTechShop}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "TECH_SHOP",
                      });
                    }}
                  >
                    {hasTechShop ? "Lab installed" : "Purchase lab"}
                  </button>
                  {hasTechShop ? (
                    <button
                      className="hud-button mount-action"
                      type="button"
                      onClick={() => setIsLabModalOpen(true)}
                    >
                      Open lab tech tree
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mount-card">
                <div className="mount-card-header">
                  <div>
                    <p className="mount-label">Maintenance</p>
                    <p className="mount-title">Repair bay</p>
                  </div>
                  <span className="mount-badge">
                    {hasRepairBay ? "Operational" : "Offline"}
                  </span>
                </div>
                <div className="mount-card-body">
                  <p className="mount-meta">
                    Cost: {MODULE_REPAIR_BAY_COST} · Auto-repairs nearby ships.
                  </p>
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseRepairBay}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "REPAIR_BAY",
                      });
                    }}
                  >
                    {hasRepairBay
                      ? "Repair bay installed"
                      : "Purchase repair bay"}
                  </button>
                </div>
              </div>
              <div className="mount-card">
                <div className="mount-card-header">
                  <div>
                    <p className="mount-label">Loadout</p>
                    <p className="mount-title">Garage</p>
                  </div>
                  <span className="mount-badge">
                    {hasGarage ? "Ready" : "Offline"}
                  </span>
                </div>
                <div className="mount-card-body">
                  <p className="mount-meta">
                    Cost: {MODULE_GARAGE_COST} · Install weapon mounts, containers, and ship upgrades.
                  </p>
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseGarage}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "GARAGE",
                      });
                    }}
                  >
                    {hasGarage ? "Garage installed" : "Purchase garage"}
                  </button>
                  {hasGarage ? (
                    <button
                      className="hud-button mount-action"
                      type="button"
                      onClick={() => setIsGarageModalOpen(true)}
                    >
                      Open garage upgrades
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="mount-card">
                <div className="mount-card-header">
                  <div>
                    <p className="mount-label">Defense ring</p>
                    <p className="mount-title">Weapon turret</p>
                  </div>
                  <span className="mount-badge">
                    {weaponTurretCount}/{WEAPON_TURRET_RING_COUNT}
                  </span>
                </div>
                <div className="mount-card-body">
                  <p className="mount-meta">
                    Cost: {MODULE_WEAPON_TURRET_COST} · Choose turret weapon type.
                  </p>
                  <label className="mount-select">
                    Weapon type
                    <select
                      value={effectiveModuleWeaponType}
                      onChange={(event) =>
                        setModuleWeaponType(
                          event.target.value as (typeof WEAPON_TYPES)[number],
                        )
                      }
                    >
                      {availableWeaponTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseWeaponTurret}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "WEAPON_TURRET",
                        weaponType: effectiveModuleWeaponType,
                      });
                    }}
                  >
                    Install turret module
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="tactical-panel">
            <p className="hud-title">
              {selectedModule ? "Module access" : "No module selected"}
            </p>
            {selectedModule ? (
              <>
                <p className="hud-copy">
                  {selectedModule.moduleType} · Weapon{" "}
                  {selectedModule.weaponType || "n/a"} ·{" "}
                  {selectedModule.active ? "Active" : "Offline"}
                </p>
                {selectedModule.moduleType === "GARAGE" ? (
                  <p className="hud-copy">
                    Garage upgrades now open in a dedicated modal and apply fleet-wide.
                  </p>
                ) : null}
                {selectedModule.moduleType === "TECH_SHOP" ? (
                  <p className="hud-copy">
                    Research is managed in the lab tree. Ship loadout upgrades are now installed
                    from the Garage module.
                  </p>
                ) : null}
                {selectedModule.moduleType === "REPAIR_BAY" ? (
                  <p className="hud-copy">
                    Dock ships here to auto-repair hull and shields.
                  </p>
                ) : null}
              </>
            ) : (
              <p className="hud-copy">
                Click a module to manage its services and send ships to interact.
              </p>
            )}
          </section>

          <section className="tactical-panel">
            <p className="hud-title">Debug telemetry</p>
            <p className="hud-copy">
              Room: {debugInfo.roomId} · Session: {debugInfo.sessionId}
            </p>
            <p className="hud-copy">
              Connected: {debugInfo.hasRoom ? "yes" : "no"} · Units ready:{" "}
              {debugInfo.hasUnits ? "yes" : "no"} · Unit count:{" "}
              {debugInfo.unitTotal}
            </p>
            <p className="hud-copy">
              Resources: {resourceCount} · Last resource click:{" "}
              {lastResourceClick
                ? `${lastResourceClick.id} (${new Date(
                    lastResourceClick.at,
                  ).toLocaleTimeString()})`
                : "n/a"}
            </p>
            <p className="hud-copy">
              Credits total: {Math.floor(localResourceTotal)}
            </p>
          </section>
        </div>
      </aside>
      <button
        className="tactical-sidebar-toggle"
        type="button"
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        aria-expanded={isSidebarOpen}
      >
        {isSidebarOpen ? "Hide panel" : "Show panel"} · Credits{" "}
        {Math.floor(localResourceTotal)}
      </button>
      {isLabModalOpen && selectedBase
        ? createPortal(
            <div className="lab-modal-backdrop" role="presentation">
              <div
                className="lab-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Lab tech tree"
              >
                <div className="lab-modal-header">
                  <div>
                    <p className="mount-label">Research</p>
                    <p className="mount-title">Lab Tech Tree</p>
                  </div>
                  <button
                    className="hud-button"
                    type="button"
                    onClick={() => setIsLabModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <p className="hud-copy">
                  Queue one research at a time. Default unlocks remain resource
                  collectors, fighters, and lasers.
                </p>
                <p className="hud-copy">
                  Active research:{" "}
                  {selectedBase.activeResearchKey
                    ? `${selectedBase.activeResearchKey} (${Math.ceil(
                        selectedBase.activeResearchRemaining,
                      )}s)`
                    : "none"}
                </p>
                <div className="lab-tech-grid">
                  {LAB_RESEARCH_TREE.map((research) => {
                    const isUnlocked = !!selectedBase[research.unlockedBy];
                    const hasPrereqs = research.prerequisiteKeys.every(
                      (prereq) => researchStateByKey.get(prereq),
                    );
                    const isActive =
                      selectedBase.activeResearchKey === research.key;
                    const canStart =
                      !isUnlocked &&
                      !isActive &&
                      !selectedBase.activeResearchKey &&
                      hasPrereqs &&
                      selectedBase.resourceStock >= research.cost;
                    return (
                      <div className="lab-tech-card" key={research.key}>
                        <p className="lab-tech-title">{research.title}</p>
                        <p className="mount-meta">{research.description}</p>
                        <p className="mount-meta">
                          Cost {research.cost} · Time {research.durationSeconds}s
                        </p>
                        <button
                          className="hud-button mount-action"
                          type="button"
                          disabled={!canStart}
                          onClick={() => {
                            if (!room || !selectedBase) {
                              return;
                            }
                            room.send("lab:startResearch", {
                              baseId: selectedBase.id,
                              researchKey: research.key,
                            });
                          }}
                        >
                          {isUnlocked
                            ? "Researched"
                            : isActive
                              ? "Researching..."
                              : hasPrereqs
                                ? "Start research"
                                : "Locked by prerequisite"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {isGarageModalOpen && selectedBase
        ? createPortal(
            <div className="lab-modal-backdrop" role="presentation">
              <div
                className="lab-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Garage ship upgrades"
              >
                <div className="lab-modal-header">
                  <div>
                    <p className="mount-label">Loadout</p>
                    <p className="mount-title">Garage Ship Upgrades</p>
                  </div>
                  <button
                    className="hud-button"
                    type="button"
                    onClick={() => setIsGarageModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <p className="hud-copy">
                  Garage upgrades apply to all current ships you own.
                </p>
                <p className="hud-copy">
                  Credits: {Math.floor(selectedBase.resourceStock)}
                </p>
                {availableTechUpgrades.length > 0 ? (
                  <div className="lab-tech-grid">
                    {availableTechUpgrades.map(([key, cost]) => {
                      const canPurchase = selectedBase.resourceStock >= cost;
                      const currentLevel =
                        key === "SHIELDS"
                          ? selectedBase.shieldUpgradeLevel
                          : key === "HULL"
                            ? selectedBase.hullUpgradeLevel
                            : key === "SPEED"
                              ? selectedBase.speedUpgradeLevel
                              : key === "RADAR"
                                ? selectedBase.radarUpgradeLevel
                                : key === "WEAPON"
                                  ? selectedBase.weaponUpgradeLevel
                                  : Math.floor(
                                      selectedBase.collectorStorageBonus /
                                        COLLECTOR_TANK_CAPACITY_STEP,
                                    );
                      const maxLevel =
                        key === "STORAGE"
                          ? COLLECTOR_MAX_TANK_UPGRADES
                          : MAX_SHIP_TECH_UPGRADE_LEVEL;
                      return (
                        <div className="lab-tech-card" key={key}>
                          <p className="lab-tech-title">{key}</p>
                          <p className="mount-meta">Fleet-wide ship upgrade</p>
                          <p className="mount-meta">
                            Level {currentLevel}/{maxLevel}
                          </p>
                          <p className="mount-meta">Cost {cost}</p>
                          <button
                            className="hud-button mount-action"
                            type="button"
                            disabled={!canPurchase || !room || !selectedBase}
                            onClick={() => {
                              if (!room || !selectedBase) {
                                return;
                              }
                              room.send("module:techUpgrade", {
                                baseId: selectedBase.id,
                                upgradeType: key,
                              });
                            }}
                          >
                            Apply to fleet
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="hud-copy">
                    No ship upgrades researched yet. Use the lab tech tree first.
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
      {isUnitModalOpen && selectedUnit
        ? createPortal(
            <div className="entity-modal-backdrop" role="presentation">
              <div
                className="entity-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Unit details"
              >
                <div className="lab-modal-header">
                  <p className="mount-title">Unit details</p>
                  <button
                    className="hud-button"
                    type="button"
                    onClick={() => setIsUnitModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <p className="hud-copy">
                  {selectedUnitType} · HP {Math.floor(selectedHp)}/
                  {selectedUnitMaxHp} · Shields {Math.floor(selectedShields)}/
                  {selectedUnitMaxShields}
                </p>
                <p className="hud-copy">
                  Weapon {selectedUnitWeaponType} · Mounts{" "}
                  {selectedUnitWeaponMounts}/{selectedUnitTechMounts} · Cargo{" "}
                  {Math.floor(selectedUnitCargo)}/{selectedUnitCargoCapacity}
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
      {isBaseModalOpen && selectedBase
        ? createPortal(
            <div className="entity-modal-backdrop" role="presentation">
              <div
                className="entity-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Base command"
              >
                <div className="lab-modal-header">
                  <p className="mount-title">Base command</p>
                  <button
                    className="hud-button"
                    type="button"
                    onClick={() => setIsBaseModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <p className="hud-copy">
                  Resources {Math.floor(selectedBase.resourceStock)} · Modules{" "}
                  {baseModules.length}
                </p>
                <div className="module-actions">
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canBuildCollector}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:build", {
                        baseId: selectedBase.id,
                        unitType: "RESOURCE_COLLECTOR",
                      });
                    }}
                  >
                    Build collector
                  </button>
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canBuildFighter}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:build", {
                        baseId: selectedBase.id,
                        unitType: "FIGHTER",
                      });
                    }}
                  >
                    Build fighter
                  </button>
                </div>
                <p className="hud-copy">
                  Stations and defenses ({weaponTurretCount}/
                  {WEAPON_TURRET_RING_COUNT} turrets)
                </p>
                <div className="module-actions">
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseTechShop}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "TECH_SHOP",
                      });
                      setShouldAutoOpenLabAfterPurchase(true);
                    }}
                  >
                    {hasTechShop ? "Lab installed" : `Build lab (${MODULE_TECH_SHOP_COST})`}
                  </button>
                  {hasTechShop ? (
                    <button
                      className="hud-button mount-action"
                      type="button"
                      onClick={() => setIsLabModalOpen(true)}
                    >
                      Open tech tree
                    </button>
                  ) : null}
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseRepairBay}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "REPAIR_BAY",
                      });
                    }}
                  >
                    {hasRepairBay
                      ? "Repair bay installed"
                      : `Build repair bay (${MODULE_REPAIR_BAY_COST})`}
                  </button>
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseGarage}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "GARAGE",
                      });
                    }}
                  >
                    {hasGarage ? "Garage installed" : `Build garage (${MODULE_GARAGE_COST})`}
                  </button>
                  <label className="mount-select">
                    Turret weapon type
                    <select
                      value={effectiveModuleWeaponType}
                      onChange={(event) =>
                        setModuleWeaponType(
                          event.target.value as (typeof WEAPON_TYPES)[number],
                        )
                      }
                    >
                      {availableWeaponTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="hud-button mount-action"
                    type="button"
                    disabled={!canPurchaseWeaponTurret}
                    onClick={() => {
                      if (!room || !selectedBase) {
                        return;
                      }
                      room.send("base:purchaseModule", {
                        baseId: selectedBase.id,
                        moduleType: "WEAPON_TURRET",
                        weaponType: effectiveModuleWeaponType,
                      });
                    }}
                  >
                    Build turret ({MODULE_WEAPON_TURRET_COST})
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
      {isModuleModalOpen && selectedModule
        ? createPortal(
            <div className="entity-modal-backdrop" role="presentation">
              <div
                className="entity-modal"
                role="dialog"
                aria-modal="true"
                aria-label="Module details"
              >
                <div className="lab-modal-header">
                  <p className="mount-title">{selectedModule.moduleType}</p>
                  <button
                    className="hud-button"
                    type="button"
                    onClick={() => setIsModuleModalOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <p className="hud-copy">
                  {selectedModule.active ? "Active" : "Offline"} · Weapon{" "}
                  {selectedModule.weaponType || "n/a"}
                </p>
                {selectedModule.moduleType === "TECH_SHOP" ? (
                  <button
                    className="hud-button mount-action"
                    type="button"
                    onClick={() => setIsLabModalOpen(true)}
                  >
                    Open lab tech tree
                  </button>
                ) : selectedModule.moduleType === "GARAGE" ? (
                  <button
                    className="hud-button mount-action"
                    type="button"
                    onClick={() => {
                      setSelectedBaseId(selectedModule.baseId);
                      setIsGarageModalOpen(true);
                    }}
                  >
                    Open garage upgrades
                  </button>
                ) : (
                  <p className="hud-copy">
                    Move a ship here to interact with this module.
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
