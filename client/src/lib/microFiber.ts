import type { CSSProperties } from "react";

// Micro-fiber (high-density loose tube) color coding.
//
// Standard ribbon cables run 12 fibers per ribbon and repeat the 12-color
// sequence per ribbon. Ultra-compact micro cables (e.g. Corning MiniXtend HD
// 288F) put 36 fibers in ONE tube, and identify them by cycling the same 12
// colors three times with black ring marks:
//
//   positions  1-12 : plain, no ring
//   positions 13-24 : one black ring
//   positions 25-36 : two black rings
//
// Position 8 of each cycle is black. A black ring cannot be seen on a black
// fiber, so the ringed cycles substitute NATURAL (undyed) for black — which
// makes absolute positions 20 and 32 natural, not black.

export const MICRO_TUBE_SIZE = 36;
export const MICRO_CYCLE = 12;

export interface Swatch {
  name: string;
  bg: string;
  text: string;
  /** Outline-style text colour, used by the Android badge renderer. */
  colorClass: string;
  hex: string;
  // Filled-badge overrides for colours that need them (white, black, natural).
  ribbonBg?: string;
  ribbonText?: string;
  ribbonBorder?: string;
}

// The 12-color base sequence, shared by tube colors and fiber colors.
export const microBaseColors: Swatch[] = [
  { name: "blue",   bg: "bg-blue-500",   text: "text-white", colorClass: "text-blue-500",   hex: "#3b82f6" },
  { name: "orange", bg: "bg-orange-500", text: "text-white", colorClass: "text-orange-500", hex: "#f97316" },
  { name: "green",  bg: "bg-green-600",  text: "text-white", colorClass: "text-green-600",  hex: "#16a34a" },
  { name: "brown",  bg: "bg-amber-700",  text: "text-white", colorClass: "text-amber-700",  hex: "#b45309" },
  { name: "slate",  bg: "bg-slate-500",  text: "text-white", colorClass: "text-slate-500",  hex: "#64748b" },
  { name: "white",  bg: "bg-white",      text: "text-black", colorClass: "text-black",      hex: "#ffffff",
    ribbonBg: "bg-white", ribbonText: "text-black", ribbonBorder: "border-black" },
  { name: "red",    bg: "bg-red-600",    text: "text-white", colorClass: "text-red-600",    hex: "#dc2626" },
  { name: "black",  bg: "bg-black",      text: "text-white", colorClass: "text-gray-400",   hex: "#000000",
    ribbonBg: "bg-black", ribbonText: "text-gray-400", ribbonBorder: "border-black" },
  { name: "yellow", bg: "bg-yellow-400", text: "text-black", colorClass: "text-yellow-500", hex: "#facc15" },
  { name: "violet", bg: "bg-purple-600", text: "text-white", colorClass: "text-purple-600", hex: "#9333ea" },
  { name: "pink",   bg: "bg-pink-500",   text: "text-white", colorClass: "text-pink-500",   hex: "#ec4899" },
  { name: "aqua",   bg: "bg-cyan-400",   text: "text-black", colorClass: "text-cyan-500",   hex: "#22d3ee" },
];

// Undyed fiber — replaces black in the ring-marked cycles.
export const naturalSwatch: Swatch = {
  name: "natural",
  bg: "bg-stone-200",
  text: "text-black",
  colorClass: "text-stone-500",
  hex: "#e7e5e4",
  ribbonBg: "bg-stone-200",
  ribbonText: "text-black",
  ribbonBorder: "border-black",
};

/** 1-based tube number holding this 1-based fiber. */
export function getMicroTubeNumber(fiber: number, tubeSize: number = MICRO_TUBE_SIZE): number {
  return Math.ceil(fiber / tubeSize);
}

/** 1-based position of this fiber inside its tube (1..tubeSize). */
export function getMicroPositionInTube(fiber: number, tubeSize: number = MICRO_TUBE_SIZE): number {
  return ((fiber - 1) % tubeSize) + 1;
}

/** Number of black ring marks on a fiber at this in-tube position: 0, 1 or 2. */
export function getMicroRingCount(positionInTube: number): number {
  return Math.floor((positionInTube - 1) / MICRO_CYCLE);
}

/**
 * Colour of a fiber at a 1-based in-tube position, applying the
 * black -> natural substitution for ring-marked cycles.
 */
export function getMicroStrandColor(positionInTube: number): Swatch {
  const rings = getMicroRingCount(positionInTube);
  const idx = (positionInTube - 1) % MICRO_CYCLE;
  if (idx === 7 && rings > 0) return naturalSwatch;
  return microBaseColors[idx];
}

/** Colour of a 1-based tube number. */
export function getMicroTubeColor(tube: number): Swatch {
  return microBaseColors[(tube - 1) % MICRO_CYCLE];
}

/** Human-readable fiber identity, e.g. "slate, one ring". */
export function describeMicroFiber(fiber: number, tubeSize: number = MICRO_TUBE_SIZE): string {
  const tube = getMicroTubeNumber(fiber, tubeSize);
  const pos = getMicroPositionInTube(fiber, tubeSize);
  const rings = getMicroRingCount(pos);
  const color = getMicroStrandColor(pos);
  const ringText = rings === 0 ? "no ring" : rings === 1 ? "one ring" : "two rings";
  return `Fiber ${fiber} — tube ${tube} (${getMicroTubeColor(tube).name}), position ${pos}: ${color.name}, ${ringText}`;
}

/** Translucent fill derived from a swatch, for tube group backfill. */
export function microTint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}


/** Black or white - whichever stays readable on this swatch. */
export function microContrastHex(swatch: Swatch): string {
  return swatch.text === "text-black" ? "#000000" : "#ffffff";
}

/**
 * The tube colour, rendered true rather than tinted. Compositing a translucent
 * colour over the dark theme dragged every hue toward the same muddy tone -
 * orange read as brown, red as maroon - so the fill is the colour itself, with
 * a foreground picked to stay readable on it.
 */
export function microCellStyle(tube: number): CSSProperties {
  const color = getMicroTubeColor(tube);
  return { backgroundColor: color.hex, color: microContrastHex(color) };
}
