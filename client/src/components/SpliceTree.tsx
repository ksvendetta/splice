import { useMemo } from "react";
import type { Cable, Circuit } from "@shared/schema";

export interface SpliceTreeProps {
  cables: Cable[];
  circuits: Circuit[];
  selectedCableId: string | null;
  contextCableId: string | null;
  onNodeClick: (cableId: string) => void;
  onAddSplice: (cable: Cable) => void;
  mainSpliceName?: string; // Label shown on feed nodes instead of cable name
}

// Layout constants
const COL_W = 110; // horizontal spacing between depths
const ROW_H = 80;  // vertical spacing between sibling nodes
const PAD_X = 44;
const PAD_Y = 28;
const R = 9;       // splice node radius

interface LayoutNode {
  cable: Cable;
  depth: number; // 0 = feed, 1 = root dist, 2+ = sub-dist
  x: number;
  y: number;
  children: LayoutNode[];
}

function countLeaves(node: LayoutNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((s, c) => s + countLeaves(c), 0);
}

// Assign y coords to distribution subtree; returns next available y
function layoutDist(node: LayoutNode, depth: number, yStart: number): number {
  node.depth = depth;
  node.x = PAD_X + depth * COL_W;
  if (node.children.length === 0) {
    node.y = yStart + ROW_H / 2;
    return yStart + ROW_H;
  }
  let y = yStart;
  for (const child of node.children) {
    y = layoutDist(child, depth + 1, y);
  }
  node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
  return yStart + countLeaves(node) * ROW_H;
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
  const { feedNodes, distNodes, edges, svgW, svgH } = useMemo(() => {
    const feeds = cables.filter(c => c.type === "Feed");
    const dists = cables.filter(c => c.type === "Distribution");

    if (feeds.length === 0 && dists.length === 0) {
      return { feedNodes: [], distNodes: [], edges: [], svgW: 0, svgH: 0 };
    }

    // ── Build distribution tree ──────────────────────────────────────────────
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
    let distY = PAD_Y;
    for (const root of rootDists) {
      distY = layoutDist(root, 1, distY);
    }
    const totalDistLeaves = Math.max(1, rootDists.reduce((s, r) => s + countLeaves(r), 0));

    // ── Position feed cables ─────────────────────────────────────────────────
    // Centre feeds over the y-span used by root distributions
    const distYSpan = totalDistLeaves * ROW_H;
    const distYCentre = PAD_Y + distYSpan / 2;
    const feedCount = feeds.length || 1;
    // Always space feeds by at least ROW_H so labels never overlap
    const feedSpread = (feedCount - 1) * ROW_H;
    const feedStartY = distYCentre - feedSpread / 2;

    const feedNodes = feeds.map((cable, i) => ({
      cable,
      x: PAD_X,
      y: feedCount === 1 ? distYCentre : feedStartY + i * (feedSpread / (feedCount - 1)),
    }));

    // ── Collect all dist nodes flat ──────────────────────────────────────────
    const distNodes = Array.from(distMap.values());

    let maxDepth = 1;
    for (const n of distNodes) if (n.depth > maxDepth) maxDepth = n.depth;

    // ── Edges ────────────────────────────────────────────────────────────────
    type Edge = { x1: number; y1: number; x2: number; y2: number; key: string };
    const edges: Edge[] = [];

    // Feed → each root distribution
    for (const feed of feedNodes) {
      for (const root of rootDists) {
        edges.push({
          x1: feed.x, y1: feed.y,
          x2: root.x, y2: root.y,
          key: `feed-${feed.cable.id}-${root.cable.id}`,
        });
      }
    }

    // Distribution parent → children
    for (const node of distNodes) {
      for (const child of node.children) {
        edges.push({
          x1: node.x, y1: node.y,
          x2: child.x, y2: child.y,
          key: `${node.cable.id}-${child.cable.id}`,
        });
      }
    }

    const svgW = PAD_X * 2 + (maxDepth + 1) * COL_W;
    const svgH = Math.max(
      PAD_Y * 2 + totalDistLeaves * ROW_H,
      feedStartY + feedSpread + ROW_H,   // ensure last feed label fits
    );

    return { feedNodes, distNodes, edges, svgW, svgH };
  }, [cables]);

  // Pre-compute circuit totals per cable
  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const cable of cables) {
      const cc = circuits.filter(c => c.cableId === cable.id);
      map.set(cable.id, cc.reduce((s, c) => s + (c.fiberEnd - c.fiberStart + 1), 0));
    }
    return map;
  }, [cables, circuits]);

  if (feedNodes.length === 0 && distNodes.length === 0) return null;

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
    const boxTop    = y - R - 9 - 15;  // above label text baseline + ascender + padding
    const boxBottom = y + R + 14 + 13; // below fiber count baseline + descender + padding
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
          {isFeed ? (mainSpliceName || cable.spliceName || cable.name) : (cable.spliceName ?? cable.name)}
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

        {/* ── Feed nodes ── */}
        {feedNodes.map(n => renderNode(n.cable, n.x, n.y, true))}

        {/* ── Distribution (splice) nodes ── */}
        {distNodes.map(n => renderNode(n.cable, n.x, n.y, false))}
      </svg>
    </div>
  );
}
