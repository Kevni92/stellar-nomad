"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { XROrigin, useXR, useXRInputSourceState } from "@react-three/xr";
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useEffect, useRef } from "react";
import { Group, Object3D, Quaternion } from "three";

import { movementAtom, settingsAtom, settingsIsOpenAtom } from "@/store/store";
import {
  vrFlightEnabledAtom,
  vrMenuOpenAtom,
  xrSessionActiveAtom,
} from "@/store/vr";
import VRMenu, { VRButton3D } from "./VRMenu";

const FORWARD_FLIP = new Quaternion().setFromAxisAngle(
  { x: 0, y: 1, z: 0 } as never,
  Math.PI,
);
const STICK_DEAD_ZONE = 0.14;
const THROTTLE_RATE = 0.42;

type GamepadComponent = {
  xAxis?: number;
  yAxis?: number;
  state?: string;
  pressed?: boolean;
  button?: { pressed?: boolean };
};

type ControllerState = {
  gamepad?: Record<string, GamepadComponent>;
};

function component(controller: unknown, id: string): GamepadComponent | undefined {
  return (controller as ControllerState | undefined)?.gamepad?.[id];
}

function isPressed(value: GamepadComponent | undefined) {
  return value?.state === "pressed" || value?.pressed === true || value?.button?.pressed === true;
}

function applyDeadZone(value: number | undefined) {
  const number = value ?? 0;
  return Math.abs(number) < STICK_DEAD_ZONE ? 0 : number;
}

export function XRSessionBridge() {
  const session = useXR((state) => state.session);
  const setSessionActive = useSetAtom(xrSessionActiveAtom);
  const setMenuOpen = useSetAtom(vrMenuOpenAtom);
  const store = useStore();

  useEffect(() => {
    const active = session != null;
    setSessionActive(active);
    document.body.classList.toggle("xr-session-active", active);

    if (active) {
      store.set(settingsIsOpenAtom, false);
      setMenuOpen(true);
    } else {
      store.set(movementAtom, (previous) => ({ ...previous, yaw: 0, pitch: 0 }));
      setMenuOpen(false);
    }

    return () => {
      document.body.classList.remove("xr-session-active");
      setSessionActive(false);
    };
  }, [session, setMenuOpen, setSessionActive, store]);

  return null;
}

function VRFlightControls() {
  const session = useXR((state) => state.session);
  const leftController = useXRInputSourceState("controller", "left");
  const rightController = useXRInputSourceState("controller", "right");
  const menuOpen = useAtomValue(vrMenuOpenAtom);
  const flightEnabled = useAtomValue(vrFlightEnabledAtom);
  const settings = useAtomValue(settingsAtom);
  const setMenuOpen = useSetAtom(vrMenuOpenAtom);
  const store = useStore();
  const previousMenuButton = useRef(false);

  useFrame((_, delta) => {
    if (!session) return;

    const leftStick = component(leftController, "xr-standard-thumbstick");
    const rightStick = component(rightController, "xr-standard-thumbstick");

    const menuPressed =
      isPressed(component(rightController, "b-button")) ||
      isPressed(component(leftController, "y-button"));

    if (menuPressed && !previousMenuButton.current) {
      setMenuOpen((value) => !value);
    }
    previousMenuButton.current = menuPressed;

    if (!flightEnabled || menuOpen) {
      const current = store.get(movementAtom);
      if (current.yaw !== 0 || current.pitch !== 0) {
        store.set(movementAtom, { ...current, yaw: 0, pitch: 0 });
      }
      return;
    }

    const yaw = applyDeadZone(leftStick?.xAxis);
    const rawPitch = applyDeadZone(leftStick?.yAxis);
    const pitch = settings.invertPitch ? -rawPitch : rawPitch;
    const throttleAxis = -applyDeadZone(rightStick?.yAxis);
    const current = store.get(movementAtom);
    const speed = Math.min(1, Math.max(0, current.speed + throttleAxis * THROTTLE_RATE * delta));

    if (
      Math.abs(current.yaw - yaw) > 0.001 ||
      Math.abs(current.pitch - pitch) > 0.001 ||
      Math.abs(current.speed - speed) > 0.0001
    ) {
      store.set(movementAtom, { yaw, pitch, speed });
    }
  });

  return null;
}

