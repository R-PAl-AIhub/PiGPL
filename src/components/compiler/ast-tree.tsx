import { useMemo } from "react";
import type { TreeNode } from "@/compiler/ast";
import { cn } from "@/lib/utils";

const NODE_H = 32;
const H_GAP = 18;
const V_GAP = 44;
const PAD = 16;

interface Box {
  node: TreeNode;
  x: number;
  y: number;
  w: number;
  children: Box[];
}

function measure(label: string) {
  return Math.max(56, Math.min(220, 12 + label.length * 7.4));
}

function layout(node: TreeNode, depth = 0): Box {
  const kids = node.children.map((c) => layout(c, depth + 1));
  const w = measure(node.label);
  const childW =
    kids.length === 0 ? w : kids.reduce((s, k) => s + k.w, 0) + H_GAP * (kids.length - 1);
  const width = Math.max(w, childW);
  let xCursor = 0;
  const placed = kids.map((k) => {
    const b = { ...k, x: xCursor, y: NODE_H + V_GAP };
    xCursor += k.w + H_GAP;
    return b;
  });
  const shift = (width - childW) / 2;
  const shifted = placed.map((k) => offset(k, shift, 0));
  return { node, x: 0, y: 0, w: width, children: shifted };
}

// Child positions are relative to their parent, so only the box itself moves.
function offset(box: Box, dx: number, dy: number): Box {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

function flatten(box: Box, ox: number, oy: number): { node: TreeNode; x: number; y: number; w: number }[] {
  const absX = ox + box.x;
  const absY = oy + box.y;
  const selfW = measure(box.node.label);
  const cx = absX + (box.w - selfW) / 2;
  return [
    { node: box.node, x: cx, y: absY, w: selfW },
    ...box.children.flatMap((c) => flatten(c, absX, absY)),
  ];
}

function edges(
  box: Box,
  ox: number,
  oy: number,
): { x1: number; y1: number; x2: number; y2: number }[] {
  const px = ox + box.x + box.w / 2;
  const py = oy + box.y + NODE_H;
  const out: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const c of box.children) {
    const cx = ox + box.x + c.x + c.w / 2;
    const cy = oy + box.y + c.y;
    out.push({ x1: px, y1: py, x2: cx, y2: cy });
    out.push(...edges(c, ox + box.x, oy + box.y));
  }
  return out;
}

/**
 * The parser reduces bottom-up, so a parent is always reduced after its children
 * (the root `program` node comes last). Returning a single filtered tree would hide
 * everything until the final step. Instead return a forest: every reduced node whose
 * parent has not been reduced yet becomes a root of its own subtree.
 */
function visibleForest(node: TreeNode, maxEventId: number): TreeNode[] {
  if (node.eventId > maxEventId) {
    return node.children.flatMap((c) => visibleForest(c, maxEventId));
  }
  return [
    {
      ...node,
      children: node.children.flatMap((c) => visibleForest(c, maxEventId)),
    },
  ];
}

const TREE_GAP = H_GAP * 2;

export function AstTree({
  tree,
  maxEventId,
  currentId,
}: {
  tree: TreeNode;
  maxEventId: number;
  currentId?: number;
}) {
  const forest = useMemo(() => visibleForest(tree, maxEventId), [tree, maxEventId]);
  const { nodes, lines, width, depth } = useMemo(() => {
    let x = 0;
    const allNodes: ReturnType<typeof flatten> = [];
    const allLines: ReturnType<typeof edges> = [];
    let maxD = 0;
    for (const root of forest) {
      const box = layout(root);
      const placed = offset(box, x, 0);
      allNodes.push(...flatten(placed, PAD, PAD));
      allLines.push(...edges(placed, PAD, PAD));
      maxD = Math.max(maxD, maxDepth(root));
      x += box.w + TREE_GAP;
    }
    const total = forest.length === 0 ? 0 : x - TREE_GAP;
    return { nodes: allNodes, lines: allLines, width: total + PAD * 2, depth: maxD };
  }, [forest]);

  if (nodes.length === 0) {
    return (
      <p className="text-sm text-muted">
        The tree appears as the parser reduces grammar productions.
      </p>
    );
  }

  const height = PAD * 2 + NODE_H + depth * (NODE_H + V_GAP);

  return (
    <div className="overflow-auto">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Abstract syntax tree"
        className="max-w-full"
      >
        {lines.map((l, i) => (
          <path
            key={i}
            d={`M ${l.x1} ${l.y1} C ${l.x1} ${(l.y1 + l.y2) / 2}, ${l.x2} ${(l.y1 + l.y2) / 2}, ${l.x2} ${l.y2}`}
            fill="none"
            className="stroke-border"
            strokeWidth={1.25}
          />
        ))}
        {nodes.map((n) => {
          const current = n.node.id === currentId || n.node.eventId === currentId;
          return (
            <g key={n.node.id} transform={`translate(${n.x}, ${n.y})`}>
              <rect
                width={n.w}
                height={NODE_H}
                rx={8}
                className={
                  current
                    ? "fill-accent/20 stroke-accent"
                    : "fill-elevated stroke-border"
                }
                strokeWidth={1}
              />
              <text
                x={n.w / 2}
                y={NODE_H / 2 + 4}
                textAnchor="middle"
                className={cn("font-mono text-xs", current ? "fill-fg" : "fill-muted")}
              >
                {n.node.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function maxDepth(node: TreeNode): number {
  if (node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map(maxDepth));
}
