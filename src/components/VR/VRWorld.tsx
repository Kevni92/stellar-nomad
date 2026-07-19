"use client";

import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useAtomValue, useSetAtom } from "jotai";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  MathUtils,
  Matrix4,
  Object3D,
  Quaternion,
  Raycaster,
  Vector3,
} from "three";

import {
  addAssaySamplesAtom,
  researchAtom,
  startResearchAtom,
  unlockedItemIdsAtom,
  visibleNodesAtom,
} from "@/store/research";
import {
  addCargoAtom,
  cargoAtom,
  removeCargoAtom,
} from "@/store/cargo";
import {
  addCraftedItemAtom,
  itemCraftedSignalAtom,
  lastCraftedItemIdAtom,
  modulesAtom,
} from "@/store/modules";
import { ITEMS, getItemDef } from "@/data/content";

type MenuSection =
  | "home"
  | "cargo"
  | "research"
  | "crafting"
  | "loadout"
  | "settings";

type XRInputSourceLike = {
  handedness?: string;
  gamepad?: Gamepad | null;
};

type XRSessionLike = {
  inputSources?: Iterable<XRInputSourceLike>;
};

type XRInteractiveObject = Object3D & {
  userData: {
    xrInteractable?: boolean;
    onXRSelect?: () => void;
    onXRHover?: (hovered: boolean) => void;
  };
};

const RESOURCE_LABELS: Record<string, string> = {
  silicates: "Silikate",
  fe_ni_metal: "Fe-Ni-Metall",
  sulfur: "Schwefel",
  carbon: "Kohlenstoff",
  hydrates: "Hydrate",
  helium_3: "Helium-3",
  titanium: "Titan",
};

const tempPosition = new Vector3();
const tempQuaternion = new Quaternion();
const tempMatrix = new Matrix4();

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function HeadLockedGroup({
  children,
  distance = 1.2,
  verticalOffset = 0,
}: {
  children: ReactNode;
  distance?: number;
  verticalOffset?: number;
}) {
  const ref = useRef<Group>(null);
  const { camera, gl } = useThree();

  useFrame(() => {
    const group = ref.current;
    if (!group) return;

    const xrCamera = gl.xr.isPresenting ? gl.xr.getCamera() : camera;
    xrCamera.getWorldPosition(tempPosition);
    xrCamera.getWorldQuaternion(tempQuaternion);
    group.position.copy(tempPosition);
    group.quaternion.copy(tempQuaternion);
    group.translateZ(-distance);
    group.translateY(verticalOffset);
  });

  return <group ref={ref}>{children}</group>;
}

function VRButton({
  label,
  position,
  onSelect,
  disabled = false,
  width = 1.48,
}: {
  label: string;
  position: [number, number, number];
  onSelect: () => void;
  disabled?: boolean;
  width?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const color = disabled ? "#1d2932" : hovered ? "#20d9ff" : "#0b5266";

  return (
    <group position={position}>
      <mesh
        userData={{
          xrInteractable: !disabled,
          onXRSelect: disabled ? undefined : onSelect,
          onXRHover: setHovered,
        }}
      >
        <boxGeometry args={[width, 0.145, 0.045]} />
        <meshStandardMaterial
          color={color}
          emissive={hovered && !disabled ? "#07586c" : "#001014"}
          emissiveIntensity={0.8}
          roughness={0.35}
          metalness={0.2}
        />
      </mesh>
      <Text
        position={[0, 0, 0.028]}
        fontSize={0.047}
        color={disabled ? "#6d7e86" : "#e8fbff"}
        anchorX="center"
        anchorY="middle"
        maxWidth={width - 0.08}
        textAlign="center"
      >
        {label}
      </Text>
    </group>
  );
}

function ControllerPointer({ index }: { index: number }) {
  const { gl, scene } = useThree();
  const controller = useMemo(() => gl.xr.getController(index), [gl, index]);
  const raycaster = useMemo(() => new Raycaster(), []);
  const hoveredRef = useRef<XRInteractiveObject | null>(null);

  const line = useMemo(() => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3),
    );
    const material = new LineBasicMaterial({ color: new Color("#66e7ff") });
    const pointerLine = new Line(geometry, material);
    pointerLine.scale.z = 4;
    pointerLine.frustumCulled = false;
    return pointerLine;
  }, []);

  useEffect(() => {
    controller.add(line);

    const controllerEvents = controller as unknown as {
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    };
    const onSelect = () => hoveredRef.current?.userData.onXRSelect?.();
    controllerEvents.addEventListener("select", onSelect);

    return () => {
      controllerEvents.removeEventListener("select", onSelect);
      controller.remove(line);
      line.geometry.dispose();
      (line.material as LineBasicMaterial).dispose();
      hoveredRef.current?.userData.onXRHover?.(false);
    };
  }, [controller, line]);

  useFrame(() => {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction
      .set(0, 0, -1)
      .applyMatrix4(tempMatrix)
      .normalize();

    const intersection = raycaster
      .intersectObjects(scene.children, true)
      .find((hit) => (hit.object as XRInteractiveObject).userData.xrInteractable);

    const next =
      (intersection?.object as XRInteractiveObject | undefined) ?? null;
    if (next !== hoveredRef.current) {
      hoveredRef.current?.userData.onXRHover?.(false);
      next?.userData.onXRHover?.(true);
      hoveredRef.current = next;
    }
    line.scale.z = intersection ? Math.min(4, intersection.distance) : 4;
  });

  return <primitive object={controller} />;
}

