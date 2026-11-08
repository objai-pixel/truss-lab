"use client";

import { useId } from "react";
import { MATERIAL_MAP } from "@/lib/truss/materials";
import { supportLabel } from "@/lib/truss/geometry";
import type { Analysis, Load, Member, Node, Support } from "@/lib/truss/types";
import { BOARD_H, BOARD_W, COLS, PAD_L, PAD_T, ROWS, STEP, fromScreen, pointSegmentDistance, toScreen } from "./grid";
import { SceneBackdrop, type SceneId } from "./scenes";

export type BoardPick = {
  nodeId: number | null;
  memberId: number | null;
  supportNodeId: number | null;
  weightId: number | null;
  grid: { x: number; y: number } | null;
  ground: { x: number; z: number } | null;
};

export type BoardSelection =
  | { kind: "node"; id: number }
  | { kind: "member"; id: number }
  | { kind: "support"; id: number }
  | { kind: "weight"; id: number };

export type BoardWeight = {
  id: number;
  nodeId: number;
  name: string;
  newton: number;
};

type Props = {
  nodes: Node[];
  members: Member[];
  supports: Support[];
  loads: Load[];
  analysis: Analysis | null;
  weights?: BoardWeight[];
  car?: { x: number; y: number } | null;
  carPath?: number[];
  pendingNodeId?: number | null;
  hoverMemberId?: number | null;
  fixedNodeIds?: number[];
  ghostLoads?: boolean;
  showStones?: boolean;
  showGrid?: boolean;
  scene?: SceneId;
  selected?: BoardSelection | null;
  focusNodeId?: number | null;
  focusMemberIds?: number[];
  onPick?: (pick: BoardPick) => void;
  onHoverMember?: (memberId: number | null, point: { x: number; y: number } | null) => void;
};

