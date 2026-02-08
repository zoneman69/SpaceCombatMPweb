import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import * as THREE from "three";
import type {
  BaseSchema,
  ResourceNodeSchema,
  SpaceState,
  UnitSchema,
} from "@space-combat/shared";

type TacticalViewProps = {
  room: Room<SpaceState> | null;
  localSessionId: string | null;
};

type Selection = { id: string } | null;
type CameraMode = "squad" | "selected" | "free";

type UnitRender = {
  mesh: THREE.Mesh;
  owner: string;
};

type MapRender = {
  mesh: THREE.Mesh;
};

type DebugUnit = {
  id: string;
  owner: string;
  x: number;
  z: number;
};

const getUnitFogRadius = (unit: UnitSchema | DebugUnit) => {
  if ("unitType" in unit) {
    return unit.unitType === "FIGHTER"
      ? FOG_FIGHTER_VISION_RADIUS
      : FOG_COLLECTOR_VISION_RADIUS;
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

const PLANE_SIZE = 720;
const GRID_DIVISIONS = 36;
const CAMERA_HEIGHT = 190;
const CAMERA_DISTANCE = 300;
const CAMERA_LERP_SPEED = 2.5;
const CAMERA_ROTATE_SPEED = 0.005;
const CAMERA_PAN_SPEED = 0.9;
const CAMERA_ZOOM_SPEED = 0.25;
const CAMERA_PITCH_MIN = 0.2;
const CAMERA_PITCH_MAX = 1.25;
const CAMERA_RADIUS_MIN = 120;
const CAMERA_RADIUS_MAX = 620;
const MOVE_EPSILON = 0.25;
const RESOURCE_COLLECTOR_COST = 100;
const FIGHTER_COST = 150;
const RESOURCE_SCALE_MIN = 0.5;
const RESOURCE_SCALE_MAX = 1.6;
const SELECTION_DRAG_THRESHOLD = 6;
const FOG_FIGHTER_VISION_RADIUS = 130;
const FOG_COLLECTOR_VISION_RADIUS = 160;
const FOG_BASE_VISION_RADIUS = 200;
const FOG_VISIBILITY_EPSILON = 0.01;

export default function TacticalView({ room, localSessionId }: TacticalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const requestRef = useRef<number | null>(null);
  const unitsRef = useRef<SpaceState["units"] | null>(null);
  const basesRef = useRef<SpaceState["bases"] | null>(null);
  const resourcesRef = useRef<SpaceState["resources"] | null>(null);
  const meshesRef = useRef<Map<string, UnitRender>>(new Map());
  const baseMeshesRef = useRef<Map<string, MapRender>>(new Map());
  const resourceMeshesRef = useRef<Map<string, MapRender>>(new Map());
  const fallbackUnitsRef = useRef<Map<string, DebugUnit>>(new Map());
  const localSessionIdRef = useRef<string | null>(localSessionId);
  const selectionRef = useRef<Selection>(null);
  const selectedBaseIdRef = useRef<string | null>(null);
  const cameraModeRef = useRef<CameraMode>("squad");
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
  const [unitCount, setUnitCount] = useState(0);
  const [selectedBaseId, setSelectedBaseId] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("squad");
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
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    selectedBaseIdRef.current = selectedBaseId;
  }, [selectedBaseId]);

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

    const unitGeometry = new THREE.SphereGeometry(2.6, 12, 12);
    const baseGeometry = new THREE.CylinderGeometry(4.4, 5.6, 4, 12);
    const resourceGeometry = new THREE.OctahedronGeometry(3.4, 0);

    const ensureUnitMesh = (unit: UnitSchema | DebugUnit) => {
      if (meshesRef.current.has(unit.id)) {
        return;
      }
      const material = new THREE.MeshStandardMaterial({
        color:
          unit.owner === localSessionIdRef.current
            ? UNIT_COLORS.friendly.clone()
            : UNIT_COLORS.enemy.clone(),
        emissive: new THREE.Color("#0b1b3a"),
      });
      const mesh = new THREE.Mesh(unitGeometry.clone(), material);
      mesh.position.set(unit.x, 0, unit.z);
      mesh.userData = { id: unit.id };
      scene.add(mesh);
      meshesRef.current.set(unit.id, { mesh, owner: unit.owner });
    };

    const removeUnitMesh = (unitId: string) => {
      const render = meshesRef.current.get(unitId);
      if (!render) {
        return;
      }
      scene.remove(render.mesh);
      render.mesh.geometry.dispose();
      (render.mesh.material as THREE.Material).dispose();
      meshesRef.current.delete(unitId);
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

    room?.onStateChange((state) => {
      if (state?.bases) {
        bindBases(state.bases);
      }
      if (state?.resources) {
        bindResources(state.resources);
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
      if (activeUnits) {
        activeUnits.forEach((unit) => {
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
        });
      }
      basesRef.current?.forEach((base) => {
        const render = baseMeshesRef.current.get(base.id);
        if (!render) {
          return;
        }
        render.mesh.position.set(base.x, 0, base.z);
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
      renderer.dispose();
      unitGeometry.dispose();
      baseGeometry.dispose();
      resourceGeometry.dispose();
      meshesRef.current.forEach((render) => {
        render.mesh.geometry.dispose();
        (render.mesh.material as THREE.Material).dispose();
      });
      meshesRef.current.clear();
      baseMeshesRef.current.forEach((render) => {
        render.mesh.geometry.dispose();
        (render.mesh.material as THREE.Material).dispose();
      });
      baseMeshesRef.current.clear();
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
    meshesRef.current.forEach((render, unitId) => {
      const material = render.mesh.material as THREE.MeshStandardMaterial;
      if (selectedSet.has(unitId)) {
        material.color = UNIT_COLORS.selected.clone();
        return;
      }
      material.color =
        render.owner === localSessionId
          ? UNIT_COLORS.friendly.clone()
          : UNIT_COLORS.enemy.clone();
    });

    if (!selectedId) {
      setSelectedHp(0);
      return;
    }
    const selectedUnit =
      unitsRef.current?.get(selectedId) ??
      fallbackUnitsRef.current.get(selectedId);
    setSelectedHp(
      selectedUnit && "hp" in selectedUnit ? selectedUnit.hp : 100,
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

    const baseMeshes = Array.from(baseMeshesRef.current.values()).map(
      (render) => render.mesh,
    );
    const baseHits = raycaster.intersectObjects(baseMeshes, false);
    if (baseHits.length > 0) {
      const hitId = baseHits[0].object.userData.id as string;
      const base = basesRef.current?.get(hitId);
      if (base && base.owner === localSessionId) {
        setSelectedBaseId(hitId);
      } else {
        setSelectedBaseId(null);
      }
      setSelection(null);
      setSelectedUnitIds([]);
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
      } else {
        setSelection(null);
        setSelectedUnitIds([]);
        setSelectedBaseId(null);
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
        room.send("command", {
          t: "MOVE",
          unitIds: selectedUnitIds,
          x: target.x,
          z: target.z,
        });
      } else {
        setSelection(null);
        setSelectedUnitIds([]);
      }
    }
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
  const selectedUnitWeaponMounts =
    selectedUnit && "weaponMounts" in selectedUnit ? selectedUnit.weaponMounts : 0;
  const selectedUnitTechMounts =
    selectedUnit && "techMounts" in selectedUnit ? selectedUnit.techMounts : 0;
  const resourceCount = resourcesRef.current?.size ?? 0;

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
      <div className="tactical-hud">
        <div>
          <p className="hud-title">Squad Tactical View</p>
          <p className="hud-copy">
            Drag to box-select multiple ships, then click the field to issue
            group orders. Use right-drag to rotate, middle-drag to pan, and
            scroll to zoom the camera.
          </p>
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
          </div>
        </div>
        <div className="hud-status">
          <span>Active ships</span>
          <strong>{unitCount}</strong>
        </div>
      </div>
      <div className="tactical-hud tactical-hud-secondary">
        <div>
          <p className="hud-title">
            {selectedUnit ? "Unit status" : "No unit selected"}
          </p>
          {selectedUnit ? (
            <p className="hud-copy">
              {selectedUnitCount > 1
                ? `${selectedUnitCount} units selected · `
                : ""}
              Hull {Math.floor(selectedHp)}/100 · Cargo{" "}
              {Math.floor(selectedUnitCargo)}/{selectedUnitCargoCapacity} ·
              Type {selectedUnitType} · Mounts{" "}
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
        </div>
      </div>
      <div className="tactical-hud tactical-hud-secondary">
        <div>
          <p className="hud-title">
            {selectedBase ? "Base command" : "No base selected"}
          </p>
          {selectedBase ? (
            <>
              <p className="hud-copy">
                Resources: {Math.floor(selectedBase.resourceStock)} · Owner{" "}
                {selectedBase.owner}.
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
        </div>
      </div>
      <div className="tactical-hud tactical-hud-secondary">
        <div>
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
        </div>
      </div>
    </div>
  );
}
