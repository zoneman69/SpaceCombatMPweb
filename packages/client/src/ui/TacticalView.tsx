import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type BaseUnit = {
  id: string;
  mesh: THREE.Mesh;
  health: number;
  maxHealth: number;
};

type CollectorState = "idle" | "moving" | "movingToResource" | "gathering" | "returning";

type CollectorUnit = {
  id: string;
  mesh: THREE.Mesh;
  target: THREE.Vector3;
  state: CollectorState;
  cargo: number;
  capacity: number;
  assignedResourceId: string | null;
  homeBaseId: string;
};

type ResourceNode = {
  id: string;
  mesh: THREE.Mesh;
  amount: number;
  maxAmount: number;
};

type ShipUnit = {
  id: string;
  mesh: THREE.Mesh;
};

type Selection =
  | { type: "base"; id: string }
  | { type: "collector"; id: string }
  | null;

const UNIT_COLORS = {
  idle: new THREE.Color("#7dd3fc"),
  selected: new THREE.Color("#facc15"),
  base: new THREE.Color("#60a5fa"),
  collector: new THREE.Color("#fef08a"),
  resource: new THREE.Color("#fb7185"),
  ship: new THREE.Color("#c084fc"),
};

const PLANE_SIZE = 180;
const COLLECTOR_SPEED = 16;
const SHIP_COST = 50;
const GATHER_RATE = 12;
const COLLECTOR_CAPACITY = 40;
const RESOURCE_PICKUP_DISTANCE = 2.6;
const BASE_DROPOFF_DISTANCE = 4.2;
const MOVE_EPSILON = 0.25;

