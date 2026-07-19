import { createXRStore } from "@react-three/xr";

export const xrStore = createXRStore({
  offerSession: false,
  enterGrantedSession: false,
  emulate: false,
  hand: false,
  gaze: false,
  screenInput: false,
  frameRate: "high",
  foveation: 0.8,
  frameBufferScaling: 0.8,
});
