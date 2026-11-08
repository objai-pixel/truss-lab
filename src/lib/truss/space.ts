import { isSpaceModel, reactionAxes3, reactionCount, unit3 } from "./geometry";
import { solveLinear } from "./linalg";
import { materialOf } from "./materials";
import { completeAnalysis } from "./result";
import type { Analysis, Reaction, TrussModel } from "./types";

function empty(status: Analysis["status"], message: string, classification: Analysis["classification"], counts: Analysis["counts"]): Analysis {
  return {
    status,
    message,
    classification,
    method: "none",
    forces: [],
    reactions: [],
    failures: [],
    counts,
    loadOnSupportsOnly: false,
    space: true,
  };
}

function validate(model: TrussModel): string | null {
  if (model.nodes.length < 2) return "절점이 2개 이상 있어야 트러스가 됩니다.";
  const ids = new Set<number>();
  for (const node of model.nodes) {
    if (ids.has(node.id)) return "절점 번호가 겹칩니다.";
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y) || !Number.isFinite(node.z ?? 0)) return "절점 좌표가 올바르지 않습니다.";
    ids.add(node.id);
  }
  const seen = new Set<string>();
  for (const member of model.members) {
    if (member.i === member.j) return "한 절점을 자기 자신과 이을 수는 없습니다.";
    if (!ids.has(member.i) || !ids.has(member.j)) return "부재가 없는 절점을 가리킵니다.";
    const a = model.nodes.find((node) => node.id === member.i)!;
    const b = model.nodes.find((node) => node.id === member.j)!;
    if (!unit3(a, b)) return "길이가 0인 부재가 있습니다.";
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
    force[at * 3] += load.fx;
    force[at * 3 + 1] += load.fy;
    force[at * 3 + 2] += load.fz ?? 0;
  }
  return force;
}

function solveJoints(model: TrussModel): Solved | null {
  const index = nodeIndex(model);
  const equations = model.nodes.length * 3;
  const reactionsSpec: { nodeId: number; axis: 0 | 1 | 2 }[] = [];
  for (const support of model.supports) {
    for (const axis of reactionAxes3(support.type)) reactionsSpec.push({ nodeId: support.nodeId, axis });
  }
  const unknown = model.members.length + reactionsSpec.length;
  if (unknown !== equations) return null;

  const matrix = Array.from({ length: equations }, () => Array(unknown).fill(0));
  const rhs = applied(model, index, equations).map((value) => -value);

  model.members.forEach((member, memberIndex) => {
    const i = index.get(member.i)!;
    const j = index.get(member.j)!;
    const dir = unit3(model.nodes[i], model.nodes[j]);
    if (!dir) return;
    matrix[i * 3][memberIndex] += dir.cx;
    matrix[i * 3 + 1][memberIndex] += dir.cy;
    matrix[i * 3 + 2][memberIndex] += dir.cz;
    matrix[j * 3][memberIndex] -= dir.cx;
    matrix[j * 3 + 1][memberIndex] -= dir.cy;
    matrix[j * 3 + 2][memberIndex] -= dir.cz;
  });

  reactionsSpec.forEach((reaction, reactionIndex) => {
    const at = index.get(reaction.nodeId)!;
    matrix[at * 3 + reaction.axis][model.members.length + reactionIndex] = 1;
  });

  const solution = solveLinear(matrix, rhs);
  if (!solution) return null;

  const byNode = new Map<number, Reaction>();
  for (const node of model.nodes) byNode.set(node.id, { nodeId: node.id, rx: 0, ry: 0, rz: 0 });
  reactionsSpec.forEach((reaction, reactionIndex) => {
    const target = byNode.get(reaction.nodeId)!;
    const value = solution[model.members.length + reactionIndex];
    if (reaction.axis === 0) target.rx = value;
    else if (reaction.axis === 1) target.ry = value;
    else target.rz = value;
  });

  return {
    axials: solution.slice(0, model.members.length),
    reactions: model.supports.map((support) => byNode.get(support.nodeId)!),
    method: "joints",
    classification: "determinate",
  };
}

