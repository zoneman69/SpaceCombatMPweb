import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type Unit = {
  id: string;
  mesh: THREE.Mesh;
  target: THREE.Vector3;
};

type SelectionBox = {
  active: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

const UNIT_COLORS = {
  idle: new THREE.Color("#7dd3fc"),
  selected: new THREE.Color("#facc15"),
};

const PLANE_SIZE = 180;
const UNIT_SPEED = 18;

export default function TacticalView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const unitsRef = useRef<Unit[]>([]);
  const requestRef = useRef<number | null>(null);
  const selectionStart = useRef<{ x: number; y: number } | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox>({
    active: false,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

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
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
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

    const baseGeometry = new THREE.ConeGeometry(2.4, 8, 6);
    baseGeometry.rotateX(Math.PI / 2);

    const units: Unit[] = Array.from({ length: 8 }, (_, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: UNIT_COLORS.idle.clone(),
        emissive: new THREE.Color("#0a132a"),
      });
      const mesh = new THREE.Mesh(baseGeometry, material);
      mesh.position.set(
        (Math.random() - 0.5) * (PLANE_SIZE * 0.6),
        0,
        (Math.random() - 0.5) * (PLANE_SIZE * 0.6),
      );
      scene.add(mesh);
      return {
        id: `unit-${index}`,
        mesh,
        target: mesh.position.clone(),
      };
    });
    unitsRef.current = units;

    const resize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) {
        return;
      }
      const { width, height } = container.getBoundingClientRect();
      rendererRef.current.setSize(width, height);
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
      unitsRef.current.forEach((unit) => {
        const distance = unit.mesh.position.distanceTo(unit.target);
        if (distance > 0.1) {
          const direction = unit.target.clone().sub(unit.mesh.position).normalize();
          const step = Math.min(distance, UNIT_SPEED * delta);
          unit.mesh.position.add(direction.multiplyScalar(step));
          unit.mesh.lookAt(unit.target);
        }
      });
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
      baseGeometry.dispose();
      units.forEach((unit) => {
        unit.mesh.geometry.dispose();
        (unit.mesh.material as THREE.Material).dispose();
      });
      container.removeChild(renderer.domElement);
    };
  }, [pointerNdc, raycaster, targetPlane]);

  useEffect(() => {
    const selectedSet = new Set(selectedIds);
    unitsRef.current.forEach((unit) => {
      const material = unit.mesh.material as THREE.MeshStandardMaterial;
      material.color = selectedSet.has(unit.id)
        ? UNIT_COLORS.selected.clone()
        : UNIT_COLORS.idle.clone();
    });
  }, [selectedIds]);

  const getCanvasCoords = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    const { x, y } = getCanvasCoords(event);
    selectionStart.current = { x, y };
    setSelectionBox({ active: true, x, y, width: 0, height: 0 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectionStart.current) {
      return;
    }
    const { x, y } = getCanvasCoords(event);
    const start = selectionStart.current;
    const left = Math.min(start.x, x);
    const top = Math.min(start.y, y);
    const width = Math.abs(start.x - x);
    const height = Math.abs(start.y - y);
    setSelectionBox({ active: true, x: left, y: top, width, height });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectionStart.current) {
      return;
    }
    const { width: canvasWidth, height: canvasHeight } = getCanvasCoords(event);
    const { x, y, width, height } = selectionBox;
    const selected = unitsRef.current
      .filter((unit) => {
        const projected = unit.mesh.position.clone();
        projected.project(cameraRef.current as THREE.Camera);
        const screenX = (projected.x * 0.5 + 0.5) * canvasWidth;
        const screenY = (-projected.y * 0.5 + 0.5) * canvasHeight;
        return (
          screenX >= x &&
          screenX <= x + width &&
          screenY >= y &&
          screenY <= y + height
        );
      })
      .map((unit) => unit.id);
    setSelectedIds(selected);
    selectionStart.current = null;
    setSelectionBox((prev) => ({ ...prev, active: false, width: 0, height: 0 }));
  };

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!rendererRef.current || !cameraRef.current) {
      return;
    }
    const { x, y, width, height } = getCanvasCoords(event as any);
    pointerNdc.x = (x / width) * 2 - 1;
    pointerNdc.y = -(y / height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, cameraRef.current);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(targetPlane, target)) {
      const selection = new Set(selectedIds);
      unitsRef.current.forEach((unit, index) => {
        if (!selection.has(unit.id)) {
          return;
        }
        const offset = new THREE.Vector3(
          (index % 3) * 4,
          0,
          Math.floor(index / 3) * 4,
        );
        unit.target = target.clone().add(offset);
      });
    }
  };

  return (
    <div className="tactical-view">
      <div
        className="tactical-canvas"
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onContextMenu={onContextMenu}
      >
        {selectionBox.active && (
          <div
            className="selection-box"
            style={{
              left: selectionBox.x,
              top: selectionBox.y,
              width: selectionBox.width,
              height: selectionBox.height,
            }}
          />
        )}
      </div>
      <div className="tactical-hud">
        <div>
          <p className="hud-title">Squad Tactical View</p>
          <p className="hud-copy">
            Drag a box to select ships. Right-click to issue a move order.
          </p>
        </div>
        <div className="hud-status">
          <span>Selected</span>
          <strong>{selectedIds.length}</strong>
        </div>
      </div>
    </div>
  );
}