function StarField() {
  const geometry = useMemo(() => {
    const random = mulberry32(78123);
    const positions = new Float32Array(1500 * 3);

    for (let index = 0; index < 1500; index += 1) {
      const radius = 80 + random() * 450;
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[index * 3 + 1] = radius * Math.cos(phi);
      positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }

    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return result;
  }, []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#d8ecff" size={0.35} sizeAttenuation />
    </points>
  );
}

function MineableAsteroid({
  position,
  scale,
  menuOpen,
}: {
  position: [number, number, number];
  scale: number;
  menuOpen: boolean;
}) {
  const [active, setActive] = useState(true);
  const [hovered, setHovered] = useState(false);
  const addCargo = useSetAtom(addCargoAtom);
  const addAssaySamples = useSetAtom(addAssaySamplesAtom);

  const mine = useCallback(() => {
    if (!active || menuOpen) return;
    const amount = Math.max(8, Math.round(scale * 22));
    addCargo({ resourceId: "silicates", amount });
    addAssaySamples(Math.max(1, Math.round(scale * 2)));
    setActive(false);
  }, [active, addAssaySamples, addCargo, menuOpen, scale]);

  if (!active) return null;

  return (
    <mesh
      position={position}
      scale={scale}
      rotation={[
        position[0] * 0.08,
        position[1] * 0.05,
        position[2] * 0.01,
      ]}
      userData={{
        xrInteractable: !menuOpen,
        onXRSelect: mine,
        onXRHover: setHovered,
      }}
    >
      <dodecahedronGeometry args={[0.75, 1]} />
      <meshStandardMaterial
        color={hovered ? "#d9f5ff" : "#6d7378"}
        emissive={hovered ? "#13495a" : "#000000"}
        roughness={0.9}
      />
    </mesh>
  );
}

function AsteroidField({ menuOpen }: { menuOpen: boolean }) {
  const asteroids = useMemo(() => {
    const random = mulberry32(20260719);
    return Array.from({ length: 56 }, (_, index) => {
      const angle = random() * Math.PI * 2;
      const radius = 4 + random() * 22;
      return {
        id: index,
        position: [
          Math.cos(angle) * radius,
          (random() - 0.5) * 14,
          -12 - random() * 85,
        ] as [number, number, number],
        scale: 0.35 + random() * 1.35,
      };
    });
  }, []);

  return (
    <>
      {asteroids.map((asteroid) => (
        <MineableAsteroid
          key={asteroid.id}
          position={asteroid.position}
          scale={asteroid.scale}
          menuOpen={menuOpen}
        />
      ))}
    </>
  );
}

function Cockpit() {
  return (
    <group position={[0, 1.25, -0.6]}>
      <mesh position={[0, -0.55, -0.45]} rotation={[-0.15, 0, 0]}>
        <boxGeometry args={[1.6, 0.25, 1.25]} />
        <meshStandardMaterial
          color="#071116"
          metalness={0.65}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[-0.88, 0.05, -0.75]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.08, 1.4, 0.08]} />
        <meshStandardMaterial color="#15333d" metalness={0.8} />
      </mesh>
      <mesh position={[0.88, 0.05, -0.75]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.08, 1.4, 0.08]} />
        <meshStandardMaterial color="#15333d" metalness={0.8} />
      </mesh>
    </group>
  );
}

