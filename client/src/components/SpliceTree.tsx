import { useMemo } from "react";
import type { Cable, Circuit } from "@shared/schema";

export interface SpliceTreeProps {
  cables: Cable[];
  circuits: Circuit[];
  selectedCableId: string | null;
  contextCableId: string | null;
  onNodeClick: (cableId: string) => void;
  onAddSplice: (cable: Cable) => void;
  mainSpliceName?: string; // Reserved (splice name is shown in the nav panel, not on nodes)
}

// Layout constants
const COL_W = 110; // horizontal spacing between depths
const ROW_H = 80;  // vertical spacing between sibling nodes
const PAD_X = 44;
const PAD_Y = 28;
const R = 9;       // splice node radius
const NODE_BOX_TOP = R + 9 + 15;
const NODE_BOX_BOTTOM = R + 14 + 13;

interface LayoutNode {
  cable: Cable;
  depth: number; // 0 = feed, 1 = root dist, 2+ = sub-dist
  x: number;
  y: number;
  children: LayoutNode[];
}

// Anchor each child group around its parent. Deeper branches should not reserve
// extra vertical space in earlier generations of the tree.
function layoutDist(node: LayoutNode, depth: number, y: number): void {
  node.depth = depth;
  node.x = PAD_X + depth * COL_W;
  node.y = y;

  if (node.children.length > 0) {
    const childStartY = y - ((node.children.length - 1) * ROW_H) / 2;
    for (let i = 0; i < node.children.length; i += 1) {
      layoutDist(node.children[i], depth + 1, childStartY + i * ROW_H);
    }
  }
}