export function Board(props: Props) {
  const rawId = useId().replace(/:/g, "");
  const stoneId = `stone-${rawId}`;
  const failed = new Set(props.analysis?.failures.map((failure) => failure.memberId) ?? []);
  const loose = props.analysis?.status === "unstable";
  const wall = props.supports.some((support) => support.type === "rollerX");

  function localPoint(event: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null {
    const svg = event.currentTarget;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const local = point.matrixTransform(matrix.inverse());
    return { x: local.x, y: local.y };
  }

  function identify(local: { x: number; y: number }): BoardPick {
    const structural = fromScreen(local.x, local.y);
    let weightId: number | null = null;
    const weights = props.weights ?? [];
    for (const weight of weights) {
      const node = props.nodes.find((item) => item.id === weight.nodeId);
      if (!node) continue;
      const screen = toScreen(node.x, node.y);
      const stack = weights.filter((item) => item.nodeId === weight.nodeId).findIndex((item) => item.id === weight.id);
      const top = screen.sy - 30 - Math.max(0, stack) * 18;
      if (local.x >= screen.sx - 16 && local.x <= screen.sx + 16 && local.y >= top && local.y <= top + 16) weightId = weight.id;
    }
    let supportNodeId: number | null = null;
    if (weightId === null) {
      for (const support of props.supports) {
        const node = props.nodes.find((item) => item.id === support.nodeId);
        if (!node) continue;
        const screen = toScreen(node.x, node.y);
        const hit =
          support.type === "rollerX"
            ? local.x >= screen.sx - 32 && local.x <= screen.sx - 2 && local.y >= screen.sy - 14 && local.y <= screen.sy + 14
            : local.x >= screen.sx - 18 && local.x <= screen.sx + 18 && local.y >= screen.sy + 10 && local.y <= screen.sy + 42;
        if (hit) supportNodeId = support.nodeId;
      }
    }
    let nodeId: number | null = null;
    let best = 0.36;
    for (const node of props.nodes) {
      const distance = Math.hypot(node.x - structural.x, node.y - structural.y);
      if (distance < best) {
        best = distance;
        nodeId = node.id;
      }
    }
    let memberId: number | null = null;
    let memberDistance = 0.24;
    if (nodeId === null) {
      for (const member of props.members) {
        const a = props.nodes.find((node) => node.id === member.i);
        const b = props.nodes.find((node) => node.id === member.j);
        if (!a || !b) continue;
        const distance = pointSegmentDistance(structural.x, structural.y, a.x, a.y, b.x, b.y);
        if (distance < memberDistance) {
          memberDistance = distance;
          memberId = member.id;
        }
      }
    }
    const gridX = Math.round(structural.x);
    const gridY = Math.round(structural.y);
    const grid =
      gridX >= 0 && gridX <= COLS && gridY >= 0 && gridY <= ROWS && Math.hypot(gridX - structural.x, gridY - structural.y) < 0.34
        ? { x: gridX, y: gridY }
        : null;
    return { nodeId, memberId, supportNodeId, weightId, grid, ground: null };
  }

  const loadByNode = new Map<number, number>();
  for (const load of props.loads) {
    loadByNode.set(load.nodeId, (loadByNode.get(load.nodeId) ?? 0) + Math.max(0, -load.fy));
  }

  return (
    <svg
      className={`board-svg${loose ? " is-loose" : ""}${failed.size ? " is-broken" : ""}`}
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      role="img"
      aria-label="트러스 작업판"
      onPointerMove={(event) => {
        const local = localPoint(event);
        if (!local) return;
        props.onHoverMember?.(identify(local).memberId, { x: event.clientX, y: event.clientY });
      }}
      onPointerLeave={() => props.onHoverMember?.(null, null)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const local = localPoint(event);
        if (!local) return;
        props.onPick?.(identify(local));
      }}
    >
      <defs>
        <radialGradient id={stoneId} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fffdf8" />
          <stop offset="65%" stopColor="#f3ecdf" />
          <stop offset="100%" stopColor="#c9bba6" />
        </radialGradient>
      </defs>
      <SceneBackdrop scene={props.scene ?? "paper"} uid={rawId} />
      {props.showGrid
        ? Array.from({ length: COLS + 1 }, (_, index) => (
            <line
              key={`v${index}`}
              className="grid-line"
              x1={PAD_L + index * STEP}
              y1={PAD_T}
              x2={PAD_L + index * STEP}
              y2={PAD_T + ROWS * STEP}
            />
          ))
        : null}
      {props.showGrid
        ? Array.from({ length: ROWS + 1 }, (_, index) => (
            <line
              key={`h${index}`}
              className="grid-line"
              x1={PAD_L}
              y1={PAD_T + index * STEP}
              x2={PAD_L + COLS * STEP}
              y2={PAD_T + index * STEP}
            />
          ))
        : null}
      {wall ? <Wall nodes={props.nodes} supports={props.supports} /> : null}
      <Road nodes={props.nodes} path={props.carPath ?? []} />
      {props.members.map((member) => (
        <MemberLine
          key={member.id}
          member={member}
          nodes={props.nodes}
          analysis={props.analysis}
          failed={failed.has(member.id)}
          hot={props.hoverMemberId === member.id}
          focused={props.focusMemberIds?.includes(member.id) ?? false}
          picked={props.selected?.kind === "member" && props.selected.id === member.id}
        />
      ))}
      {props.supports.map((support) => {
        const node = props.nodes.find((item) => item.id === support.nodeId);
        if (!node) return null;
        return (
          <SupportMark
            key={`${support.nodeId}-${support.type}`}
            node={node}
            support={support}
            picked={props.selected?.kind === "support" && props.selected.id === support.nodeId}
          />
        );
      })}
      {[...loadByNode.entries()].map(([nodeId, newton]) => {
        const node = props.nodes.find((item) => item.id === nodeId);
        if (!node || newton < 0.5) return null;
        return (
          <LoadMark
            key={nodeId}
            node={node}
            newton={newton}
            ghost={props.ghostLoads ?? false}
            stone={props.showStones ?? false}
          />
        );
      })}
      {(props.weights ?? []).map((weight, index) => {
        const node = props.nodes.find((item) => item.id === weight.nodeId);
        if (!node) return null;
        const stack = (props.weights ?? []).filter((item) => item.nodeId === weight.nodeId).findIndex((item) => item.id === weight.id);
        return (
          <WeightMark
            key={weight.id}
            weight={weight}
            node={node}
            stack={stack < 0 ? index : stack}
            picked={props.selected?.kind === "weight" && props.selected.id === weight.id}
          />
        );
      })}
      {props.nodes.map((node) => (
        <NodeStone
          key={node.id}
          node={node}
          fill={`url(#${stoneId})`}
          pending={props.pendingNodeId === node.id}
          focused={props.focusNodeId === node.id}
          fixed={props.fixedNodeIds?.includes(node.id) ?? false}
          onPath={(props.carPath ?? []).includes(node.id)}
          picked={props.selected?.kind === "node" && props.selected.id === node.id}
        />
      ))}
      {props.car ? <Car x={props.car.x} y={props.car.y} /> : null}
    </svg>
  );
}

