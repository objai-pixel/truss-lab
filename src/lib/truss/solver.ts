import { isSpaceModel, reactionAxes, reactionCount, unitToward } from "./geometry";
import { solveLinear } from "./linalg";
import { materialOf } from "./materials";
import { completeAnalysis } from "./result";
import { analyzeSpace } from "./space";
import type { Analysis, Load, Reaction, TrussModel } from "./types";

function empty(status: Analysis["status"], message: string, classification: Analysis["classification"]): Analysis {
  return {
    status,
    message,
    classification,
    method: "none",
    forces: [],
    reactions: [],
    failures: [],
    counts: { j: 0, m: 0, r: 0 },
    loadOnSupportsOnly: false,
    space: false,
  };
}

function validate(model: TrussModel): string | null {
  if (model.nodes.length < 2) return "절점이 2개 이상 있어야 트러스가 됩니다.";
  const ids = new Set<number>();
  for (const node of model.nodes) {
    if (ids.has(node.id)) return "절점 번호가 겹칩니다.";
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return "절점 좌표가 올바르지 않습니다.";
    ids.add(node.id);
  }
  const seen = new Set<string>();
  for (const member of model.members) {
    if (member.i === member.j) return "한 절점을 자기 자신과 이을 수는 없습니다.";
    if (!ids.has(member.i) || !ids.has(member.j)) return "부재가 없는 절점을 가리킵니다.";
    const a = model.nodes.find((node) => node.id === member.i)!;
    const b = model.nodes.find((node) => node.id === member.j)!;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) return "길이가 0인 부재가 있습니다.";
    const key = [member.i, member.j].sort((p, q) => p - q).join("-");
    if (seen.has(key)) return "같은 두 절점을 잇는 부재가 겹칩니다.";
    seen.add(key);
    try {
      if (!Number.isFinite(materialOf(member.materialId).E)) return "재료를 알 수 없습니다.";
    } catch {
      return "재료를 알 수 없습니다.";
    }
  }
  for (const support of model.supports) {
    if (!ids.has(support.nodeId)) return "지점이 없는 절점을 가리킵니다.";
  }
  for (const load of model.loads) {
    if (!ids.has(load.nodeId)) return "하중이 없는 절점을 가리킵니다.";
  }
  const supportNodes = new Set(model.supports.map((support) => support.nodeId));
  if (supportNodes.size !== model.supports.length) return "한 절점에 지점은 하나만 둘 수 있습니다.";
  return null;
}

type Solved = {
  axials: number[];
  reactions: Reaction[];
  method: "joints" | "stiffness";
  classification: "determinate" | "indeterminate";
};

function nodeIndex(model: TrussModel): Map<number, number> {
  return new Map(model.nodes.map((node, index) => [node.id, index]));
}

function applied(model: TrussModel, index: Map<number, number>, size: number): number[] {
  const force = Array(size).fill(0) as number[];
  for (const load of model.loads) {
    const at = index.get(load.nodeId);
    if (at === undefined) continue;
    force[at * 2] += load.fx;
    force[at * 2 + 1] += load.fy;
  }
  return force;
}

