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

const UNIT_COLORS = {
  friendly: new THREE.Color("#7dd3fc"),
  enemy: new THREE.Color("#f87171"),
  selected: new THREE.Color("#facc15"),
};
const BASE_COLOR = new THREE.Color("#a855f7");
const RESOURCE_COLOR = new THREE.Color("#34d399");

const PLANE_SIZE = 180;
const MOVE_EPSILON = 0.25;

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
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedHp, setSelectedHp] = useState(0);
  const [unitCount, setUnitCount] = useState(0);
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
    localSessionIdRef.current = localSessionId;
  }, [localSessionId]);

  useEffect(() => {
    if (!room) {
      return;
    }
    room.send("lobby:ensureWorld");
    room.send("lobby:ensureUnits");
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
      room.send("lobby:ensureUnits");
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

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);
    camera.position.set(0, 90, 140);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const grid = new THREE.GridHelper(PLANE_SIZE, 20, "#2a3b64", "#1d2a4c");
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
      setDebugInfo({
        roomId: room?.roomId ?? "n/a",
        sessionId: room?.sessionId ?? "n/a",
        hasRoom: !!room,
        hasUnits: !!room?.state?.units,
        unitTotal: room?.state?.units?.size ?? 0,
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
      });
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
    meshesRef.current.forEach((render, unitId) => {
      const material = render.mesh.material as THREE.MeshStandardMaterial;
      if (selectedId && unitId === selectedId) {
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
  }, [localSessionId, selection]);

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

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!rendererRef.current || !cameraRef.current) {
      return;
    }
    const { x, y, width, height } = getCanvasCoords(event);
    pointerNdc.x = (x / width) * 2 - 1;
    pointerNdc.y = -(y / height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, cameraRef.current);

    const meshes = Array.from(meshesRef.current.values()).map(
      (render) => render.mesh,
    );

    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const hitId = hits[0].object.userData.id as string;
      const render = meshesRef.current.get(hitId);
      if (render && render.owner === localSessionId) {
        setSelection({ id: hitId });
      } else {
        setSelection(null);
      }
      return;
    }

    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(targetPlane, target)) {
      if (selection?.id && room) {
        room.send("command", {
          t: "MOVE",
          unitIds: [selection.id],
          x: target.x,
          z: target.z,
        });
      } else {
        setSelection(null);
      }
    }
  };

  const selectedUnit = selection?.id
    ? unitsRef.current?.get(selection.id) ??
      fallbackUnitsRef.current.get(selection.id) ??
      null
    : null;
  const selectedUnitType =
    selectedUnit && "unitType" in selectedUnit
      ? selectedUnit.unitType
      : "RESOURCE_COLLECTOR";

  return (
    <div className="tactical-view">
      <div
        className="tactical-canvas"
        ref={containerRef}
        onPointerUp={handlePointerUp}
      ></div>
      <div className="tactical-hud">
        <div>
          <p className="hud-title">Squad Tactical View</p>
          <p className="hud-copy">
            Select your ships to issue orders. Click the field to move the
            selected unit. Enemy movement syncs live from the squad channel.
          </p>
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
              Hull {Math.floor(selectedHp)}/100 · Type {selectedUnitType} · Owner{" "}
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
          <p className="hud-title">Debug telemetry</p>
          <p className="hud-copy">
            Room: {debugInfo.roomId} · Session: {debugInfo.sessionId}
          </p>
          <p className="hud-copy">
            Connected: {debugInfo.hasRoom ? "yes" : "no"} · Units ready:{" "}
            {debugInfo.hasUnits ? "yes" : "no"} · Unit count:{" "}
            {debugInfo.unitTotal}
          </p>
        </div>
      </div>
    </div>
  );
}
