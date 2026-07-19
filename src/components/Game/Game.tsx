"use client";

import { memo } from "react";

import Navigation from "../Navigation/Navigation";
import "./Game.scss";
import Scene from "../Scene/Scene";
import HUD from "../HUD/HUD";
import DevTools from "../DevTools";
import VRLaunchButton from "../VR/VRLaunchButton";

import { AsteroidRuntimeProvider } from "@/sim/asteroids/runtimeContext";
import { WorldOriginProvider } from "@/sim/worldOrigin";

const Game = () => {
  return (
    <WorldOriginProvider>
      <AsteroidRuntimeProvider>
        <div className="container">
          <Scene />
          <HUD />
          <Navigation />
          <DevTools />
          <VRLaunchButton />
        </div>
      </AsteroidRuntimeProvider>
    </WorldOriginProvider>
  );
};

export default memo(Game);
