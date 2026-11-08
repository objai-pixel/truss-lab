"use client";

import { useRef, useState } from "react";
import { MATERIAL_MAP } from "@/lib/truss/materials";
import type { Analysis, Load, Member, Node, Support } from "@/lib/truss/types";
import type { BoardPick, BoardSelection, BoardWeight } from "./board";
import { BOARD_H, BOARD_W, pointSegmentDistance } from "./grid";

const SCALE = 42;
const ORIGIN_X = BOARD_W / 2;
const ORIGIN_Y = BOARD_H * 0.62;
const GRID_X0 = -2;
const GRID_X1 = 10;
const GRID_Z0 = -4;
const GRID_Z1 = 4;

type Camera = { yaw: number; pitch: number };
type ScreenPoint = { sx: number; sy: number; depth: number };

function project(x: number, y: number, z: number, camera: Camera): ScreenPoint {
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  const x1 = x * cosYaw - z * sinYaw;
  const z1 = x * sinYaw + z * cosYaw;
  const cosPitch = Math.cos(camera.pitch);
  const sinPitch = Math.sin(camera.pitch);
  const y2 = y * cosPitch - z1 * sinPitch;
  const depth = y * sinPitch + z1 * cosPitch;
  return { sx: ORIGIN_X + x1 * SCALE, sy: ORIGIN_Y - y2 * SCALE, depth };
}

function groundAt(sx: number, sy: number, camera: Camera): { x: number; z: number } | null {
  const x1 = (sx - ORIGIN_X) / SCALE;
  const y2 = (ORIGIN_Y - sy) / SCALE;
  const sinPitch = Math.sin(camera.pitch);
  if (Math.abs(sinPitch) < 0.12) return null;
  const z1 = -y2 / sinPitch;
  const cosYaw = Math.cos(camera.yaw);
  const sinYaw = Math.sin(camera.yaw);
  return { x: x1 * cosYaw + z1 * sinYaw, z: -x1 * sinYaw + z1 * cosYaw };
}

function snapGround(point: { x: number; z: number } | null): { x: number; z: number } | null {
  if (!point) return null;
  const x = Math.round(point.x);
  const z = Math.round(point.z);
  if (x < GRID_X0 || x > GRID_X1 || z < GRID_Z0 || z > GRID_Z1) return null;
  if (Math.hypot(x - point.x, z - point.z) > 0.38) return null;
  return { x, z };
}

function nodeZ(node: Node): number {
  return node.z ?? 0;
}

type Props = {
  nodes: Node[];
  members: Member[];
  supports: Support[];
  loads: Load[];
  analysis: Analysis | null;
  weights?: BoardWeight[];
  pendingNodeId?: number | null;
  hoverMemberId?: number | null;
  selected?: BoardSelection | null;
  focusNodeId?: number | null;
  focusMemberIds?: number[];
  onPick?: (pick: BoardPick) => void;
  onHoverMember?: (memberId: number | null, point: { x: number; y: number } | null) => void;
};