function VRHud({
  speed,
  cargoUsed,
  menuOpen,
  openMenu,
}: {
  speed: number;
  cargoUsed: number;
  menuOpen: boolean;
  openMenu: () => void;
}) {
  if (menuOpen) return null;

  return (
    <HeadLockedGroup distance={1.05} verticalOffset={-0.38}>
      <Text
        fontSize={0.038}
        color="#8eeeff"
        anchorX="center"
        anchorY="middle"
      >
        {`SCHUB ${speed.toFixed(0)} m/s   FRACHT ${cargoUsed}`}
      </Text>
      <VRButton
        label="MENÜ"
        position={[0, -0.12, 0]}
        width={0.58}
        onSelect={openMenu}
      />
    </HeadLockedGroup>
  );
}

function MenuHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <Text
        position={[0, 0.49, 0.035]}
        fontSize={0.075}
        color="#b8f5ff"
        anchorX="center"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          position={[0, 0.39, 0.035]}
          fontSize={0.034}
          color="#7ba8b2"
          maxWidth={1.5}
          textAlign="center"
          anchorX="center"
        >
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}

function VRMenu({
  section,
  setSection,
  close,
  exitVR,
  comfortMode,
  setComfortMode,
}: {
  section: MenuSection;
  setSection: (section: MenuSection) => void;
  close: () => void;
  exitVR: () => void;
  comfortMode: boolean;
  setComfortMode: (value: boolean) => void;
}) {
  const cargo = useAtomValue(cargoAtom);
  const research = useAtomValue(researchAtom);
  const visibleResearch = useAtomValue(visibleNodesAtom);
  const startResearch = useSetAtom(startResearchAtom);
  const unlockedItems = useAtomValue(unlockedItemIdsAtom);
  const modules = useAtomValue(modulesAtom);
  const removeCargo = useSetAtom(removeCargoAtom);
  const addCraftedItem = useSetAtom(addCraftedItemAtom);
  const incrementCraftSignal = useSetAtom(itemCraftedSignalAtom);
  const setLastCraftedItem = useSetAtom(lastCraftedItemIdAtom);

  const cargoEntries = Object.entries(cargo.items)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 7);

  const craftItems = ITEMS.filter((item) => unlockedItems.has(item.id))
    .filter((item) => !modules.ownedModules.includes(item.id))
    .slice(0, 4);

  const canCraft = (itemId: string) => {
    const item = getItemDef(itemId);
    if (!item) return false;
    return Object.entries(item.recipe).every(
      ([resourceId, needed]) =>
        Math.floor(cargo.items[resourceId] ?? 0) >= needed,
    );
  };

  const craft = (itemId: string) => {
    const item = getItemDef(itemId);
    if (!item || !canCraft(itemId)) return;

    for (const [resourceId, amount] of Object.entries(item.recipe)) {
      removeCargo({ resourceId, amount });
    }
    addCraftedItem(item.id);
    incrementCraftSignal((value) => value + 1);
    setLastCraftedItem(item.id);
  };

  const equippedEntries = Object.entries(modules.equippedModules).filter(
    (entry) => entry[1],
  );

  return (
    <HeadLockedGroup distance={1.25} verticalOffset={-0.02}>
      <mesh>
        <boxGeometry args={[1.78, 1.3, 0.055]} />
        <meshStandardMaterial
          color="#03131a"
          emissive="#00151d"
          emissiveIntensity={0.7}
          transparent
          opacity={0.96}
          roughness={0.35}
          metalness={0.35}
        />
      </mesh>

      {section === "home" ? (
        <>
          <MenuHeader
            title="STELLAR NOMAD VR"
            subtitle="Trigger zum Auswählen · B oder Y öffnet und schließt das Menü"
          />
          <VRButton
            label="WEITERSPIELEN"
            position={[0, 0.24, 0.05]}
            onSelect={close}
          />
          <VRButton
            label="FRACHT"
            position={[0, 0.07, 0.05]}
            onSelect={() => setSection("cargo")}
          />
          <VRButton
            label="FORSCHUNG"
            position={[0, -0.1, 0.05]}
            onSelect={() => setSection("research")}
          />
          <VRButton
            label="FERTIGUNG"
            position={[0, -0.27, 0.05]}
            onSelect={() => setSection("crafting")}
          />
          <VRButton
            label="LOADOUT"
            position={[0, -0.44, 0.05]}
            onSelect={() => setSection("loadout")}
          />
          <VRButton
            label="OPTIONEN"
            position={[0, -0.61, 0.05]}
            onSelect={() => setSection("settings")}
          />
        </>
      ) : null}

      {section === "cargo" ? (
        <>
          <MenuHeader
            title="FRACHT"
            subtitle={`${Object.values(cargo.items).reduce((a, b) => a + b, 0)} / ${cargo.capacityUnits} Einheiten`}
          />
          <Text
            position={[-0.7, 0.23, 0.04]}
            fontSize={0.045}
            color="#d8f8ff"
            anchorX="left"
            anchorY="top"
            lineHeight={1.45}
          >
            {cargoEntries.length
              ? cargoEntries
                  .map(
                    ([id, amount]) =>
                      `${RESOURCE_LABELS[id] ?? id}: ${Math.floor(amount)}`,
                  )
                  .join("\n")
              : "Noch keine Rohstoffe im Frachtraum."}
          </Text>
          <VRButton
            label="ZURÜCK"
            position={[0, -0.51, 0.05]}
            onSelect={() => setSection("home")}
          />
        </>
      ) : null}

      {section === "research" ? (
        <>
          <MenuHeader
            title="FORSCHUNG"
            subtitle={`Proben: ${research.assaySamples}${research.activeResearch ? " · Forschung läuft" : ""}`}
          />
          {visibleResearch.slice(0, 4).map((node, index) => (
            <VRButton
              key={node.id}
              label={`${node.name} · ${node.costs.assaySamples} Proben`}
              position={[0, 0.23 - index * 0.17, 0.05]}
              disabled={
                Boolean(research.activeResearch) ||
                research.assaySamples < node.costs.assaySamples
              }
              onSelect={() => startResearch(node.id)}
            />
          ))}
          {visibleResearch.length === 0 ? (
            <Text
              position={[0, 0.05, 0.04]}
              fontSize={0.045}
              color="#9cb1b8"
              maxWidth={1.45}
              textAlign="center"
            >
              Keine neue Forschung verfügbar. Mine Asteroiden für weitere Proben.
            </Text>
          ) : null}
          <VRButton
            label="ZURÜCK"
            position={[0, -0.51, 0.05]}
            onSelect={() => setSection("home")}
          />
        </>
      ) : null}

      {section === "crafting" ? (
        <>
          <MenuHeader
            title="FERTIGUNG"
            subtitle="Freigeschaltete Baupläne aus deinem Spielstand"
          />
          {craftItems.map((item, index) => (
            <VRButton
              key={item.id}
              label={`BAUEN: ${item.name}`}
              position={[0, 0.23 - index * 0.17, 0.05]}
              disabled={!canCraft(item.id)}
              onSelect={() => craft(item.id)}
            />
          ))}
          {craftItems.length === 0 ? (
            <Text
              position={[0, 0.05, 0.04]}
              fontSize={0.045}
              color="#9cb1b8"
              maxWidth={1.45}
              textAlign="center"
            >
              Noch keine herstellbaren Baupläne. Schließe Forschung ab.
            </Text>
          ) : null}
          <VRButton
            label="ZURÜCK"
            position={[0, -0.51, 0.05]}
            onSelect={() => setSection("home")}
          />
        </>
      ) : null}

      {section === "loadout" ? (
        <>
          <MenuHeader
            title="LOADOUT"
            subtitle={`${modules.ownedModules.length} Module im Inventar`}
          />
          <Text
            position={[-0.7, 0.23, 0.04]}
            fontSize={0.043}
            color="#d8f8ff"
            anchorX="left"
            anchorY="top"
            lineHeight={1.5}
          >
            {equippedEntries.length
              ? equippedEntries
                  .map(
                    ([slot, itemId]) =>
                      `${slot}: ${getItemDef(itemId as string)?.name ?? itemId}`,
                  )
                  .join("\n")
              : "Keine Module ausgerüstet."}
          </Text>
          <VRButton
            label="ZURÜCK"
            position={[0, -0.51, 0.05]}
            onSelect={() => setSection("home")}
          />
        </>
      ) : null}

      {section === "settings" ? (
        <>
          <MenuHeader
            title="OPTIONEN"
            subtitle="Quest-optimierte Komforteinstellungen"
          />
          <VRButton
            label={`DREHUNG: ${comfortMode ? "30° SNAP" : "SANFT"}`}
            position={[0, 0.2, 0.05]}
            onSelect={() => setComfortMode(!comfortMode)}
          />
          <Text
            position={[0, -0.02, 0.04]}
            fontSize={0.038}
            color="#8faeb7"
            maxWidth={1.45}
            textAlign="center"
          >
            Linker Stick: drehen und Schub · Rechter Stick: nicken · Trigger: Laser oder Pointer
          </Text>
          <VRButton
            label="VR BEENDEN"
            position={[0, -0.27, 0.05]}
            onSelect={exitVR}
          />
          <VRButton
            label="ZURÜCK"
            position={[0, -0.51, 0.05]}
            onSelect={() => setSection("home")}
          />
        </>
      ) : null}
    </HeadLockedGroup>
  );
}

