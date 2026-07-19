"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { WebGLRenderer } from "three";

import VRWorld from "./VRWorld";
import "./VRExperience.scss";

type XRSessionLike = EventTarget & {
  end: () => Promise<void>;
};

type XRSystemLike = {
  isSessionSupported: (mode: "immersive-vr") => Promise<boolean>;
  requestSession: (
    mode: "immersive-vr",
    init?: {
      requiredFeatures?: string[];
      optionalFeatures?: string[];
    },
  ) => Promise<XRSessionLike>;
};

type VRExperienceProps = {
  active: boolean;
  onActiveChange: (active: boolean) => void;
};

function getXRSystem(): XRSystemLike | undefined {
  if (typeof navigator === "undefined") return undefined;
  return (navigator as Navigator & { xr?: XRSystemLike }).xr;
}

export default function VRExperience({ active, onActiveChange }: VRExperienceProps) {
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sessionRef = useRef<XRSessionLike | null>(null);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const xr = getXRSystem();
    if (!xr) {
      setSupported(false);
      return;
    }

    xr.isSessionSupported("immersive-vr")
      .then(setSupported)
      .catch(() => setSupported(false));
  }, []);

  const exitVR = useCallback(() => {
    void sessionRef.current?.end();
  }, []);

  const enterVR = useCallback(async () => {
    const xr = getXRSystem();
    const renderer = rendererRef.current;
    if (!xr || !renderer || starting) return;

    setStarting(true);
    setError(null);

    try {
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType("local-floor");
      renderer.xr.setFramebufferScaleFactor(0.82);

      const session = await xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["hand-tracking", "layers"],
      });
      sessionRef.current = session;

      session.addEventListener(
        "end",
        () => {
          sessionRef.current = null;
          onActiveChange(false);
        },
        { once: true },
      );

      await renderer.xr.setSession(
        session as unknown as Parameters<typeof renderer.xr.setSession>[0],
      );
      renderer.xr.setFoveation(0.75);
      onActiveChange(true);
    } catch (reason) {
      const message =
        reason instanceof Error
          ? reason.message
          : "Die VR-Session konnte nicht gestartet werden.";
      setError(message);
      onActiveChange(false);
    } finally {
      setStarting(false);
    }
  }, [onActiveChange, starting]);

  return (
    <div className={`vr-experience ${active ? "vr-experience--active" : ""}`}>
      <Canvas
        className="vr-experience__canvas"
        dpr={1}
        camera={{ position: [0, 1.6, 0], near: 0.05, far: 2000 }}
        gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          const renderer = gl as WebGLRenderer;
          renderer.xr.enabled = true;
          rendererRef.current = renderer;
        }}
      >
        <Suspense fallback={null}>
          <VRWorld exitVR={exitVR} />
        </Suspense>
      </Canvas>

      {!active && supported ? (
        <button
          className="vr-experience__enter"
          type="button"
          onClick={enterVR}
          disabled={starting}
        >
          {starting ? "VR wird gestartet …" : "IN META QUEST 3 STARTEN"}
        </button>
      ) : null}

      {!active && supported === false ? (
        <div className="vr-experience__notice">
          WebXR ist in diesem Browser nicht verfügbar. Öffne die Seite im Meta Quest Browser.
        </div>
      ) : null}

      {!active && error ? <div className="vr-experience__error">{error}</div> : null}
    </div>
  );
}
