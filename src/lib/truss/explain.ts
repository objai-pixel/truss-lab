import { isSpaceModel, supportLabel, unit3, unitToward } from "./geometry";
import { solve2, solveLinear } from "./linalg";
import { compressionCapacity, materialOf } from "./materials";
import type { Analysis, Member, Node, TrussModel } from "./types";

export type JointStep = {
  nodeId: number;
  intro: string;
  known: string[];
  equations: string[];
  results: string[];
  unknownIds: number[];
};

export type Explanation = {
  title: string;
  summary: string;
  determinacy: string;
  reactions: string[];
  steps: JointStep[];
  leftover: string[];
  note: string;
};

export function formatForce(axial: number): string {
  if (Math.abs(axial) < 0.05) return "0 N (영부재)";
  const kind = axial > 0 ? "인장" : "압축";
  return `${Math.abs(axial).toFixed(1)} N (${kind})`;
}

function fmt(value: number): string {
  if (Math.abs(value) < 0.05) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function fmtCoeff(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  if (Math.abs(rounded) < 0.0005) return "0";
  return rounded.toFixed(3);
}

function signedTerm(coeff: number, name: string, first: boolean): string {
  const magnitude = fmtCoeff(Math.abs(coeff));
  if (first) return coeff < 0 ? `- ${magnitude} ${name}` : `${magnitude} ${name}`;
  return `${coeff < 0 ? "- " : "+ "}${magnitude} ${name}`;
}

export function explain(model: TrussModel, analysis: Analysis): Explanation {
  const space = isSpaceModel(model);
  const title = analysis.method === "joints" ? "절점법 풀이" : analysis.method === "stiffness" ? "강성법 검산" : "구조 판정";
  if (analysis.status === "invalid" || analysis.status === "unstable") {
    return {
      title,
      summary: analysis.message,
      determinacy: determinacyText(analysis, space),
      reactions: [],
      steps: [],
      leftover: [],
      note: space
        ? "공간 트러스는 부재가 한 평면에만 모이면 그 평면 밖 하중을 견디지 못합니다. 볼 지점으로 세 방향을 고정하세요."
        : "트러스는 부재가 삼각형을 이루고, 핀 하나와 수직 롤러 하나처럼 전체가 구속되어야 하중을 견딥니다.",
    };
  }

  const reactions = reactionLines(model, analysis, space);
  const note = space
    ? analysis.method === "joints"
      ? "인장(+)은 부재가 절점을 끌어당기는 힘이고, 압축(-)은 절점을 미는 힘입니다. 각 절점에서 ΣFx = 0, ΣFy = 0, ΣFz = 0 입니다."
      : "공간 트러스에서 m + r 이 3j보다 크면 부정정입니다. 절점 평형만으로는 축력이 하나로 정해지지 않아, 부재 강성 EA를 포함한 직접강성법으로 구했습니다. 행렬 전체 대신 정정 판정, 반력 평형, 부재 축력을 확인합니다."
    : analysis.method === "joints"
      ? "인장(+)은 부재가 절점을 끌어당기는 힘이고, 압축(-)은 절점을 미는 힘입니다. 각 절점에서 ΣFx = 0, ΣFy = 0 입니다."
      : "부정정 구조는 절점 평형식이 미지수보다 적습니다. 같은 모양이라도 케이블과 강관의 강성비에 따라 힘의 분담이 달라지므로, 변형 적합을 포함한 직접강성법으로 축력을 구했습니다. 정정으로 줄이면 아래 반력부터 절점법을 그대로 적용할 수 있습니다.";
  const walk = analysis.method === "joints" ? (space ? walkJoints3(model, analysis) : walkJoints(model, analysis)) : { steps: [], unsolved: [] as number[] };
  const limit = space ? 4 : 3;

  return {
    title,
    summary: analysis.message,
    determinacy: determinacyText(analysis, space),
    reactions,
    steps: walk.steps,
    leftover: walk.unsolved.map((id) => {
      const axial = analysis.forces.find((force) => force.memberId === id)?.axial ?? 0;
      return `부재 ${id}는 미지력이 ${limit}개 이상 남는 구간에 있어, 한 절점씩의 기본 순서로는 끝나지 않습니다. 연립한 결과는 ${formatForce(axial)} 입니다.`;
    }),
    note,
  };
}

function determinacyText(analysis: Analysis, space: boolean): string {
  const { j, m, r } = analysis.counts;
  const perNode = space ? 3 : 2;
  const name = space ? "공간" : "평면";
  const base = `절점 j = ${j}, 부재 m = ${m}, 반력 수 r = ${r}. ${name} 트러스의 정정 조건은 m + r = ${perNode}j 입니다.`;
  if (j === 0) return base;
  const target = perNode * j;
  if (m + r === target) {
    return `${base} ${m} + ${r} = ${m + r}, ${perNode}j = ${target} 이므로 정정입니다. 축력이 하나로 결정되고 절점법으로 풀 수 있습니다.`;
  }
  if (m + r > target) {
    return `${base} ${m} + ${r} = ${m + r} > ${perNode}j = ${target} 이므로 부정정 ${m + r - target}차입니다.`;
  }
  return `${base} ${m} + ${r} = ${m + r} < ${perNode}j = ${target} 이므로 부재나 지점이 부족해 불안정합니다.`;
}

function reactionLines(model: TrussModel, analysis: Analysis, space: boolean): string[] {
  const lines: string[] = [];
  const sumFx = model.loads.reduce((sum, load) => sum + load.fx, 0);
  const sumFy = model.loads.reduce((sum, load) => sum + load.fy, 0);
  const sumFz = model.loads.reduce((sum, load) => sum + (load.fz ?? 0), 0);
  let sumRx = 0;
  let sumRy = 0;
  let sumRz = 0;
  for (const reaction of analysis.reactions) {
    const support = model.supports.find((item) => item.nodeId === reaction.nodeId);
    const label = support ? supportLabel(support.type) : "지점";
    if (space) {
      lines.push(
        `절점 ${reaction.nodeId} ${label}: Rx = ${fmt(reaction.rx)} N, Ry = ${fmt(reaction.ry)} N, Rz = ${fmt(reaction.rz ?? 0)} N`,
      );
    } else {
      lines.push(`절점 ${reaction.nodeId} ${label}: Rx = ${fmt(reaction.rx)} N, Ry = ${fmt(reaction.ry)} N`);
    }
    sumRx += reaction.rx;
    sumRy += reaction.ry;
    sumRz += reaction.rz ?? 0;
  }
  lines.push(
    space
      ? `전체 평형 검산: ΣFx = ${fmt(sumFx + sumRx)} N, ΣFy = ${fmt(sumFy + sumRy)} N, ΣFz = ${fmt(sumFz + sumRz)} N.`
      : `전체 평형 검산: ΣFx = ${fmt(sumFx + sumRx)} N, ΣFy = ${fmt(sumFy + sumRy)} N.`,
  );

  const pin = model.supports.find((support) => support.type === "pin");
  if (!space && pin && analysis.reactions.length > 0) {
    const origin = model.nodes.find((node) => node.id === pin.nodeId);
    if (origin) {
      let moment = 0;
      for (const load of model.loads) {
        const node = model.nodes.find((item) => item.id === load.nodeId);
        if (!node) continue;
        moment += (node.x - origin.x) * load.fy - (node.y - origin.y) * load.fx;
      }
      for (const reaction of analysis.reactions) {
        const node = model.nodes.find((item) => item.id === reaction.nodeId);
        if (!node) continue;
        moment += (node.x - origin.x) * reaction.ry - (node.y - origin.y) * reaction.rx;
      }
      lines.push(`절점 ${pin.nodeId} 기준 모멘트 검산 ΣM = ${fmt(moment)} N·m.`);
    }
  }
  return lines;
}

function walkJoints(model: TrussModel, analysis: Analysis): { steps: JointStep[]; unsolved: number[] } {
  const force = new Map(analysis.forces.map((item) => [item.memberId, item.axial]));
  const membersAt = new Map<number, Member[]>();
  for (const node of model.nodes) membersAt.set(node.id, []);
  for (const member of model.members) {
    membersAt.get(member.i)?.push(member);
    membersAt.get(member.j)?.push(member);
  }
  const reaction = new Map(analysis.reactions.map((item) => [item.nodeId, item]));
  const load = new Map<number, { fx: number; fy: number }>();
  for (const node of model.nodes) load.set(node.id, { fx: 0, fy: 0 });
  for (const item of model.loads) {
    const current = load.get(item.nodeId);
    if (!current) continue;
    current.fx += item.fx;
    current.fy += item.fy;
  }

  const known = new Set<number>();
  const steps: JointStep[] = [];
  let guard = 0;
  while (known.size < model.members.length && guard < 40) {
    guard += 1;
    const candidates = model.nodes
      .map((node) => ({
        node,
        unknown: (membersAt.get(node.id) ?? []).filter((member) => !known.has(member.id)),
      }))
      .filter((item) => item.unknown.length > 0 && item.unknown.length <= 2)
      .sort((a, b) => a.unknown.length - b.unknown.length || a.node.id - b.node.id);

    let progressed = false;
    for (const candidate of candidates) {
      const step = solveJoint(candidate.node, candidate.unknown, membersAt.get(candidate.node.id) ?? [], known, force, reaction, load, model);
      if (!step) continue;
      steps.push(step);
      for (const member of candidate.unknown) known.add(member.id);
      progressed = true;
      break;
    }
    if (!progressed) break;
  }
  const unsolved = model.members.filter((member) => !known.has(member.id)).map((member) => member.id);
  return { steps, unsolved };
}

function solveJoint(
  node: Node,
  unknown: Member[],
  connected: Member[],
  known: Set<number>,
  force: Map<number, number>,
  reaction: Map<number, { rx: number; ry: number }>,
  load: Map<number, { fx: number; fy: number }>,
  model: TrussModel,
): JointStep | null {
  const nodes = new Map(model.nodes.map((item) => [item.id, item]));
  const knownMembers = connected.filter((member) => known.has(member.id));
  const support = reaction.get(node.id) ?? { rx: 0, ry: 0 };
  const applied = load.get(node.id) ?? { fx: 0, fy: 0 };
  let rhsX = -(support.rx + applied.fx);
  let rhsY = -(support.ry + applied.fy);
  const knownLines: string[] = [];
  if (Math.abs(support.rx) > 0.05 || Math.abs(support.ry) > 0.05) {
    knownLines.push(`반력 Rx = ${fmt(support.rx)} N, Ry = ${fmt(support.ry)} N`);
  }
  if (Math.abs(applied.fx) > 0.05 || Math.abs(applied.fy) > 0.05) {
    knownLines.push(`외력 Fx = ${fmt(applied.fx)} N, Fy = ${fmt(applied.fy)} N`);
  }

  for (const member of knownMembers) {
    const otherId = member.i === node.id ? member.j : member.i;
    const other = nodes.get(otherId);
    if (!other) return null;
    const dir = unitToward(node, other);
    if (!dir) return null;
    const axial = force.get(member.id) ?? 0;
    rhsX -= axial * dir.cx;
    rhsY -= axial * dir.cy;
    knownLines.push(`부재 ${member.id} = ${formatForce(axial)}`);
  }

  const coeffs = unknown.map((member) => {
    const otherId = member.i === node.id ? member.j : member.i;
    const other = nodes.get(otherId);
    if (!other) return null;
    const dir = unitToward(node, other);
    if (!dir) return null;
    return { member, cx: dir.cx, cy: dir.cy };
  });
  if (coeffs.some((item) => item === null)) return null;
  const rows = coeffs as { member: Member; cx: number; cy: number }[];

  let solved: number[] | null = null;
  if (unknown.length === 1) {
    const options = [
      { coeff: rows[0].cx, rhs: rhsX },
      { coeff: rows[0].cy, rhs: rhsY },
    ].sort((a, b) => Math.abs(b.coeff) - Math.abs(a.coeff));
    if (Math.abs(options[0].coeff) < 1e-8) return null;
    const value = options[0].rhs / options[0].coeff;
    const other = options[1];
    if (Math.abs(other.coeff) > 1e-6 && Math.abs(other.coeff * value - other.rhs) > 0.8) return null;
    solved = [value];
  } else {
    const pair = solve2(
      [
        [rows[0].cx, rows[1].cx],
        [rows[0].cy, rows[1].cy],
      ],
      [rhsX, rhsY],
    );
    if (!pair) return null;
    solved = [pair[0], pair[1]];
  }

  for (let index = 0; index < unknown.length; index += 1) {
    const official = force.get(unknown[index].id) ?? 0;
    if (Math.abs((solved?.[index] ?? 0) - official) > 0.8) return null;
  }

  const equations = ["Fx", "Fy"].map((axis, axisIndex) => {
    const parts = rows.map((row) => signedTerm(axisIndex === 0 ? row.cx : row.cy, `N${row.member.id}`, false));
    const body = parts
      .map((part, index) => (index === 0 ? part.replace(/^\+ /, "") : part))
      .join(" ");
    const rhs = axisIndex === 0 ? rhsX : rhsY;
    return `Σ${axis} = 0 → ${body} = ${fmt(rhs)}`;
  });

  const results = unknown.map((member, index) => {
    const axial = force.get(member.id) ?? solved?.[index] ?? 0;
    const material = materialOf(member.materialId);
    const otherId = member.i === node.id ? member.j : member.i;
    const other = nodes.get(otherId);
    const length = other ? Math.hypot(other.x - node.x, other.y - node.y, (other.z ?? 0) - (node.z ?? 0)) : 0;
    const allow = axial >= 0 ? material.tension : compressionCapacity(material, length);
    const kind = Math.abs(axial) < 0.05 ? "영부재" : axial > 0 ? "인장" : "압축";
    const ratio = allow <= 0 ? "허용 없음" : `허용 ${allow.toFixed(0)} N의 ${Math.min(999, (Math.abs(axial) / allow) * 100).toFixed(0)}%`;
    return `부재 ${member.id} (${material.name}) = ${formatForce(axial)} · ${kind === "영부재" ? "힘이 거의 없습니다." : ratio}`;
  });

  return {
    nodeId: node.id,
    intro:
      unknown.length === 1
        ? `절점 ${node.id}에는 미지 부재가 1개라 ΣFx, ΣFy 중 계수 큰 식으로 바로 구할 수 있습니다.`
        : `절점 ${node.id}에는 미지 부재가 2개입니다. ΣFx = 0과 ΣFy = 0을 연립합니다.`,
    known: knownLines,
    equations,
    results,
    unknownIds: unknown.map((member) => member.id),
  };
}

function walkJoints3(model: TrussModel, analysis: Analysis): { steps: JointStep[]; unsolved: number[] } {
  const force = new Map(analysis.forces.map((item) => [item.memberId, item.axial]));
  const membersAt = new Map<number, Member[]>();
  for (const node of model.nodes) membersAt.set(node.id, []);
  for (const member of model.members) {
    membersAt.get(member.i)?.push(member);
    membersAt.get(member.j)?.push(member);
  }
  const reaction = new Map(analysis.reactions.map((item) => [item.nodeId, item]));
  const load = new Map<number, { fx: number; fy: number; fz: number }>();
  for (const node of model.nodes) load.set(node.id, { fx: 0, fy: 0, fz: 0 });
  for (const item of model.loads) {
    const current = load.get(item.nodeId);
    if (!current) continue;
    current.fx += item.fx;
    current.fy += item.fy;
    current.fz += item.fz ?? 0;
  }

  const known = new Set<number>();
  const steps: JointStep[] = [];
  let guard = 0;
  while (known.size < model.members.length && guard < 40) {
    guard += 1;
    const candidates = model.nodes
      .map((node) => ({
        node,
        unknown: (membersAt.get(node.id) ?? []).filter((member) => !known.has(member.id)),
      }))
      .filter((item) => item.unknown.length > 0 && item.unknown.length <= 3)
      .sort((a, b) => a.unknown.length - b.unknown.length || a.node.id - b.node.id);

    let progressed = false;
    for (const candidate of candidates) {
      const step = solveJoint3(candidate.node, candidate.unknown, membersAt.get(candidate.node.id) ?? [], known, force, reaction, load, model);
      if (!step) continue;
      steps.push(step);
      for (const member of candidate.unknown) known.add(member.id);
      progressed = true;
      break;
    }
    if (!progressed) break;
  }
  const unsolved = model.members.filter((member) => !known.has(member.id)).map((member) => member.id);
  return { steps, unsolved };
}

function component(row: { cx: number; cy: number; cz: number }, axis: number): number {
  if (axis === 0) return row.cx;
  if (axis === 1) return row.cy;
  return row.cz;
}

function solveJoint3(
  node: Node,
  unknown: Member[],
  connected: Member[],
  known: Set<number>,
  force: Map<number, number>,
  reaction: Map<number, { rx: number; ry: number; rz?: number }>,
  load: Map<number, { fx: number; fy: number; fz: number }>,
  model: TrussModel,
): JointStep | null {
  const nodes = new Map(model.nodes.map((item) => [item.id, item]));
  const knownMembers = connected.filter((member) => known.has(member.id));
  const support = reaction.get(node.id) ?? { rx: 0, ry: 0, rz: 0 };
  const applied = load.get(node.id) ?? { fx: 0, fy: 0, fz: 0 };
  const rhs: [number, number, number] = [-(support.rx + applied.fx), -(support.ry + applied.fy), -((support.rz ?? 0) + applied.fz)];
  const knownLines: string[] = [];
  if (Math.abs(support.rx) > 0.05 || Math.abs(support.ry) > 0.05 || Math.abs(support.rz ?? 0) > 0.05) {
    knownLines.push(`반력 Rx = ${fmt(support.rx)} N, Ry = ${fmt(support.ry)} N, Rz = ${fmt(support.rz ?? 0)} N`);
  }
  if (Math.abs(applied.fx) > 0.05 || Math.abs(applied.fy) > 0.05 || Math.abs(applied.fz) > 0.05) {
    knownLines.push(`외력 Fx = ${fmt(applied.fx)} N, Fy = ${fmt(applied.fy)} N, Fz = ${fmt(applied.fz)} N`);
  }

  for (const member of knownMembers) {
    const otherId = member.i === node.id ? member.j : member.i;
    const other = nodes.get(otherId);
    if (!other) return null;
    const dir = unit3(node, other);
    if (!dir) return null;
    const axial = force.get(member.id) ?? 0;
    rhs[0] -= axial * dir.cx;
    rhs[1] -= axial * dir.cy;
    rhs[2] -= axial * dir.cz;
    knownLines.push(`부재 ${member.id} = ${formatForce(axial)}`);
  }

  const rows = unknown.map((member) => {
    const otherId = member.i === node.id ? member.j : member.i;
    const other = nodes.get(otherId);
    if (!other) return null;
    const dir = unit3(node, other);
    if (!dir) return null;
    return { member, cx: dir.cx, cy: dir.cy, cz: dir.cz };
  });
  if (rows.some((item) => item === null)) return null;
  const coeffs = rows as { member: Member; cx: number; cy: number; cz: number }[];
  const solved = solveUpTo3(coeffs, rhs);
  if (!solved) return null;
  for (let index = 0; index < unknown.length; index += 1) {
    const official = force.get(unknown[index].id) ?? 0;
    if (Math.abs(solved[index] - official) > 0.8) return null;
  }

  const equations = ["Fx", "Fy", "Fz"].map((axis, axisIndex) => {
    const parts = coeffs.map((row) => signedTerm(component(row, axisIndex), `N${row.member.id}`, false));
    const body = parts.map((part, index) => (index === 0 ? part.replace(/^\+ /, "") : part)).join(" ");
    return `Σ${axis} = 0 → ${body} = ${fmt(rhs[axisIndex])}`;
  });
  const results = unknown.map((member, index) => {
    const axial = force.get(member.id) ?? solved[index] ?? 0;
    const material = materialOf(member.materialId);
    const otherId = member.i === node.id ? member.j : member.i;
    const other = nodes.get(otherId);
    const length = other ? Math.hypot(other.x - node.x, other.y - node.y, (other.z ?? 0) - (node.z ?? 0)) : 0;
    const allow = axial >= 0 ? material.tension : compressionCapacity(material, length);
    const kind = Math.abs(axial) < 0.05 ? "영부재" : axial > 0 ? "인장" : "압축";
    const ratio = allow <= 0 ? "허용 없음" : `허용 ${allow.toFixed(0)} N의 ${Math.min(999, (Math.abs(axial) / allow) * 100).toFixed(0)}%`;
    return `부재 ${member.id} (${material.name}) = ${formatForce(axial)} · ${kind === "영부재" ? "힘이 거의 없습니다." : ratio}`;
  });
  const intro =
    unknown.length === 1
      ? `절점 ${node.id}에는 미지 부재가 1개라 ΣFx, ΣFy, ΣFz 중 계수 큰 식으로 바로 구할 수 있습니다.`
      : unknown.length === 2
        ? `절점 ${node.id}에는 미지 부재가 2개입니다. 서로 독립인 두 평형식을 연립하고 나머지 식으로 검산합니다.`
        : `절점 ${node.id}에는 미지 부재가 3개입니다. ΣFx = 0, ΣFy = 0, ΣFz = 0을 연립합니다.`;
  return { nodeId: node.id, intro, known: knownLines, equations, results, unknownIds: unknown.map((member) => member.id) };
}

function solveUpTo3(rows: { cx: number; cy: number; cz: number }[], rhs: [number, number, number]): number[] | null {
  if (rows.length === 1) {
    const coeffs = [rows[0].cx, rows[0].cy, rows[0].cz];
    const order = [0, 1, 2].sort((a, b) => Math.abs(coeffs[b]) - Math.abs(coeffs[a]));
    if (Math.abs(coeffs[order[0]]) < 1e-8) return null;
    const value = rhs[order[0]] / coeffs[order[0]];
    for (const axis of order.slice(1)) {
      if (Math.abs(coeffs[axis]) > 1e-6 && Math.abs(coeffs[axis] * value - rhs[axis]) > 0.8) return null;
    }
    return [value];
  }
  if (rows.length === 2) {
    let best: { det: number; values: [number, number] } | null = null;
    for (let a = 0; a < 3; a += 1) {
      for (let b = a + 1; b < 3; b += 1) {
        const matrix = [
          [component(rows[0], a), component(rows[1], a)],
          [component(rows[0], b), component(rows[1], b)],
        ];
        const det = matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
        const pair = solve2(matrix, [rhs[a], rhs[b]]);
        if (!pair || Math.abs(det) < 1e-8) continue;
        if (!best || Math.abs(det) > best.det) best = { det: Math.abs(det), values: pair };
      }
    }
    if (!best) return null;
    for (let axis = 0; axis < 3; axis += 1) {
      const residual = component(rows[0], axis) * best.values[0] + component(rows[1], axis) * best.values[1] - rhs[axis];
      if (Math.abs(residual) > 0.8) return null;
    }
    return [best.values[0], best.values[1]];
  }
  const matrix = [0, 1, 2].map((axis) => rows.map((row) => component(row, axis)));
  return solveLinear(matrix, rhs);
}