export default function TacticalView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const basesRef = useRef<BaseUnit[]>([]);
  const collectorsRef = useRef<CollectorUnit[]>([]);
  const resourcesRef = useRef<ResourceNode[]>([]);
  const shipsRef = useRef<ShipUnit[]>([]);
  const requestRef = useRef<number | null>(null);
  const oreRef = useRef(0);
  const [oreCount, setOreCount] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);

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

    const baseGeometry = new THREE.ConeGeometry(4, 10, 6);
    baseGeometry.rotateX(Math.PI / 2);
    const collectorGeometry = new THREE.BoxGeometry(3.2, 2.2, 3.2);
    const resourceGeometry = new THREE.DodecahedronGeometry(2.6, 0);
    const shipGeometry = new THREE.SphereGeometry(2.1, 12, 12);

    const basePositions = [
      new THREE.Vector3(-50, 0, -40),
      new THREE.Vector3(50, 0, 40),
    ];

    const bases: BaseUnit[] = basePositions.map((position, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: UNIT_COLORS.base.clone(),
        emissive: new THREE.Color("#0b1b3a"),
      });
      const mesh = new THREE.Mesh(baseGeometry, material);
      mesh.position.copy(position);
      mesh.userData = { type: "base", id: `base-${index}` };
      scene.add(mesh);
      return {
        id: `base-${index}`,
        mesh,
        health: 100,
        maxHealth: 100,
      };
    });

    const collectors: CollectorUnit[] = bases.map((base, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: UNIT_COLORS.collector.clone(),
        emissive: new THREE.Color("#1a1302"),
      });
      const mesh = new THREE.Mesh(collectorGeometry, material);
      mesh.position.copy(base.mesh.position).add(new THREE.Vector3(0, 0, 10));
      mesh.userData = { type: "collector", id: `collector-${index}` };
      scene.add(mesh);
      return {
        id: `collector-${index}`,
        mesh,
        target: mesh.position.clone(),
        state: "idle",
        cargo: 0,
        capacity: COLLECTOR_CAPACITY,
        assignedResourceId: null,
        homeBaseId: base.id,
      };
    });

    const resourcePositions = [
      new THREE.Vector3(-20, 0, 30),
      new THREE.Vector3(10, 0, -10),
      new THREE.Vector3(35, 0, 0),
    ];

    const resources: ResourceNode[] = resourcePositions.map((position, index) => {
      const material = new THREE.MeshStandardMaterial({
        color: UNIT_COLORS.resource.clone(),
        emissive: new THREE.Color("#2b0b15"),
      });
      const mesh = new THREE.Mesh(resourceGeometry, material);
      mesh.position.copy(position);
      mesh.userData = { type: "resource", id: `resource-${index}` };
      scene.add(mesh);
      return {
        id: `resource-${index}`,
        mesh,
        amount: 160,
        maxAmount: 160,
      };
    });

    basesRef.current = bases;
    collectorsRef.current = collectors;
    resourcesRef.current = resources;

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
      collectorsRef.current.forEach((collector) => {
        const distance = collector.mesh.position.distanceTo(collector.target);
        if (distance > MOVE_EPSILON) {
          const direction = collector.target
            .clone()
            .sub(collector.mesh.position)
            .normalize();
          const step = Math.min(distance, COLLECTOR_SPEED * delta);
          collector.mesh.position.add(direction.multiplyScalar(step));
          collector.mesh.lookAt(collector.target);
        }

        const assignedResource = collector.assignedResourceId
          ? resourcesRef.current.find(
              (resource) => resource.id === collector.assignedResourceId,
            )
          : null;
        if (collector.state === "movingToResource" && assignedResource) {
          const resourceDistance = collector.mesh.position.distanceTo(
            assignedResource.mesh.position,
          );
          if (resourceDistance <= RESOURCE_PICKUP_DISTANCE) {
            collector.state = "gathering";
          }
        }

        if (collector.state === "gathering" && assignedResource) {
          if (assignedResource.amount <= 0) {
            collector.state = "returning";
          } else {
            const gathered = Math.min(
              assignedResource.amount,
              collector.capacity - collector.cargo,
              GATHER_RATE * delta,
            );
            assignedResource.amount -= gathered;
            collector.cargo += gathered;

            const remainingRatio = Math.max(
              assignedResource.amount / assignedResource.maxAmount,
              0,
            );
            assignedResource.mesh.scale.setScalar(0.5 + remainingRatio * 0.6);
            if (assignedResource.amount <= 0) {
              assignedResource.mesh.visible = false;
              collector.state = "returning";
            }

            if (collector.cargo >= collector.capacity - 0.01) {
              collector.state = "returning";
            }
          }
        }

        if (collector.state === "returning") {
          const homeBase = basesRef.current.find(
            (base) => base.id === collector.homeBaseId,
          );
          if (homeBase) {
            collector.target = homeBase.mesh.position.clone();
            const baseDistance = collector.mesh.position.distanceTo(
              homeBase.mesh.position,
            );
            if (baseDistance <= BASE_DROPOFF_DISTANCE) {
              if (collector.cargo > 0) {
                oreRef.current += collector.cargo;
                setOreCount(Math.floor(oreRef.current));
                collector.cargo = 0;
              }
              if (assignedResource && assignedResource.amount > 0) {
                collector.state = "movingToResource";
                collector.target = assignedResource.mesh.position.clone();
              } else {
                collector.state = "idle";
              }
            }
          }
        }

        if (collector.state === "moving" && distance <= MOVE_EPSILON) {
          collector.state = "idle";
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
      collectorGeometry.dispose();
      resourceGeometry.dispose();
      shipGeometry.dispose();
      bases.forEach((base) => {
        base.mesh.geometry.dispose();
        (base.mesh.material as THREE.Material).dispose();
      });
      collectors.forEach((collector) => {
        collector.mesh.geometry.dispose();
        (collector.mesh.material as THREE.Material).dispose();
      });
      resources.forEach((resource) => {
        resource.mesh.geometry.dispose();
        (resource.mesh.material as THREE.Material).dispose();
      });
      shipsRef.current.forEach((ship) => {
        ship.mesh.geometry.dispose();
        (ship.mesh.material as THREE.Material).dispose();
      });
      container.removeChild(renderer.domElement);
    };
  }, [pointerNdc, raycaster, targetPlane]);

  useEffect(() => {
    const selectedId = selection?.id;
    const selectedType = selection?.type;
    basesRef.current.forEach((base) => {
      const material = base.mesh.material as THREE.MeshStandardMaterial;
      material.color =
        selectedType === "base" && selectedId === base.id
          ? UNIT_COLORS.selected.clone()
          : UNIT_COLORS.base.clone();
    });
    collectorsRef.current.forEach((collector) => {
      const material = collector.mesh.material as THREE.MeshStandardMaterial;
      material.color =
        selectedType === "collector" && selectedId === collector.id
          ? UNIT_COLORS.selected.clone()
          : UNIT_COLORS.collector.clone();
    });
  }, [selection]);

  const getCanvasCoords = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
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

    const selectableMeshes = [
      ...basesRef.current.map((base) => base.mesh),
      ...collectorsRef.current.map((collector) => collector.mesh),
    ];
    const resourceMeshes = resourcesRef.current
      .filter((resource) => resource.mesh.visible)
      .map((resource) => resource.mesh);

    const resourceHits = raycaster.intersectObjects(resourceMeshes, false);
    if (resourceHits.length > 0) {
      const selectedCollector =
        selection?.type === "collector"
          ? collectorsRef.current.find((unit) => unit.id === selection.id)
          : null;
      const resourceId = resourceHits[0].object.userData.id as string;
      const resourceNode = resourcesRef.current.find(
        (resource) => resource.id === resourceId,
      );
      if (selectedCollector && resourceNode) {
        selectedCollector.assignedResourceId = resourceId;
        selectedCollector.state = "movingToResource";
        selectedCollector.target = resourceNode.mesh.position.clone();
      }
      return;
    }

    const hits = raycaster.intersectObjects(selectableMeshes, false);
    if (hits.length > 0) {
      const hit = hits[0].object.userData as { type: "base" | "collector"; id: string };
      setSelection({ type: hit.type, id: hit.id });
      return;
    }

    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(targetPlane, target)) {
      if (selection?.type === "collector") {
        const collector = collectorsRef.current.find(
          (unit) => unit.id === selection.id,
        );
        if (collector) {
          collector.target = target.clone();
          collector.state = "moving";
          collector.assignedResourceId = null;
        }
      } else {
        setSelection(null);
      }
    }
  };

  const selectedBase =
    selection?.type === "base"
      ? basesRef.current.find((base) => base.id === selection.id)
      : null;
  const selectedCollector =
    selection?.type === "collector"
      ? collectorsRef.current.find((unit) => unit.id === selection.id)
      : null;

  const buildShip = () => {
    if (!rendererRef.current || !selectedBase || oreRef.current < SHIP_COST) {
      return;
    }
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }
    const material = new THREE.MeshStandardMaterial({
      color: UNIT_COLORS.ship.clone(),
      emissive: new THREE.Color("#1d0f34"),
    });
    const shipGeometry = new THREE.SphereGeometry(2.1, 12, 12);
    const mesh = new THREE.Mesh(shipGeometry, material);
    mesh.position.copy(selectedBase.mesh.position).add(new THREE.Vector3(0, 0, 8));
    scene.add(mesh);
    shipsRef.current.push({ id: `ship-${shipsRef.current.length}`, mesh });
    oreRef.current -= SHIP_COST;
    setOreCount(Math.floor(oreRef.current));
  };

  return (
    <div className="tactical-view">
      <div
        className="tactical-canvas"
        ref={containerRef}
        onPointerUp={handlePointerUp}
      >
      </div>
      <div className="tactical-hud">
        <div>
          <p className="hud-title">Squad Tactical View</p>
          <p className="hud-copy">
            Select a base or collector. Click the field to move collectors, or
            click resources to begin harvesting.
          </p>
        </div>
        <div className="hud-status">
          <span>Ore reserves</span>
          <strong>{oreCount}</strong>
        </div>
      </div>
      <div className="tactical-hud tactical-hud-secondary">
        <div>
          <p className="hud-title">
            {selectedBase
              ? "Base Command"
              : selectedCollector
                ? "Collector Control"
                : "No unit selected"}
          </p>
          {selectedBase ? (
            <p className="hud-copy">
              Integrity {selectedBase.health}/{selectedBase.maxHealth}. Build
              ships once your collectors bring in enough ore.
            </p>
          ) : selectedCollector ? (
            <p className="hud-copy">
              Cargo {Math.floor(selectedCollector.cargo)}/{selectedCollector.capacity}
              . {selectedCollector.state.replace(/([A-Z])/g, " $1")}.
            </p>
          ) : (
            <p className="hud-copy">
              Click a base to open build options or a collector to issue orders.
            </p>
          )}
        </div>
        {selectedBase && (
          <div className="hud-actions">
            <button
              className="btn primary"
              type="button"
              disabled={oreCount < SHIP_COST}
              onClick={buildShip}
            >
              Build scout ship ({SHIP_COST} ore)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
