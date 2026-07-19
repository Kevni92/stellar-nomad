"use client";

import { Text } from "@react-three/drei";
import { useXR } from "@react-three/xr";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useMemo, useState } from "react";

import { ITEMS, type ItemDef } from "@/data/content";
import {
  cargoAtom,
  cargoCapacityUnitsAtom,
  cargoUsedUnitsAtom,
  removeCargoAtom,
} from "@/store/cargo";
import { addCraftedItemAtom, modulesAtom } from "@/store/modules";
import {
  activeResearchNodeAtom,
  researchAtom,
  startResearchAtom,
  unlockedItemIdsAtom,
  visibleNodesAtom,
} from "@/store/research";
import { settingsAtom, hudInfoAtom, movementAtom, shipHealthAtom } from "@/store/store";
import { systemConfigAtom } from "@/store/system";
import {
  vrFlightEnabledAtom,
  vrMenuOpenAtom,
  vrMenuPageAtom,
  type VRMenuPage,
} from "@/store/vr";
import { getResourceTypes } from "@/sim/asteroids/resources";

const PANEL_WIDTH = 1.9;
const PANEL_HEIGHT = 1.18;
const ITEMS_PER_PAGE = 3;

const TAB_LABELS: Array<{ page: VRMenuPage; label: string }> = [
  { page: "flight", label: "FLUG" },
  { page: "cargo", label: "FRACHT" },
  { page: "research", label: "FORSCHUNG" },
  { page: "craft", label: "BAU" },
  { page: "settings", label: "OPTIONEN" },
];

type Button3DProps = {
  label: string;
  position: [number, number, number];
  onClick: () => void;
  width?: number;
  height?: number;
  fontSize?: number;
  active?: boolean;
  disabled?: boolean;
};