export function SpaceBoard(props: Props) {
  const [camera, setCamera] = useState<Camera>({ yaw: -0.7, pitch: 0.62 });
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;

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
    const cam = cameraRef.current;
    const empty: BoardPick = { nodeId: null, memberId: null, supportNodeId: null, weightId: null, grid: null, ground: null };
    const weights = props.weights ?? [];
    for (const weight of weights) {
      const node = props.nodes.find((item) => item.id === weight.nodeId);
      if (!node) continue;
      const stack = weights.filter((item) => item.nodeId === weight.nodeId).findIndex((item) => item.id === weight.id);
      const screen = project(node.x, node.y + 0.45 + Math.max(0, stack) * 0.28, nodeZ(node), cam);
      if (Math.hypot(local.x - screen.sx, local.y - screen.sy) < 16) return { ...empty, weightId: weight.id };
    }
    for (const support of props.supports) {
      const node = props.nodes.find((item) => item.id === support.nodeId);
      if (!node) continue;
      const screen = project(node.x, node.y, nodeZ(node), cam);
      if (Math.hypot(local.x - screen.sx, local.y - (screen.sy + 18)) < 14) return { ...empty, supportNodeId: support.nodeId };
    }
    let nodeId: number | null = null;
    let best = 16;
    for (const node of props.nodes) {
      const screen = project(node.x, node.y, nodeZ(node), cam);
      const distance = Math.hypot(local.x - screen.sx, local.y - screen.sy);
      if (distance < best) {
        best = distance;
        nodeId = node.id;
      }
    }
    if (nodeId !== null) return { ...empty, nodeId };
    let memberId: number | null = null;
    let memberDistance = 12;
    for (const member of props.members) {
      const a = props.nodes.find((node) => node.id === member.i);
      const b = props.nodes.find((node) => node.id === member.j);
      if (!a || !b) continue;
      const p = project(a.x, a.y, nodeZ(a), cam);
      const q = project(b.x, b.y, nodeZ(b), cam);
      const distance = pointSegmentDistance(local.x, local.y, p.sx, p.sy, q.sx, q.sy);
      if (distance < memberDistance) {
        memberDistance = distance;
        memberId = member.id;
      }
    }
    if (memberId !== null) return { ...empty, memberId };
    return { ...empty, ground: snapGround(groundAt(local.x, local.y, cam)) };
  }

  const failed = new Set(props.analysis?.failures.map((failure) => failure.memberId) ?? []);
  const loose = props.analysis?.status === "unstable";
  const showForces = props.analysis && props.analysis.status !== "invalid" && props.analysis.status !== "unstable";
  const drawnMembers = props.members
    .map((member) => {
      const a = props.nodes.find((node) => node.id === member.i);
      const b = props.nodes.find((node) => node.id === member.j);
      if (!a || !b) return null;
      const p = project(a.x, a.y, nodeZ(a), camera);
      const q = project(b.x, b.y, nodeZ(b), camera);
      return { member, p, q, depth: (p.depth + q.depth) / 2 };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.depth - a.depth);

  const loadByNode = new Map<number, number>();
  for (const load of props.loads) loadByNode.set(load.nodeId, (loadByNode.get(load.nodeId) ?? 0) + Math.max(0, -load.fy));

  return (
    <svg
      className={`board-svg space-board${loose ? " is-loose" : ""}${failed.size ? " is-broken" : ""}`}
      viewBox={`0 0 ${BOARD_W} ${BOARD_H}`}
      role="img"
      aria-label="공간 트러스 작업판. 빈 곳을 끌면 시점이 회전합니다."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, y: event.clientY, yaw: camera.yaw, pitch: camera.pitch, moved: false };
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (active) {
          const dx = event.clientX - active.x;
          const dy = event.clientY - active.y;
          if (Math.hypot(dx, dy) > 4) active.moved = true;
          if (active.moved) {
            setCamera({
              yaw: active.yaw + dx * 0.008,
              pitch: Math.max(0.25, Math.min(1.2, active.pitch + dy * 0.006)),
            });
            return;
          }
        }
        const local = localPoint(event);
        if (!local) return;
        props.onHoverMember?.(identify(local).memberId, { x: event.clientX, y: event.clientY });
      }}
      onPointerUp={(event) => {
        const active = drag.current;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (!active || active.moved) return;
        const local = localPoint(event);
        if (!local) return;
        props.onPick?.(identify(local));
      }}
      onPointerLeave={() => props.onHoverMember?.(null, null)}
    >
      <defs>
        <linearGradient id="space-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d5ebf8" />
          <stop offset="55%" stopColor="#f4efe4" />
          <stop offset="100%" stopColor="#e7f0df" />
        </linearGradient>
      </defs>
      <rect width={BOARD_W} height={BOARD_H} rx="18" fill="url(#space-sky)" />
      {Array.from({ length: GRID_X1 - GRID_X0 + 1 }, (_, index) => {
        const x = GRID_X0 + index;
        const a = project(x, 0, GRID_Z0, camera);
        const b = project(x, 0, GRID_Z1, camera);
        return <line key={`x${x}`} className="grid-line" x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} />;
      })}
      {Array.from({ length: GRID_Z1 - GRID_Z0 + 1 }, (_, index) => {
        const z = GRID_Z0 + index;
        const a = project(GRID_X0, 0, z, camera);
        const b = project(GRID_X1, 0, z, camera);
        return <line key={`z${z}`} className="grid-line" x1={a.sx} y1={a.sy} x2={b.sx} y2={b.sy} />;
      })}
      <AxisLegend camera={camera} />
      {drawnMembers.map(({ member, p, q }) => {
        const material = MATERIAL_MAP[member.materialId];
        const force = props.analysis?.forces.find((item) => item.memberId === member.id);
        let color = material?.color ?? "#2b241c";
        if (showForces && force) {
          if (force.mode === "tension") color = "#1d4e89";
          if (force.mode === "compression") color = "#9d341f";
          if (force.mode === "zero") color = "#8d8376";
          if (failed.has(member.id)) color = "#4a1010";
        }
        const focused = props.focusMemberIds?.includes(member.id) ?? false;
        const hot = props.hoverMemberId === member.id;
        const picked = props.selected?.kind === "member" && props.selected.id === member.id;
        return (
          <g key={member.id} className="member">
            {focused ? <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} className="focus-member" /> : null}
            {picked ? <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} className="pick-member" /> : null}
            <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} stroke="#1a120c" strokeWidth={hot ? 12 : 9} strokeLinecap="round" opacity="0.18" />
            <line x1={p.sx} y1={p.sy} x2={q.sx} y2={q.sy} stroke={color} strokeWidth={hot ? 7 : 5} strokeLinecap="round" />
            <text x={(p.sx + q.sx) / 2} y={(p.sy + q.sy) / 2 - 8} className="member-tag">
              {member.id}
            </text>
          </g>
        );
      })}
      {props.supports.map((support) => {
        const node = props.nodes.find((item) => item.id === support.nodeId);
        if (!node) return null;
        const screen = project(node.x, node.y, nodeZ(node), camera);
        const picked = props.selected?.kind === "support" && props.selected.id === support.nodeId;
        return (
          <g key={`${support.nodeId}-${support.type}`} className="support">
            {picked ? <circle cx={screen.sx} cy={screen.sy + 18} r="14" className="pick-ring" /> : null}
            {support.type === "ball" ? (
              <circle cx={screen.sx} cy={screen.sy + 16} r="6" />
            ) : support.type === "slot" ? (
              <>
                <line x1={screen.sx - 10} y1={screen.sy + 14} x2={screen.sx + 10} y2={screen.sy + 14} />
                <line x1={screen.sx - 10} y1={screen.sy + 20} x2={screen.sx + 10} y2={screen.sy + 20} />
              </>
            ) : (
              <circle cx={screen.sx} cy={screen.sy + 18} r="5" fill="none" />
            )}
          </g>
        );
      })}
      {[...loadByNode.entries()].map(([nodeId, newton]) => {
        const node = props.nodes.find((item) => item.id === nodeId);
        if (!node || newton < 0.5) return null;
        const from = project(node.x, node.y + 1.15, nodeZ(node), camera);
        const to = project(node.x, node.y + 0.15, nodeZ(node), camera);
        return (
          <g key={`load-${nodeId}`} className="load">
            <Arrow from={from} to={to} />
            <text x={from.sx + 8} y={from.sy}>
              {newton.toFixed(0)}N
            </text>
          </g>
        );
      })}
      {showForces
        ? props.analysis?.reactions.map((reaction) => {
            const node = props.nodes.find((item) => item.id === reaction.nodeId);
            if (!node) return null;
            const magnitude = Math.hypot(reaction.rx, reaction.ry, reaction.rz ?? 0);
            if (magnitude < 0.5) return null;
            const scale = 0.9 / magnitude;
            const from = project(node.x, node.y, nodeZ(node), camera);
            const to = project(node.x + reaction.rx * scale, node.y + reaction.ry * scale, nodeZ(node) + (reaction.rz ?? 0) * scale, camera);
            return (
              <g key={`reaction-${reaction.nodeId}`} className="reaction">
                <Arrow from={from} to={to} />
              </g>
            );
          })
        : null}
      {(props.weights ?? []).map((weight) => {
        const node = props.nodes.find((item) => item.id === weight.nodeId);
        if (!node) return null;
        const stack = (props.weights ?? []).filter((item) => item.nodeId === weight.nodeId).findIndex((item) => item.id === weight.id);
        const screen = project(node.x, node.y + 0.45 + Math.max(0, stack) * 0.28, nodeZ(node), camera);
        const picked = props.selected?.kind === "weight" && props.selected.id === weight.id;
        return (
          <g key={weight.id} className="weight" transform={`translate(${screen.sx - 16} ${screen.sy - 8})`}>
            <rect width="32" height="16" rx="4" className={picked ? "picked" : undefined} />
            <text x="16" y="12">
              {weight.newton}N
            </text>
          </g>
        );
      })}
      {props.nodes
        .map((node) => ({ node, screen: project(node.x, node.y, nodeZ(node), camera) }))
        .sort((a, b) => b.screen.depth - a.screen.depth)
        .map(({ node, screen }) => {
          const picked = props.selected?.kind === "node" && props.selected.id === node.id;
          const focused = props.focusNodeId === node.id;
          const pending = props.pendingNodeId === node.id;
          return (
            <g key={node.id} className="stone">
              {focused ? <circle cx={screen.sx} cy={screen.sy} r="16" className="focus-ring" /> : null}
              {picked || pending ? <circle cx={screen.sx} cy={screen.sy} r="14" className="pick-ring" /> : null}
              <circle cx={screen.sx} cy={screen.sy} r="8" fill="#f7f1e6" stroke="#1a120c" strokeWidth="1.5" />
              <text x={screen.sx + 10} y={screen.sy - 10} className="node-tag">
                {node.id}
              </text>
            </g>
          );
        })}
      <text x="24" y={BOARD_H - 18} className="node-tag">
        빈 곳을 끌면 회전합니다. x 경간 · y 높이 · z 깊이
      </text>
    </svg>
  );
}

function AxisLegend({ camera }: { camera: Camera }) {
  const origin = project(-1.2, 0, -3.2, camera);
  const x = project(-0.2, 0, -3.2, camera);
  const y = project(-1.2, 1, -3.2, camera);
  const z = project(-1.2, 0, -2.2, camera);
  return (
    <g className="axis-legend">
      <Arrow from={origin} to={x} />
      <Arrow from={origin} to={y} />
      <Arrow from={origin} to={z} />
      <text x={x.sx + 4} y={x.sy}>
        x
      </text>
      <text x={y.sx + 4} y={y.sy}>
        y
      </text>
      <text x={z.sx + 4} y={z.sy}>
        z
      </text>
    </g>
  );
}

function Arrow({ from, to }: { from: ScreenPoint; to: ScreenPoint }) {
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const head = 9;
  return (
    <g className="arrow">
      <line x1={from.sx} y1={from.sy} x2={to.sx} y2={to.sy} />
      <path d={`M${to.sx} ${to.sy} l${-ux * head - uy * 4} ${-uy * head + ux * 4} l${uy * 8} ${-ux * 8} z`} />
    </g>
  );
}
