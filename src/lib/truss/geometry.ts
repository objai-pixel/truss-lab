import type { Load, Node, Support, SupportType } from "./types";

export function distance(a: Node, b: Node): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** from 절점에서 to 절점을 향하는 단위벡터. 인장력은 이 방향으로 절점을 당긴다. */
export function unitToward(from: Node, to: Node): { cx: number; cy: number; length: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return null;
  return { cx: dx / length, cy: dy / length, length };
}

/** 절점에 z가 있거나 볼·홈 지점이 있으면 공간 트러스다. z를 생략한 평면 모델은 2자유도로 남는다. */
export function isSpaceModel(model: { nodes: Node[]; loads: Load[]; supports: Support[] }): boolean {
  if (model.supports.some((support) => support.type === "ball" || support.type === "slot")) return true;
  if (model.nodes.some((node) => typeof node.z === "number")) return true;
  return model.loads.some((load) => typeof load.fz === "number" && Math.abs(load.fz) > 1e-9);
}

export function unit3(from: Node, to: Node): { cx: number; cy: number; cz: number; length: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = (to.z ?? 0) - (from.z ?? 0);
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-9) return null;
  return { cx: dx / length, cy: dy / length, cz: dz / length, length };
}

export function reactionCount(supports: Support[], space = false): number {
  return supports.reduce((sum, support) => sum + (space ? reactionAxes3(support.type).length : reactionAxes(support.type).length), 0);
}

export function reactionAxes(type: SupportType): Array<0 | 1> {
  if (type === "pin" || type === "ball") return [0, 1];
  if (type === "rollerY" || type === "slot") return [1];
  return [0];
}

/** 0은 x, 1은 y, 2는 z. */
export function reactionAxes3(type: SupportType): Array<0 | 1 | 2> {
  if (type === "ball" || type === "pin") return [0, 1, 2];
  if (type === "slot") return [1, 2];
  if (type === "rollerY") return [1];
  return [0];
}

export function supportLabel(type: SupportType): string {
  if (type === "pin") return "핀 지점";
  if (type === "ball") return "볼 지점";
  if (type === "slot") return "홈 지점";
  if (type === "rollerY") return "롤러 지점 (수직)";
  return "롤러 지점 (수평)";
}

export function mergeLoads(loads: Load[]): Load[] {
  const map = new Map<number, Load>();
  for (const load of loads) {
    const current = map.get(load.nodeId) ?? { nodeId: load.nodeId, fx: 0, fy: 0 };
    current.fx += load.fx;
    current.fy += load.fy;
    if (load.fz) current.fz = (current.fz ?? 0) + load.fz;
    map.set(load.nodeId, current);
  }
  return [...map.values()].filter((load) => Math.hypot(load.fx, load.fy, load.fz ?? 0) > 1e-8);
}

export type RoadSample = {
  t: number;
  x: number;
  y: number;
  distance: number;
  total: number;
  loads: Load[];
};

export function roadGeometry(nodes: Node[], roadIds: number[]): {
  points: Node[];
  total: number;
  segments: number[];
} | null {
  const points: Node[] = [];
  for (const id of roadIds) {
    const node = nodes.find((item) => item.id === id);
    if (!node) return null;
    points.push(node);
  }
  if (points.length < 2) return null;
  const segments: number[] = [];
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = distance(points[index], points[index + 1]);
    if (length < 1e-9) return null;
    segments.push(length);
    total += length;
  }
  return { points, total, segments };
}

/** t=0은 경로의 시작 절점, t=1은 끝 절점. 하중은 그 구간 양 끝 절점에만 나눈다. */
export function sampleRoad(
  nodes: Node[],
  roadIds: number[],
  weight: number,
  t: number,
  extra: Load[] = [],
): RoadSample | null {
  const road = roadGeometry(nodes, roadIds);
  if (!road) return null;
  const clamped = Math.min(1, Math.max(0, t));
  const target = road.total * clamped;
  let covered = 0;
  let segment = 0;
  for (let index = 0; index < road.segments.length; index += 1) {
    segment = index;
    if (covered + road.segments[index] >= target - 1e-9 || index === road.segments.length - 1) {
      break;
    }
    covered += road.segments[index];
  }
  const length = road.segments[segment];
  const local = length === 0 ? 0 : Math.min(1, Math.max(0, (target - covered) / length));
  const left = road.points[segment];
  const right = road.points[segment + 1];
  const x = left.x + (right.x - left.x) * local;
  const y = left.y + (right.y - left.y) * local;
  const loads = mergeLoads([
    ...extra,
    { nodeId: left.id, fx: 0, fy: -weight * (1 - local) },
    { nodeId: right.id, fx: 0, fy: -weight * local },
  ]);
  return { t: clamped, x, y, distance: target, total: road.total, loads };
}