export function SpliceTree({
  cables,
  circuits,
  selectedCableId,
  contextCableId,
  onNodeClick,
  onAddSplice,
  mainSpliceName,
}: SpliceTreeProps) {
  const { feedNodes, distNodes, subFeedNodes, edges, svgW, svgH } = useMemo(() => {
    // Node roles:
    //  - Top feeds (Feed, no parent) are the primary sources at depth 0.
    //  - Distributions form a tree by parentCableId (root dists at depth 1, sub-dists deeper).
    //  - Sub-splice feeds (Feed WITH a parent) are extra sources that live in the SAME
    //    column as their parent distribution, alongside it — not one column deeper.
    const topFeeds = cables.filter(c => c.type === "Feed" && !c.parentCableId);
    const dists = cables.filter(c => c.type === "Distribution");
    const subFeeds = cables.filter(c => c.type === "Feed" && c.parentCableId);

    if (topFeeds.length === 0 && dists.length === 0 && subFeeds.length === 0) {
      return { feedNodes: [], distNodes: [], subFeedNodes: [], edges: [], svgW: 0, svgH: 0 };
    }

    // ── Build distribution tree (distributions only) ─────────────────────────
    const distMap = new Map<string, LayoutNode>();
    for (const c of dists) {
      distMap.set(c.id, { cable: c, depth: 1, x: 0, y: 0, children: [] });
    }
    const rootDists: LayoutNode[] = [];
    for (const c of dists) {
      const node = distMap.get(c.id)!;
      if (c.parentCableId && distMap.has(c.parentCableId)) {
        distMap.get(c.parentCableId)!.children.push(node);
      } else {
        rootDists.push(node);
      }
    }

    // Lay out distribution tree starting at depth 1 (feeds occupy depth 0)
    const rootStartY = PAD_Y + ROW_H / 2;
    for (let i = 0; i < rootDists.length; i += 1) {
      layoutDist(rootDists[i], 1, rootStartY + i * ROW_H);
    }
    const rootDistCount = Math.max(1, rootDists.length);

    // ── Position top-level feed cables ───────────────────────────────────────
    // Centre feeds over the root distribution span
    const distYSpan = rootDistCount * ROW_H;
    const distYCentre = PAD_Y + distYSpan / 2;
    const feedCount = topFeeds.length || 1;
    // Always space feeds by at least ROW_H so labels never overlap
    const feedSpread = (feedCount - 1) * ROW_H;
    const feedStartY = distYCentre - feedSpread / 2;

    const feedNodes = topFeeds.map((cable, i) => ({
      cable,
      x: PAD_X,
      y: feedCount === 1 ? distYCentre : feedStartY + i * (feedSpread / (feedCount - 1)),
    }));

    const distNodes = Array.from(distMap.values());

    // ── Position sub-splice feeds in their parent's column ───────────────────
    // Track which y positions are taken per column so sub-feeds don't overlap.
    const occupied = new Map<number, number[]>();
    const mark = (depth: number, y: number) => {
      if (!occupied.has(depth)) occupied.set(depth, []);
      occupied.get(depth)!.push(y);
    };
    for (const n of distNodes) mark(n.depth, n.y);
    for (const n of feedNodes) mark(0, n.y);

    const subFeedNodes: Array<{ cable: Cable; depth: number; x: number; y: number }> = [];
    for (const sf of subFeeds) {
      const parent = sf.parentCableId ? distMap.get(sf.parentCableId) : undefined;
      const depth = parent ? parent.depth : 1; // same column as the parent distribution
      const baseY = parent ? parent.y : rootStartY;
      if (!occupied.has(depth)) occupied.set(depth, []);
      const col = occupied.get(depth)!;
      const collides = (yy: number) => col.some(o => Math.abs(o - yy) < ROW_H);
      // Start next to the parent, then fan out until a free slot is found.
      let y = baseY;
      let step = 1;
      while (collides(y)) {
        const down = baseY + step * ROW_H;
        if (!collides(down)) { y = down; break; }
        const up = baseY - step * ROW_H;
        if (!collides(up)) { y = up; break; }
        step += 1;
      }
      mark(depth, y);
      subFeedNodes.push({ cable: sf, depth, x: PAD_X + depth * COL_W, y });
    }

    // ── Normalise vertical offset so nothing clips above PAD_Y ───────────────
    const allNodes = [...feedNodes, ...distNodes, ...subFeedNodes];
    const minBoxTop = Math.min(...allNodes.map(n => n.y - NODE_BOX_TOP));
    const shiftY = Math.max(0, PAD_Y - minBoxTop);
    if (shiftY > 0) {
      for (const node of allNodes) node.y += shiftY;
    }

    let maxDepth = 1;
    for (const n of distNodes) if (n.depth > maxDepth) maxDepth = n.depth;

    // ── Edges: driven by ACTUAL splices, not structure ───────────────────────
    // A line is drawn from a source cable to a cable only where that cable has a
    // spliced circuit pointing back at the source (feedCableId). So an unspliced
    // feed/distribution shows no connecting lines.
    const posById = new Map<string, { x: number; y: number }>();
    for (const n of feedNodes) posById.set(n.cable.id, n);
    for (const n of distNodes) posById.set(n.cable.id, n);
    for (const n of subFeedNodes) posById.set(n.cable.id, n);

    type Edge = { x1: number; y1: number; x2: number; y2: number; key: string };
    const edges: Edge[] = [];
    const seenEdge = new Set<string>();
    for (const cable of cables) {
      const sources = new Set<string>();
      for (const c of circuits) {
        if (c.cableId === cable.id && c.isSpliced === 1 && c.feedCableId) {
          sources.add(c.feedCableId);
        }
      }
      sources.forEach(srcId => {
        const from = posById.get(srcId);
        const to = posById.get(cable.id);
        if (!from || !to) return;
        const key = `${srcId}->${cable.id}`;
        if (seenEdge.has(key)) return;
        seenEdge.add(key);
        edges.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, key });
      });
    }

    const svgW = PAD_X * 2 + (maxDepth + 1) * COL_W;
    const maxBoxBottom = Math.max(...allNodes.map(n => n.y + NODE_BOX_BOTTOM));
    const svgH = Math.max(PAD_Y * 2 + rootDistCount * ROW_H + shiftY, maxBoxBottom + PAD_Y);

    return { feedNodes, distNodes, subFeedNodes, edges, svgW, svgH };
  }, [cables, circuits]);

  // Pre-compute circuit totals per cable
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const cable of cables) {
      const cc = circuits.filter(c => c.cableId === cable.id);
      map.set(cable.id, cc.reduce((s, c) => s + (c.fiberEnd - c.fiberStart + 1), 0));
    }
    return map;
  }, [cables, circuits]);

  if (feedNodes.length === 0 && distNodes.length === 0 && subFeedNodes.length === 0) return null;

  // Shared node renderer
  const renderNode = (
    cable: Cable,
    x: number,
    y: number,
    isFeed: boolean,
  ) => {
    const isSelected = selectedCableId === cable.id;
    const isContext = contextCableId === cable.id;
    const total = totals.get(cable.id) ?? 0;
    const pass = total === cable.fiberCount;
    const fill = pass ? "#22c55e" : "#ef4444";
    const ringColor = pass ? "#16a34a" : "#dc2626";
    // Box bounds that fully enclose label (above) + node + fiber count (below)
    const boxTop    = y - NODE_BOX_TOP;    // above label text baseline + ascender + padding
    const boxBottom = y + NODE_BOX_BOTTOM; // below fiber count baseline + descender + padding
    const boxLeft   = x - 40;
    const boxRight  = x + 40;

    return (
      <g key={cable.id}>
        {/* Selection highlight — rounded rect fully enclosing entire node */}
        {(isSelected || isContext) && (
          <rect
            x={boxLeft} y={boxTop}
            width={boxRight - boxLeft} height={boxBottom - boxTop}
            rx={8} ry={8}
            fill="#3b82f6" fillOpacity={0.12}
            stroke="#3b82f6" strokeWidth={1.5}
            className="pointer-events-none"
          />
        )}
        {/* Hit area */}
        <circle
          cx={x} cy={y} r={R + 8}
          fill="transparent"
          className="cursor-pointer"
          onClick={() => onNodeClick(cable.id)}
        />
        {/* Pass / fail ring */}
        <circle
          cx={x} cy={y} r={R + 4}
          fill="none"
          stroke={ringColor}
          strokeWidth={1.5}
          strokeDasharray={pass ? undefined : "3 2"}
          className="pointer-events-none"
        />
        {/* Splice node */}
        <circle
          cx={x} cy={y} r={R}
          fill={fill} stroke="white" strokeWidth={2}
          className="pointer-events-none"
        />
        {/* Splice name (if set) or cable name — above */}
        <text
          x={x} y={y - R - 9}
          textAnchor="middle" fontSize={11}
          fontWeight={isSelected ? "700" : "400"}
          className="fill-foreground select-none pointer-events-none"
        >
          {cable.spliceName ?? cable.name}
        </text>
        {/* Fiber count — below */}
        <text
          x={x} y={y + R + 14}
          textAnchor="middle" fontSize={9}
          fill={pass ? "#16a34a" : "#dc2626"}
          className="select-none pointer-events-none"
        >
          {total}/{cable.fiberCount}
        </text>
      </g>
    );
  };

  return (
    <div className="overflow-x-auto">
      <svg width={svgW} height={svgH} className="block">
        {/* ── Edges ── */}
        {edges.map(e => {
          const mx = (e.x1 + e.x2) / 2;
          return (
            <path
              key={e.key}
              d={`M${e.x1},${e.y1} C${mx},${e.y1} ${mx},${e.y2} ${e.x2},${e.y2}`}
              fill="none"
              stroke="currentColor"
              strokeOpacity={0.25}
              strokeWidth={2}
            />
          );
        })}

        {/* ── Top-level feed nodes ── */}
        {feedNodes.map(n => renderNode(n.cable, n.x, n.y, true))}

        {/* ── Distribution (splice) nodes ── */}
        {distNodes.map(n => renderNode(n.cable, n.x, n.y, false))}

        {/* ── Sub-splice feed nodes (co-sources in their parent's column) ── */}
        {subFeedNodes.map(n => renderNode(n.cable, n.x, n.y, true))}
      </svg>
    </div>
  );
}
