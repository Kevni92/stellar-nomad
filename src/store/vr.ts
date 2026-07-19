import { atom } from "jotai";

export type VRMenuPage = "flight" | "cargo" | "research" | "craft" | "settings";

export const xrSessionActiveAtom = atom(false);
export const vrMenuOpenAtom = atom(false);
export const vrMenuPageAtom = atom<VRMenuPage>("flight");
export const vrFlightEnabledAtom = atom(true);