/** 절점 평형식을 한 번에 연립한다. 정정이고 안정일 때만 해가 있다. */
function solveJoints(model: TrussModel): Solved | null {
  const index = nodeIndex(model);
  const equations = model.nodes.length * 2;
  const reactionsSpec: { nodeId: number; axis: 0 | 1 }[] = [];
  for (const support of model.supports) {
    for (const axis of reactionAxes(support.type)) {
      reactionsSpec.push({ nodeId: support.nodeId, axis });
    }
  }
  const unknown = model.members.length + reactionsSpec.length;
  if (unknown !== equations) return null;

  const matrix = Array.from({ length: equations }, () => Array(unknown).fill(0));
  const rhs = applied(model, index, equations).map((value) => -value);

  model.members.forEach((member, memberIndex) => {
    const i = index.get(member.i)!;
    const j = index.get(member.j)!;
    const ni = model.nodes[i];
    const nj = model.nodes[j];
    const dir = unitToward(ni, nj);
    if (!dir) return;
    matrix[i * 2][memberIndex] += dir.cx;
    matrix[i * 2 + 1][memberIndex] += dir.cy;
    matrix[j * 2][memberIndex] -= dir.cx;
    matrix[j * 2 + 1][memberIndex] -= dir.cy;
  });

  reactionsSpec.forEach((reaction, reactionIndex) => {
    const at = index.get(reaction.nodeId)!;
    matrix[at * 2 + reaction.axis][model.members.length + reactionIndex] = 1;
  });

  const solution = solveLinear(matrix, rhs);
  if (!solution) return null;

  const byNode = new Map<number, Reaction>();
  for (const node of model.nodes) byNode.set(node.id, { nodeId: node.id, rx: 0, ry: 0 });
  reactionsSpec.forEach((reaction, reactionIndex) => {
    const target = byNode.get(reaction.nodeId)!;
    const value = solution[model.members.length + reactionIndex];
    if (reaction.axis === 0) target.rx = value;
    else target.ry = value;
  });

  return {
    axials: solution.slice(0, model.members.length),
    reactions: model.supports.map((support) => byNode.get(support.nodeId)!),
    method: "joints",
    classification: "determinate",
  };
}

/** 부정정 트러스. 부재 강성 EA가 축력 분담을 바꾼다. */
function solveStiffness(model: TrussModel): Solved | null {
  const index = nodeIndex(model);
  const dof = model.nodes.length * 2;
  const stiffness = Array.from({ length: dof }, () => Array(dof).fill(0));
  const meta: { ea: number; length: number; cx: number; cy: number; i: number; j: number }[] = [];

  for (const member of model.members) {
    const i = index.get(member.i)!;
    const j = index.get(member.j)!;
    const dir = unitToward(model.nodes[i], model.nodes[j]);
    if (!dir) return null;
    const material = materialOf(member.materialId);
    const ea = material.E * material.A;
    const k = ea / dir.length;
    const c2 = dir.cx * dir.cx;
    const s2 = dir.cy * dir.cy;
    const cs = dir.cx * dir.cy;
    const local = [
      [c2, cs, -c2, -cs],
      [cs, s2, -cs, -s2],
      [-c2, -cs, c2, cs],
      [-cs, -s2, cs, s2],
    ];
    const map = [i * 2, i * 2 + 1, j * 2, j * 2 + 1];
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        stiffness[map[row]][map[col]] += k * local[row][col];
      }
    }
    meta.push({ ea, length: dir.length, cx: dir.cx, cy: dir.cy, i, j });
  }

  const fixed = Array(dof).fill(false);
  for (const support of model.supports) {
    const at = index.get(support.nodeId)!;
    for (const axis of reactionAxes(support.type)) fixed[at * 2 + axis] = true;
  }
  const free: number[] = [];
  for (let degree = 0; degree < dof; degree += 1) {
    if (!fixed[degree]) free.push(degree);
  }

  const displacement = Array(dof).fill(0);
  if (free.length > 0) {
    const reduced = free.map((row) => free.map((col) => stiffness[row][col]));
    const force = applied(model, index, dof);
    const rhs = free.map((row) => force[row]);
    const solved = solveLinear(reduced, rhs);
    if (!solved) return null;
    free.forEach((degree, at) => {
      displacement[degree] = solved[at];
    });
  }

  const internal = Array(dof).fill(0);
  for (let row = 0; row < dof; row += 1) {
    for (let col = 0; col < dof; col += 1) internal[row] += stiffness[row][col] * displacement[col];
  }
  const external = applied(model, index, dof);
  const reactionVector = internal.map((value, degree) => value - external[degree]);
  const reactions: Reaction[] = model.supports.map((support) => {
    const at = index.get(support.nodeId)!;
    return { nodeId: support.nodeId, rx: reactionVector[at * 2], ry: reactionVector[at * 2 + 1] };
  });

  const axials = meta.map((member) => {
    const stretch =
      (displacement[member.j * 2] - displacement[member.i * 2]) * member.cx +
      (displacement[member.j * 2 + 1] - displacement[member.i * 2 + 1]) * member.cy;
    return (member.ea / member.length) * stretch;
  });

  const equations = model.nodes.length * 2;
  const unknowns = model.members.length + reactionCount(model.supports);
  return {
    axials,
    reactions,
    method: "stiffness",
    classification: unknowns > equations ? "indeterminate" : "determinate",
  };
}

