import { useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import * as THREE from "three";
import type { SpaceState, UnitSchema } from "@space-combat/shared";

type TacticalViewProps = {
  room: Room<SpaceState> | null;
  localSessionId: string | null;
};

type Selection = { id: string } | null;

type UnitRender = {
  mesh: THREE.Mesh;
  owner: string;
};

const UNIT_COLORS = {
  friendly: new THREE.Color("#7dd3fc"),
  enemy: new THREE.Color("#f87171"),
  selected: new THREE.Color("#facc15"),
};

const PLANE_SIZE = 180;
const MOVE_EPSILON = 0.25;

export default function TacticalView({ room, localSessionId }: TacticalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const requestRef = useRef<number | null>(null);
  const unitsRef = useRef<SpaceState["units"] | null>(null);
  const meshesRef = useRef<Map<string, UnitRender>>(new Map());
  const [selection, setSelection] = useState<Selection>(null);
  const [selectedHp, setSelectedHp] = useState(0);
  const [unitCount, setUnitCount] = useState(0);

  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const targetPlane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    [],
  );

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

    const ensureUnitMesh = (unit: UnitSchema) => {
      if (meshesRef.current.has(unit.id)) {
        return;
      }
      const material = new THREE.MeshStandardMaterial({
        color:
          unit.owner === localSessionId
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

    const bindUnits = (units: SpaceState["units"]) => {
      if (unitsRef.current === units) {
        return;
      }
      unitsRef.current = units;
      Array.from(units.values()).forEach((unit) => ensureUnitMesh(unit));
      setUnitCount(units.size);
      units.onAdd((unit) => {
        ensureUnitMesh(unit);
        setUnitCount((prev) => prev + 1);
      });
      units.onRemove((unit) => {
        removeUnitMesh(unit.id);
        setSelection((prev) => (prev?.id === unit.id ? null : prev));
        setUnitCount((prev) => Math.max(0, prev - 1));
      });
    };

    if (room?.state?.units) {
      bindUnits(room.state.units);
    } else if (room) {
      room.onStateChange((state) => {
        if (state?.units) {
          bindUnits(state.units);
        }
      });
    }

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
      if (units) {
        Array.from(units.values()).forEach((unit) => {
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
          mesh.rotation.y = -unit.rot;
        });
      }
      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      resizeObserver.disconnect();
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      renderer.dispose();
      unitGeometry.dispose();
      meshesRef.current.forEach((render) => {
        render.mesh.geometry.dispose();
        (render.mesh.material as THREE.Material).dispose();
      });
      meshesRef.current.clear();
      container.removeChild(renderer.domElement);
    };
  }, [localSessionId, room, pointerNdc, raycaster, targetPlane]);

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

    if (!selectedId || !unitsRef.current) {
      setSelectedHp(0);
      return;
    }
    const selectedUnit = unitsRef.current.get(selectedId);
    setSelectedHp(selectedUnit?.hp ?? 0);
  }, [localSessionId, selection]);

  useEffect(() => {
    if (!selection?.id) {
      return;
    }
    const interval = window.setInterval(() => {
      const unit = unitsRef.current?.get(selection.id);
      if (unit) {
        setSelectedHp(unit.hp);
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
    ? unitsRef.current?.get(selection.id) ?? null
    : null;

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
              Hull {Math.floor(selectedHp)}/100. Owner {selectedUnit.owner}.
            </p>
          ) : (
            <p className="hud-copy">
              Click one of your ships to set it as the active unit.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
