import type { Cable } from "@shared/schema";

// Extract the F#/D# numbers already in use, scanning each cable name's "-"-separated
// segments. A source cable renamed like "D3-F4" therefore contributes BOTH D3 and F4,
// so distribution and feed numbering both stay collision-free.
function usedNumbers(type: "Feed" | "Distribution", existingCables: Cable[]): Set<number> {
  const prefix = type === "Feed" ? "F" : "D";
  const used = new Set<number>();
  for (const c of existingCables) {
    for (const seg of (c.name ?? "").trim().split("-")) {
      const m = seg.match(/^([fd])(\d+)$/i);
      if (m && m[1].toUpperCase() === prefix) used.add(parseInt(m[2], 10));
    }
  }
  return used;
}

// Next default name for a brand-new cable: capital prefix (F feeds / D dists) and the
// lowest number not already used anywhere in the project. No sub-splice prefixing —
// cables added inside a sub-splice use the same normal scheme (e.g. D4).
export function getNextCableName(type: "Feed" | "Distribution", existingCables: Cable[]): string {
  const prefix = type === "Feed" ? "F" : "D";
  const used = usedNumbers(type, existingCables);
  let n = 1;
  while (used.has(n)) n += 1;
  return `${prefix}${n}`;
}

// When a cable becomes the source of a new sub-splice it also starts acting as a feed,
// so its name gains an "-F<n>" designation (n = next free feed number). A plain d#/f#
// name is upper-cased for consistency (d3 → D3-F4); any custom name is kept verbatim
// (teste → teste-F4).
export function sourceCableName(cable: Cable, existingCables: Cable[]): string {
  const raw = (cable.name ?? "").trim();
  const base = /^[df]\d+$/i.test(raw) ? raw.toUpperCase() : raw;
  return `${base}-${getNextCableName("Feed", existingCables)}`;
}

// A cable already acts as a sub-splice source if its name carries an F-segment or it
// already has child cables — used to avoid re-renaming on later splice-name edits.
export function isSubSpliceSource(cable: Cable, existingCables: Cable[]): boolean {
  const nameHasFeedSegment = (cable.name ?? "").split("-").some(s => /^f\d+$/i.test(s));
  const hasChildren = existingCables.some(c => c.parentCableId === cable.id);
  return nameHasFeedSegment || hasChildren;
}