export function analyze(model: TrussModel): Analysis {
  if (isSpaceModel(model)) return analyzeSpace(model);
  const problem = validate(model);
  const counts = {
    j: model.nodes.length,
    m: model.members.length,
    r: reactionCount(model.supports),
  };
  if (problem) return { ...empty("invalid", problem, "invalid"), counts };
  if (model.supports.length === 0) {
    return {
      ...empty("unstable", "지점이 없습니다. 핀과 롤러로 트러스를 땅에 고정하세요.", "unstable"),
      counts,
    };
  }
  if (model.members.length === 0) {
    return {
      ...empty("unstable", "부재가 없습니다. 절점을 이어 삼각형을 만드세요.", "unstable"),
      counts,
    };
  }

  const equations = counts.j * 2;
  const unknowns = counts.m + counts.r;
  if (unknowns < equations) {
    return {
      ...empty(
        "unstable",
        `부재나 지점이 부족합니다. 지금 m+r=${unknowns}, 2j=${equations} 이라 기구가 되어 하중을 견디지 못합니다.`,
        "unstable",
      ),
      counts,
    };
  }

  const hasHorizontal = model.supports.some((support) => support.type === "pin" || support.type === "rollerX");
  const hasVertical = model.supports.some((support) => support.type === "pin" || support.type === "rollerY");
  if (!hasHorizontal || !hasVertical) {
    return {
      ...empty(
        "unstable",
        !hasHorizontal
          ? "수평을 막는 지점이 없어 트러스 전체가 옆으로 미끄러집니다. 핀 지점을 하나 두세요."
          : "수직을 막는 지점이 없습니다.",
        "unstable",
      ),
      counts,
    };
  }

  if (unknowns === equations) {
    const joints = solveJoints(model);
    if (!joints) {
      return {
        ...empty(
          "unstable",
          "식의 개수는 맞지만 기하학적으로 불안정합니다. 절점이 한 직선 위에만 있거나, 삼각형이 아닌 사각형으로 연결되어 있습니다.",
          "unstable",
        ),
        counts,
      };
    }
    return completeAnalysis(model, "determinate", "joints", joints.axials, joints.reactions, counts);
  }

  const stiff = solveStiffness(model);
  if (!stiff) {
    return {
      ...empty(
        "unstable",
        "부재는 많아 보여도 특정 방향으로 구속되지 않아 불안정합니다. 지점과 삼각형 배치를 다시 보세요.",
        "unstable",
      ),
      counts,
    };
  }
  return completeAnalysis(model, stiff.classification, "stiffness", stiff.axials, stiff.reactions, counts);
}

/** 정정 트러스에서 절점법과 강성법이 같은 축력을 내는지 검산할 때 쓴다. */
export function axialByBothMethods(model: TrussModel): { joints: number[]; stiffness: number[] } | null {
  const joints = solveJoints(model);
  const stiff = solveStiffness(model);
  if (!joints || !stiff) return null;
  return { joints: joints.axials, stiffness: stiff.axials };
}

export function totalApplied(loads: Load[]): { fx: number; fy: number } {
  return loads.reduce(
    (sum, load) => ({ fx: sum.fx + load.fx, fy: sum.fy + load.fy }),
    { fx: 0, fy: 0 },
  );
}