export default function VRWorld({ exitVR }: { exitVR: () => void }) {
  const { gl } = useThree();
  const worldRef = useRef<Group>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [section, setSection] = useState<MenuSection>("home");
  const [comfortMode, setComfortMode] = useState(true);
  const [speedDisplay, setSpeedDisplay] = useState(6);
  const speedRef = useRef(6);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const menuButtonLatch = useRef(false);
  const snapLatch = useRef(false);
  const hudUpdateAccumulator = useRef(0);
  const cargo = useAtomValue(cargoAtom);
  const cargoUsed = Object.values(cargo.items).reduce(
    (sum, value) => sum + value,
    0,
  );

  const openMenu = useCallback(() => {
    setSection("home");
    setMenuOpen(true);
  }, []);

  useFrame((_, delta) => {
    const world = worldRef.current;
    if (!world) return;

    const session = gl.xr.getSession() as unknown as XRSessionLike | null;
    const sources = session?.inputSources
      ? Array.from(session.inputSources)
      : [];
    const left = sources.find((source) => source.handedness === "left")?.gamepad;
    const right = sources.find((source) => source.handedness === "right")?.gamepad;

    const menuPressed = Boolean(
      left?.buttons[5]?.pressed ||
        right?.buttons[5]?.pressed ||
        (left?.buttons[4]?.pressed && right?.buttons[4]?.pressed),
    );
    if (menuPressed && !menuButtonLatch.current) {
      setMenuOpen((current) => {
        if (!current) setSection("home");
        return !current;
      });
    }
    menuButtonLatch.current = menuPressed;

    if (menuOpen) return;

    const leftAxes = left?.axes ?? [];
    const rightAxes = right?.axes ?? [];
    const leftX = leftAxes.length >= 2 ? leftAxes[leftAxes.length - 2] : 0;
    const leftY = leftAxes.length >= 1 ? leftAxes[leftAxes.length - 1] : 0;
    const rightY = rightAxes.length >= 1 ? rightAxes[rightAxes.length - 1] : 0;
    const deadzone = (value: number) =>
      Math.abs(value) < 0.14 ? 0 : value;

    const yawInput = deadzone(leftX);
    const throttleInput = -deadzone(leftY);
    const pitchInput = deadzone(rightY);

    speedRef.current = MathUtils.clamp(
      speedRef.current + throttleInput * 10 * delta,
      0,
      28,
    );

    if (comfortMode) {
      const shouldSnap = Math.abs(yawInput) > 0.72;
      if (shouldSnap && !snapLatch.current) {
        yawRef.current -=
          Math.sign(yawInput) * MathUtils.degToRad(30);
      }
      snapLatch.current = shouldSnap;
    } else {
      yawRef.current -= yawInput * 0.85 * delta;
    }

    pitchRef.current = MathUtils.clamp(
      pitchRef.current - pitchInput * 0.55 * delta,
      -MathUtils.degToRad(42),
      MathUtils.degToRad(42),
    );

    world.rotation.set(pitchRef.current, yawRef.current, 0, "YXZ");
    world.position.z += speedRef.current * delta;

    hudUpdateAccumulator.current += delta;
    if (hudUpdateAccumulator.current > 0.12) {
      hudUpdateAccumulator.current = 0;
      setSpeedDisplay(speedRef.current);
    }
  });

  return (
    <>
      <color attach="background" args={["#01030a"]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 12, 5]} intensity={2.2} />

      <group ref={worldRef}>
        <StarField />
        <mesh position={[22, 5, -190]}>
          <sphereGeometry args={[12, 48, 32]} />
          <meshStandardMaterial color="#2b67a4" roughness={0.8} />
        </mesh>
        <mesh position={[-42, 16, -280]}>
          <sphereGeometry args={[7, 32, 24]} />
          <meshStandardMaterial color="#8a8d91" roughness={1} />
        </mesh>
        <AsteroidField menuOpen={menuOpen} />
      </group>

      <Cockpit />
      <ControllerPointer index={0} />
      <ControllerPointer index={1} />
      <VRHud
        speed={speedDisplay}
        cargoUsed={cargoUsed}
        menuOpen={menuOpen}
        openMenu={openMenu}
      />
      {menuOpen ? (
        <VRMenu
          section={section}
          setSection={setSection}
          close={() => setMenuOpen(false)}
          exitVR={exitVR}
          comfortMode={comfortMode}
          setComfortMode={setComfortMode}
        />
      ) : null}
    </>
  );
}
