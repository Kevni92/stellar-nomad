"use client";

import { memo, useState } from "react";

import Navigation from "../Navigation/Navigation";
import Scene from "../Scene/Scene";
import HUD from "../HUD/HUD";
import DevTools from "../DevTools";
import VRExperience from "../VR/VRExperience";
import "./Game.scss";

import { AsteroidRuntimeProvider } from "@/sim/asteroids/runtimeContext";
import { WorldOriginProvider } from "@/sim/worldOrigin";

const Game = () => {
  const [vrActive, setVrActive] = useState(false);

  return (
    <WorldOriginProvider>
      <AsteroidRuntimeProvider>
        <div className="container">
          {!vrActive ? (
            <>
              <Scene />
              <HUD />
              <Navigation />
              <DevTools />
            </>
          ) : null}
          <VRExperience active={vrActive} onActiveChange={setVrActive} />
        </div>
      </AsteroidRuntimeProvider>
    </WorldOriginProvider>
  );
};

export default memo(Game);
