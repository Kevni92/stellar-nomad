"use client";

import { useAtomValue } from "jotai";
import { useEffect, useState } from "react";

import { xrSessionActiveAtom } from "@/store/vr";
import { xrStore } from "./xrStore";

type XRNavigator = Navigator & {
  xr?: {
    isSessionSupported: (mode: "immersive-vr") => Promise<boolean>;
  };
};

export default function VRLaunchButton() {
  const sessionActive = useAtomValue(xrSessionActiveAtom);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const xr = (navigator as XRNavigator).xr;
    if (!xr) {
      setSupported(false);
      return;
    }

    xr.isSessionSupported("immersive-vr")
      .then(setSupported)
      .catch(() => setSupported(false));
  }, []);

  if (sessionActive) return null;

  const enterVR = async () => {
    setStarting(true);
    setError(null);
    try {
      const session = await xrStore.enterVR();
      if (!session) setError("Die VR-Session konnte nicht gestartet werden.");
    } catch (reason) {
      console.error("[VR] Failed to enter immersive VR", reason);
      setError("VR-Start fehlgeschlagen. Öffne die Seite direkt im Meta Quest Browser.");
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="vr-launch">
      <button
        className="vr-launch__button"
        type="button"
        disabled={supported !== true || starting}
        onClick={enterVR}
      >
        {starting ? "VR wird gestartet …" : "In VR starten"}
      </button>
      {supported === false && (
        <div className="vr-launch__hint">
          WebXR wird in diesem Browser nicht angeboten. Öffne die GitHub-Pages-URL im Meta Quest Browser.
        </div>
      )}
      {error && <div className="vr-launch__error">{error}</div>}
    </div>
  );
}