function CockpitShell() {
  const menuOpen = useAtomValue(vrMenuOpenAtom);
  const setMenuOpen = useSetAtom(vrMenuOpenAtom);

  return (
    <group>
      <mesh position={[0, 0.35, 0.55]}>
        <boxGeometry args={[1.65, 0.07, 1.35]} />
        <meshStandardMaterial color="#111b22" metalness={0.75} roughness={0.3} />
      </mesh>
      <mesh position={[-0.92, 0.83, 0.55]} rotation={[0, 0, -0.18]}>
        <boxGeometry args={[0.08, 1.05, 1.45]} />
        <meshStandardMaterial color="#23343e" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0.92, 0.83, 0.55]} rotation={[0, 0, 0.18]}>
        <boxGeometry args={[0.08, 1.05, 1.45]} />
        <meshStandardMaterial color="#23343e" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.89, 1.18]} rotation={[-0.18, 0, 0]}>
        <boxGeometry args={[1.45, 0.45, 0.09]} />
        <meshBasicMaterial color="#06151c" transparent opacity={0.92} />
      </mesh>
      <group position={[0, 0.93, 1.12]} rotation={[0, Math.PI, 0]}>
        <Text
          position={[-0.62, 0.1, 0.055]}
          fontSize={0.045}
          color="#76efff"
          anchorX="left"
          anchorY="middle"
        >
          NOMAD VR COCKPIT
        </Text>
        <Text
          position={[-0.62, 0.02, 0.055]}
          fontSize={0.028}
          color="#a7cbd1"
          anchorX="left"
          anchorY="middle"
        >
          Trigger zeigt und bestätigt räumliche Bedienelemente
        </Text>
        <VRButton3D
          label={menuOpen ? "MENÜ SCHLIESSEN" : "MENÜ ÖFFNEN"}
          position={[0.4, -0.1, 0.06]}
          width={0.58}
          height={0.1}
          fontSize={0.027}
          active={menuOpen}
          onClick={() => setMenuOpen((value) => !value)}
        />
      </group>
    </group>
  );
}

export function VRShipRig() {
  const session = useXR((state) => state.session);
  const originRef = useRef<Group>(null);
  const cockpitRef = useRef<Group>(null);
  const shipRef = useRef<Object3D | null>(null);
  const shipModelRef = useRef<Object3D | null>(null);

  useFrame(({ camera, scene }) => {
    shipRef.current ??= scene.getObjectByName("playerShip");
    shipModelRef.current ??= scene.getObjectByName("playerShipModel");

    const ship = shipRef.current;
    if (!ship || !originRef.current || !cockpitRef.current) return;

    if (!session) {
      if (shipModelRef.current) shipModelRef.current.visible = true;
      return;
    }

    // The desktop chase camera writes to the base camera every frame. In XR the
    // headset pose must remain authoritative, so the base camera is neutralised
    // and the XROrigin carries the ship transform instead.
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.updateMatrixWorld();

    originRef.current.position.copy(ship.position);
    originRef.current.quaternion.copy(ship.quaternion).multiply(FORWARD_FLIP);

    cockpitRef.current.position.copy(ship.position);
    cockpitRef.current.quaternion.copy(ship.quaternion);

    if (shipModelRef.current) shipModelRef.current.visible = false;
  });

  return (
    <>
      <XROrigin ref={originRef} />
      {session && (
        <group ref={cockpitRef}>
          <CockpitShell />
          <VRMenu />
        </group>
      )}
      <VRFlightControls />
    </>
  );
}