export function VRButton3D({
  label,
  position,
  onClick,
  width = 0.3,
  height = 0.11,
  fontSize = 0.035,
  active = false,
  disabled = false,
}: Button3DProps) {
  const [hovered, setHovered] = useState(false);
  const color = disabled
    ? "#17252c"
    : active
      ? "#0d8294"
      : hovered
        ? "#14586a"
        : "#102f3a";

  return (
    <group position={position}>
      <mesh
        renderOrder={1002}
        onClick={disabled ? undefined : onClick}
        onPointerOver={() => !disabled && setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[width, height, 0.018]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={disabled ? 0.55 : 0.96}
          depthTest={false}
        />
      </mesh>
      <Text
        position={[0, 0, 0.014]}
        fontSize={fontSize}
        color={disabled ? "#667982" : "#d7fbff"}
        anchorX="center"
        anchorY="middle"
        renderOrder={1003}
      >
        {label}
      </Text>
    </group>
  );
}

function BodyText({
  children,
  position,
  size = 0.042,
  color = "#c5eaf0",
  maxWidth = 1.65,
}: {
  children: string;
  position: [number, number, number];
  size?: number;
  color?: string;
  maxWidth?: number;
}) {
  return (
    <Text
      position={position}
      fontSize={size}
      color={color}
      maxWidth={maxWidth}
      lineHeight={1.25}
      anchorX="left"
      anchorY="top"
      textAlign="left"
      renderOrder={1003}
    >
      {children}
    </Text>
  );
}

function formatResource(id: string, names: Map<string, string>) {
  return names.get(id) ?? id.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function recipeSummary(item: ItemDef, resourceNames: Map<string, string>) {
  return Object.entries(item.recipe)
    .slice(0, 3)
    .map(([id, amount]) => `${formatResource(id, resourceNames)} ${amount}`)
    .join(" · ");
}

export default function VRMenu() {
  const [open, setOpen] = useAtom(vrMenuOpenAtom);
  const [page, setPage] = useAtom(vrMenuPageAtom);
  const [flightEnabled, setFlightEnabled] = useAtom(vrFlightEnabledAtom);
  const [settings, setSettings] = useAtom(settingsAtom);
  const session = useXR((state) => state.session);

  const health = useAtomValue(shipHealthAtom);
  const hudInfo = useAtomValue(hudInfoAtom);
  const movement = useAtomValue(movementAtom);
  const cargo = useAtomValue(cargoAtom);
  const cargoUsed = useAtomValue(cargoUsedUnitsAtom);
  const cargoCapacity = useAtomValue(cargoCapacityUnitsAtom);
  const research = useAtomValue(researchAtom);
  const activeResearch = useAtomValue(activeResearchNodeAtom);
  const visibleResearch = useAtomValue(visibleNodesAtom);
  const unlockedItems = useAtomValue(unlockedItemIdsAtom);
  const modules = useAtomValue(modulesAtom);
  const system = useAtomValue(systemConfigAtom);

  const startResearch = useSetAtom(startResearchAtom);
  const removeCargo = useSetAtom(removeCargoAtom);
  const addCraftedItem = useSetAtom(addCraftedItemAtom);

  const [researchPage, setResearchPage] = useState(0);
  const [craftPage, setCraftPage] = useState(0);
  const [message, setMessage] = useState("");

  const resourceNames = useMemo(() => {
    return new Map(getResourceTypes(system).map((resource) => [resource.id, resource.name]));
  }, [system]);

  const cargoRows = useMemo(
    () => Object.entries(cargo.items).filter(([, amount]) => amount > 0).sort((a, b) => b[1] - a[1]),
    [cargo.items],
  );

  const craftableItems = useMemo(() => {
    return ITEMS.filter((item) => {
      if (!unlockedItems.has(item.id)) return false;
      if ((item.type === "module" || item.type === "special") && modules.ownedModules.includes(item.id)) {
        return false;
      }
      if (item.type === "consumable") {
        const current = modules.consumables[item.id] ?? 0;
        if (current >= (item.stackMax ?? 99)) return false;
      }
      return true;
    });
  }, [modules.consumables, modules.ownedModules, unlockedItems]);

  const canAfford = (item: ItemDef) =>
    Object.entries(item.recipe).every(([resourceId, amount]) => (cargo.items[resourceId] ?? 0) >= amount);

  const craft = (item: ItemDef) => {
    if (!canAfford(item)) {
      setMessage("Nicht genügend Rohstoffe.");
      return;
    }
    for (const [resourceId, amount] of Object.entries(item.recipe)) {
      removeCargo({ resourceId, amount });
    }
    addCraftedItem(item.id);
    setMessage(`${item.name} hergestellt.`);
  };

  const start = (nodeId: string, nodeName: string) => {
    const started = startResearch(nodeId);
    setMessage(started ? `${nodeName} gestartet.` : "Forschung kann noch nicht gestartet werden.");
  };

  if (!open) return null;

  const researchSlice = visibleResearch.slice(
    researchPage * ITEMS_PER_PAGE,
    researchPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  );
  const craftSlice = craftableItems.slice(
    craftPage * ITEMS_PER_PAGE,
    craftPage * ITEMS_PER_PAGE + ITEMS_PER_PAGE,
  );

  return (
    <group position={[0, 1.35, 1.72]} rotation={[0, Math.PI, 0]}>
      <mesh renderOrder={1000}>
        <boxGeometry args={[PANEL_WIDTH, PANEL_HEIGHT, 0.035]} />
        <meshBasicMaterial color="#06151c" transparent opacity={0.96} depthTest={false} />
      </mesh>

      <Text
        position={[-0.88, 0.52, 0.026]}
        fontSize={0.052}
        color="#75efff"
        anchorX="left"
        anchorY="middle"
        renderOrder={1003}
      >
        STELLAR NOMAD // VR
      </Text>

      {TAB_LABELS.map((tab, index) => (
        <VRButton3D
          key={tab.page}
          label={tab.label}
          position={[-0.72 + index * 0.36, 0.39, 0.035]}
          width={0.33}
          height={0.095}
          fontSize={0.026}
          active={page === tab.page}
          onClick={() => {
            setPage(tab.page);
            setMessage("");
          }}
        />
      ))}

      {page === "flight" && (
        <>
          <BodyText position={[-0.84, 0.25, 0.03]} size={0.05} color="#ffffff">
            {`SCHIFFSSTATUS\nHülle: ${Math.round(health)} %\nGeschwindigkeit: ${Math.round(hudInfo.speed)} m/s\nSchub: ${Math.round(movement.speed * 100)} %`}
          </BodyText>
          <BodyText position={[0.05, 0.25, 0.03]} size={0.038} maxWidth={0.78}>
            {"Linker Stick: Gieren / Nicken\nRechter Stick hoch/runter: Schub\nTrigger: Menü auswählen\nB oder Y: Menü öffnen/schließen"}
          </BodyText>
        </>
      )}

      {page === "cargo" && (
        <>
          <BodyText position={[-0.84, 0.25, 0.03]} size={0.046} color="#ffffff">
            {`FRACHTRAUM ${cargoUsed} / ${cargoCapacity}`}
          </BodyText>
          {cargoRows.length === 0 ? (
            <BodyText position={[-0.84, 0.12, 0.03]}>Noch keine Rohstoffe an Bord.</BodyText>
          ) : (
            cargoRows.slice(0, 7).map(([id, amount], index) => (
              <BodyText key={id} position={[-0.84, 0.13 - index * 0.075, 0.03]} size={0.038}>
                {`${formatResource(id, resourceNames)}: ${Math.floor(amount)}`}
              </BodyText>
            ))
          )}
        </>
      )}

      {page === "research" && (
        <>
          <BodyText position={[-0.84, 0.25, 0.03]} size={0.041} color="#ffffff">
            {activeResearch
              ? `AKTIV: ${activeResearch.node.name} (${Math.min(100, Math.round(activeResearch.elapsedS / activeResearch.node.durationSeconds * 100))} %)`
              : `ASSAY-PROBEN: ${research.assaySamples}`}
          </BodyText>
          {researchSlice.length === 0 ? (
            <BodyText position={[-0.84, 0.1, 0.03]}>
              {activeResearch ? "Eine Forschung läuft bereits." : "Keine Forschung verfügbar."}
            </BodyText>
          ) : (
            researchSlice.map((node, index) => {
              const y = 0.1 - index * 0.17;
              const affordable = research.assaySamples >= node.costs.assaySamples && !activeResearch;
              return (
                <group key={node.id}>
                  <BodyText position={[-0.84, y, 0.03]} size={0.036} maxWidth={1.25}>
                    {`${node.name}\n${node.costs.assaySamples} Proben · ${Math.round(node.durationSeconds)} s`}
                  </BodyText>
                  <VRButton3D
                    label="START"
                    position={[0.72, y - 0.025, 0.04]}
                    width={0.3}
                    height={0.1}
                    fontSize={0.03}
                    disabled={!affordable}
                    onClick={() => start(node.id, node.name)}
                  />
                </group>
              );
            })
          )}
          <VRButton3D
            label="‹"
            position={[-0.18, -0.47, 0.04]}
            width={0.12}
            disabled={researchPage === 0}
            onClick={() => setResearchPage((value) => Math.max(0, value - 1))}
          />
          <VRButton3D
            label="›"
            position={[0.02, -0.47, 0.04]}
            width={0.12}
            disabled={(researchPage + 1) * ITEMS_PER_PAGE >= visibleResearch.length}
            onClick={() => setResearchPage((value) => value + 1)}
          />
        </>
      )}

      {page === "craft" && (
        <>
          <BodyText position={[-0.84, 0.25, 0.03]} size={0.041} color="#ffffff">
            BAUPLÄNE
          </BodyText>
          {craftSlice.length === 0 ? (
            <BodyText position={[-0.84, 0.1, 0.03]}>Forschung schaltet neue Baupläne frei.</BodyText>
          ) : (
            craftSlice.map((item, index) => {
              const y = 0.1 - index * 0.17;
              const affordable = canAfford(item);
              return (
                <group key={item.id}>
                  <BodyText position={[-0.84, y, 0.03]} size={0.034} maxWidth={1.25}>
                    {`${item.name}\n${recipeSummary(item, resourceNames)}`}
                  </BodyText>
                  <VRButton3D
                    label="BAUEN"
                    position={[0.72, y - 0.025, 0.04]}
                    width={0.3}
                    height={0.1}
                    fontSize={0.029}
                    disabled={!affordable}
                    onClick={() => craft(item)}
                  />
                </group>
              );
            })
          )}
          <VRButton3D
            label="‹"
            position={[-0.18, -0.47, 0.04]}
            width={0.12}
            disabled={craftPage === 0}
            onClick={() => setCraftPage((value) => Math.max(0, value - 1))}
          />
          <VRButton3D
            label="›"
            position={[0.02, -0.47, 0.04]}
            width={0.12}
            disabled={(craftPage + 1) * ITEMS_PER_PAGE >= craftableItems.length}
            onClick={() => setCraftPage((value) => value + 1)}
          />
        </>
      )}

      {page === "settings" && (
        <>
          <BodyText position={[-0.84, 0.25, 0.03]} size={0.046} color="#ffffff">
            VR-OPTIONEN
          </BodyText>
          <VRButton3D
            label={`FLUGSTEUERUNG ${flightEnabled ? "AN" : "AUS"}`}
            position={[-0.48, 0.08, 0.04]}
            width={0.7}
            onClick={() => setFlightEnabled((value) => !value)}
          />
          <VRButton3D
            label={`NICKEN ${settings.invertPitch ? "INVERTIERT" : "NORMAL"}`}
            position={[0.35, 0.08, 0.04]}
            width={0.7}
            onClick={() => setSettings((value) => ({ ...value, invertPitch: !value.invertPitch }))}
          />
          <VRButton3D
            label={`BLOOM ${settings.bloom ? "AN" : "AUS"}`}
            position={[-0.48, -0.08, 0.04]}
            width={0.7}
            onClick={() => setSettings((value) => ({ ...value, bloom: !value.bloom }))}
          />
          <VRButton3D
            label="VR BEENDEN"
            position={[0.35, -0.08, 0.04]}
            width={0.7}
            onClick={() => void session?.end()}
          />
          <BodyText position={[-0.84, -0.22, 0.03]} size={0.035}>
            {"Für eine neue Sitzposition: Meta-Taste gedrückt halten und Ansicht neu zentrieren."}
          </BodyText>
        </>
      )}

      {message && (
        <Text
          position={[-0.84, -0.49, 0.04]}
          fontSize={0.032}
          color="#7fffc7"
          anchorX="left"
          anchorY="middle"
          renderOrder={1003}
        >
          {message}
        </Text>
      )}

      <VRButton3D
        label="SCHLIESSEN"
        position={[0.7, -0.49, 0.04]}
        width={0.38}
        height={0.1}
        fontSize={0.029}
        onClick={() => setOpen(false)}
      />
    </group>
  );
}