function Wall({ nodes, supports }: { nodes: Node[]; supports: Support[] }) {
  const support = supports.find((item) => item.type === "rollerX");
  const node = nodes.find((item) => item.id === support?.nodeId);
  if (!node) return null;
  const screen = toScreen(node.x, node.y);
  return (
    <g className="wall">
      {Array.from({ length: 7 }, (_, index) => (
        <line key={index} x1={screen.sx - 28} y1={screen.sy - 70 + index * 14} x2={screen.sx - 14} y2={screen.sy - 80 + index * 14} />
      ))}
      <line x1={screen.sx - 16} y1={screen.sy - 86} x2={screen.sx - 16} y2={screen.sy + 36} />
    </g>
  );
}

function Road({ nodes, path }: { nodes: Node[]; path: number[] }) {
  if (path.length < 2) return null;
  const points = path
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is Node => Boolean(node))
    .map((node) => toScreen(node.x, node.y));
  if (points.length < 2) return null;
  const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.sx} ${point.sy}`).join(" ");
  return <path d={d} className="road" />;
}

function MemberLine({
  member,
  nodes,
  analysis,
  failed,
  hot,
  focused,
  picked,
}: {
  member: Member;
  nodes: Node[];
  analysis: Analysis | null;
  failed: boolean;
  hot: boolean;
  focused: boolean;
  picked: boolean;
}) {
  const a = nodes.find((node) => node.id === member.i);
  const b = nodes.find((node) => node.id === member.j);
  const material = MATERIAL_MAP[member.materialId];
  if (!a || !b || !material) return null;
  const p = toScreen(a.x, a.y);
  const q = toScreen(b.x, b.y);
  const force = analysis?.forces.find((item) => item.memberId === member.id);
  let color = material.color;
  if (force && analysis && analysis.status !== "unstable" && analysis.status !== "invalid") {
    if (force.mode === "tension") color = "#1d4e89";
    if (force.mode === "compression") color = "#9d341f";
    if (force.mode === "zero") color = "#8d8376";
    if (failed) color = "#4a1010";
  }
  const mx = (p.sx + q.sx) / 2;
  const my = (p.sy + q.sy) / 2;
  const dx = q.sx - p.sx;
  const dy = q.sy - p.sy;
  const length = Math.hypot(dx, dy) || 1;
  const dash = material.id === "cable" ? "2 5" : material.id === "rebar" ? "9 3" : undefined;
  return (
    <g className={failed ? "member failed" : "member"}>
      <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} stroke="transparent" strokeWidth="18" />
      {focused ? <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} className="focus-member" /> : null}
      {picked ? <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} className="pick-member" /> : null}
      <line
        x1={p.sx}
        y1={p.sy}
        x2={q.sx}
        y2={q.sy}
        stroke={color}
        strokeWidth={hot ? 9 : 6}
        strokeLinecap="round"
        strokeDasharray={dash}
      />
      <text x={mx + (-dy / length) * 12} y={my + (dx / length) * 12} className="member-tag">
        {member.id}
      </text>
    </g>
  );
}

function NodeStone({
  node,
  fill,
  pending,
  focused,
  fixed,
  onPath,
  picked,
}: {
  node: Node;
  fill: string;
  pending: boolean;
  focused: boolean;
  fixed: boolean;
  onPath: boolean;
  picked: boolean;
}) {
  const screen = toScreen(node.x, node.y);
  return (
    <g className="stone">
      {focused ? <circle cx={screen.sx} cy={screen.sy} r="20" className="focus-ring" /> : null}
      {picked ? <circle cx={screen.sx} cy={screen.sy} r="18" className="pick-ring" /> : null}
      {pending || onPath ? <circle cx={screen.sx} cy={screen.sy} r="16" className="stone-ring" /> : null}
      <circle cx={screen.sx} cy={screen.sy} r="11" fill={fill} stroke={fixed ? "#1d4e89" : "#1a120c"} strokeWidth={fixed ? 2.4 : 1.5} />
      <text x={screen.sx + 14} y={screen.sy - 12} className="node-tag">
        {node.id}
      </text>
    </g>
  );
}

function SupportMark({ node, support, picked }: { node: Node; support: Support; picked: boolean }) {
  const screen = toScreen(node.x, node.y);
  if (support.type === "rollerX") {
    return (
      <g className="support" aria-label={supportLabel(support.type)}>
        {picked ? <circle cx={screen.sx - 16} cy={screen.sy} r="16" className="pick-ring" /> : null}
        <circle cx={screen.sx - 18} cy={screen.sy} r="5" />
        <path d={`M${screen.sx - 8} ${screen.sy - 10} L${screen.sx - 8} ${screen.sy + 10} L${screen.sx + 2} ${screen.sy} Z`} />
      </g>
    );
  }
  return (
    <g className="support" aria-label={supportLabel(support.type)}>
      {picked ? <circle cx={screen.sx} cy={screen.sy + 24} r="18" className="pick-ring" /> : null}
      <path d={`M${screen.sx} ${screen.sy + 12} l-11 16 h22 z`} />
      {support.type === "rollerY" ? <circle cx={screen.sx} cy={screen.sy + 34} r="5" /> : <line x1={screen.sx - 16} y1={screen.sy + 34} x2={screen.sx + 16} y2={screen.sy + 34} />}
    </g>
  );
}

function LoadMark({ node, newton, ghost, stone }: { node: Node; newton: number; ghost: boolean; stone: boolean }) {
  const screen = toScreen(node.x, node.y);
  const height = 26 + Math.min(36, newton / 5);
  return (
    <g className={ghost ? "load ghost" : "load"}>
      {stone ? <ellipse cx={screen.sx} cy={screen.sy - 24} rx="14" ry="10" className="falling-stone" /> : null}
      <line x1={screen.sx} y1={screen.sy - 16 - height} x2={screen.sx} y2={screen.sy - 18} />
      <path d={`M${screen.sx} ${screen.sy - 12} l-6 -10 h12 z`} />
      <text x={screen.sx + 8} y={screen.sy - 24 - height}>
        {newton.toFixed(0)}N
      </text>
    </g>
  );
}

function WeightMark({
  weight,
  node,
  stack,
  picked,
}: {
  weight: BoardWeight;
  node: Node;
  stack: number;
  picked: boolean;
}) {
  const screen = toScreen(node.x, node.y);
  const y = screen.sy - 30 - stack * 18;
  return (
    <g className="weight" transform={`translate(${screen.sx - 16} ${y})`}>
      <rect width="32" height="16" rx="4" className={picked ? "picked" : undefined} />
      <text x="16" y="12">
        {weight.newton}N
      </text>
      <title>
        {weight.name} 지우기
      </title>
    </g>
  );
}

function Car({ x, y }: { x: number; y: number }) {
  const screen = toScreen(x, y);
  return (
    <g className="car" transform={`translate(${screen.sx} ${screen.sy - 22})`}>
      <rect x="-18" y="-14" width="36" height="14" rx="3" />
      <path d="M-8 -14 l4 -8 h12 l4 8" />
      <circle cx="-10" cy="2" r="4" />
      <circle cx="10" cy="2" r="4" />
    </g>
  );
}