function solveStiffness(model: TrussModel): Solved | null {
  const index = nodeIndex(model);
  const dof = model.nodes.length * 3;
  const stiffness = Array.from({ length: dof }, () => Array(dof).fill(0));
  const meta: { ea: number; length: number; cx: number; cy: number; cz: number; i: number; j: number }[] = [];

  for (const member of model.members) {
    const i = index.get(member.i)!;
    const j = index.get(member.j)!;
    const dir = unit3(model.nodes[i], model.nodes[j]);
    if (!dir) return null;
    const material = materialOf(member.materialId);
    const ea = material.E * material.A;
    const k = ea / dir.length;
    const c = [dir.cx, dir.cy, dir.cz, -dir.cx, -dir.cy, -dir.cz];
    const map = [i * 3, i * 3 + 1, i * 3 + 2, j * 3, j * 3 + 1, j * 3 + 2];
    for (let row = 0; row < 6; row += 1) {
      for (let col = 0; col < 6; col += 1) stiffness[map[row]][map[col]] += k * c[row] * c[col];
    }
    meta.push({ ea, length: dir.length, cx: dir.cx, cy: dir.cy, cz: dir.cz, i, j });
  }

  const fixed = Array(dof).fill(false);
  for (const support of model.supports) {
    const at = index.get(support.nodeId)!;
    for (const axis of reactionAxes3(support.type)) fixed[at * 3 + axis] = true;
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
    return {
      nodeId: support.nodeId,
      rx: reactionVector[at * 3],
      ry: reactionVector[at * 3 + 1],
      rz: reactionVector[at * 3 + 2],
    };
  });

  const axials = meta.map((member) => {
    const stretch =
      (displacement[member.j * 3] - displacement[member.i * 3]) * member.cx +
      (displacement[member.j * 3 + 1] - displacement[member.i * 3 + 1]) * member.cy +
      (displacement[member.j * 3 + 2] - displacement[member.i * 3 + 2]) * member.cz;
    return (member.ea / member.length) * stretch;
  });

  const equations = model.nodes.length * 3;
  const unknowns = model.members.length + reactionCount(model.supports, true);
  return {
    axials,
    reactions,
    method: "stiffness",
    classification: unknowns > equations ? "indeterminate" : "determinate",
  };
}

export function analyzeSpace(model: TrussModel): Analysis {
  const counts = {
    j: model.nodes.length,
    m: model.members.length,
    r: reactionCount(model.supports, true),
  };
  const problem = validate(model);
  if (problem) return empty("invalid", problem, "invalid", counts);
  if (!isSpaceModel(model)) {
    return empty("invalid", "공간 트러스 좌표가 없습니다.", "invalid", counts);
  }
  if (model.supports.length === 0) {
    return empty("unstable", "지점이 없습니다. 볼 지점으로 트러스를 땅에 고정하세요.", "unstable", counts);
  }
  if (model.members.length === 0) {
    return empty("unstable", "부재가 없습니다. 절점을 이어 삼각형을 만드세요.", "unstable", counts);
  }

  const equations = counts.j * 3;
  const unknowns = counts.m + counts.r;
  if (unknowns < equations) {
    return empty(
      "unstable",
      `부재나 지점이 부족합니다. 지금 m+r=${unknowns}, 3j=${equations} 이라 기구가 되어 하중을 견디지 못합니다.`,
      "unstable",
      counts,
    );
  }

  const axes = new Set(model.supports.flatMap((support) => reactionAxes3(support.type)));
  if (!axes.has(0) || !axes.has(1) || !axes.has(2)) {
    const message = !axes.has(0)
      ? "X 방향을 막는 지점이 없습니다. 볼 지점을 하나 두세요."
      : !axes.has(1)
        ? "수직(Y)을 막는 지점이 없습니다."
        : "깊이(Z)를 막는 지점이 없습니다. 볼 지점이나 홈 지점을 두세요.";
    return empty("unstable", message, "unstable", counts);
  }

  if (unknowns === equations) {
    const joints = solveJoints(model);
    if (!joints) {
      return empty(
        "unstable",
        "식의 개수는 맞지만 기하학적으로 불안정합니다. 절점이 한 직선이나 한 평면에만 있으면 그 평면 밖 하중을 견디지 못합니다.",
        "unstable",
        counts,
      );
    }
    return completeAnalysis(model, "determinate", "joints", joints.axials, joints.reactions, counts);
  }

  const stiff = solveStiffness(model);
  if (!stiff) {
    return empty(
      "unstable",
      "부재는 많아 보여도 특정 방향으로 구속되지 않아 불안정합니다. 지점과 삼각형 배치를 다시 보세요.",
      "unstable",
      counts,
    );
  }
  return completeAnalysis(model, stiff.classification, "stiffness", stiff.axials, stiff.reactions, counts);
}

/** 정정 공간 트러스에서 절점법과 강성법의 축력을 비교할 때 쓴다. */
export function spaceAxialByBothMethods(model: TrussModel): { joints: number[]; stiffness: number[] } | null {
  const joints = solveJoints(model);
  const stiff = solveStiffness(model);
  if (!joints || !stiff) return null;
  return { joints: joints.axials, stiffness: stiff.axials };
}

export function sumEquilibrium(model: TrussModel, reactions: Reaction[]): { fx: number; fy: number; fz: number } {
  let fx = 0;
  let fy = 0;
  let fz = 0;
  for (const load of model.loads) {
    fx += load.fx;
    fy += load.fy;
    fz += load.fz ?? 0;
  }
  for (const reaction of reactions) {
    fx += reaction.rx;
    fy += reaction.ry;
    fz += reaction.rz ?? 0;
  }
  return { fx, fy, fz };
}
