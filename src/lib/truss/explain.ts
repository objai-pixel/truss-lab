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

function loadPhrase(fx: number, fy: number, fz = 0): string | null {
  const parts: string[] = [];
  if (Math.abs(fx) > 0.05) parts.push(fx > 0 ? `오른쪽 ${fmt(fx)} N` : `왼쪽 ${fmt(-fx)} N`);
  if (Math.abs(fy) > 0.05) parts.push(fy > 0 ? `위쪽 ${fmt(fy)} N` : `아래쪽 ${fmt(-fy)} N`);
  if (Math.abs(fz) > 0.05) parts.push(fz > 0 ? `깊이 방향 ${fmt(fz)} N` : `앞쪽 ${fmt(-fz)} N`);
  return parts.length > 0 ? parts.join(", ") : null;
}

function sumLine(axis: string, terms: { value: number; name: string }[]): string {
  const visible = terms.filter((term) => Math.abs(term.value) >= 0.05);
  if (visible.length === 0) return `Σ${axis} = 0: 0 = 0`;
  const body = visible.map((term, index) => signedTerm(term.value, term.name, index === 0)).join(" ");
  return `Σ${axis} = 0: ${body} = 0`;
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
  const steps = [...walk.steps, ...loadReviews(model, analysis, new Set(walk.steps.map((step) => step.nodeId)))];
  const limit = space ? 4 : 3;

  return {
    title,
    summary: analysis.message,
    determinacy: determinacyText(analysis, space),
    reactions,
    steps,
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
  const hasLoad = (id: number) => {
    const item = load.get(id);
    return !!item && Math.hypot(item.fx, item.fy) > 0.05;
  };
  let guard = 0;
  while (known.size < model.members.length && guard < 40) {
    guard += 1;
    const candidates = model.nodes
      .map((node) => ({
        node,
        unknown: (membersAt.get(node.id) ?? []).filter((member) => !known.has(member.id)),
      }))
      .filter((item) => item.unknown.length > 0 && item.unknown.length <= 2)
      .sort((a, b) => a.unknown.length - b.unknown.length || Number(hasLoad(b.node.id)) - Number(hasLoad(a.node.id)) || a.node.id - b.node.id);

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

  const knownParts: { id: number; cx: number; cy: number; axial: number }[] = [];
  for (const member of knownMembers) {
    const otherId = member.i === node.id ? member.j : member.i;
    const other = nodes.get(otherId);
    if (!other) return null;
    const dir = unitToward(node, other);
    if (!dir) return null;
    const axial = force.get(member.id) ?? 0;
    rhsX -= axial * dir.cx;
    rhsY -= axial * dir.cy;
    knownParts.push({ id: member.id, cx: dir.cx, cy: dir.cy, axial });
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

  const phrase = loadPhrase(applied.fx, applied.fy);
  const equations = phrase
    ? loadedPlaneLines(rows, knownParts, applied, support, rhsX, rhsY)
    : ["Fx", "Fy"].map((axis, axisIndex) => {
        const parts = rows.map((row) => signedTerm(axisIndex === 0 ? row.cx : row.cy, `N${row.member.id}`, false));
        const body = parts.map((part, index) => (index === 0 ? part.replace(/^\+ /, "") : part)).join(" ");
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
    intro: phrase
      ? `절점 ${node.id}에 ${phrase} 하중이 있습니다. 부재가 절점을 밀거나 당기는 힘과 이 하중을 더해 ΣFx = 0, ΣFy = 0을 맞춥니다.`
      : unknown.length === 1
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
  const hasLoad = (id: number) => {
    const item = load.get(id);
    return !!item && Math.hypot(item.fx, item.fy, item.fz) > 0.05;
  };
  let guard = 0;
  while (known.size < model.members.length && guard < 40) {
    guard += 1;
    const candidates = model.nodes
      .map((node) => ({
        node,
        unknown: (membersAt.get(node.id) ?? []).filter((member) => !known.has(member.id)),
      }))
      .filter((item) => item.unknown.length > 0 && item.unknown.length <= 3)
      .sort((a, b) => a.unknown.length - b.unknown.length || Number(hasLoad(b.node.id)) - Number(hasLoad(a.node.id)) || a.node.id - b.node.id);

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

  const knownParts: { id: number; cx: number; cy: number; cz: number; axial: number }[] = [];
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
    knownParts.push({ id: member.id, cx: dir.cx, cy: dir.cy, cz: dir.cz, axial });
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

  const phrase = loadPhrase(applied.fx, applied.fy, applied.fz);
  const equations = phrase
    ? loadedSpaceLines(coeffs, knownParts, applied, support, rhs)
    : ["Fx", "Fy", "Fz"].map((axis, axisIndex) => {
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
  const intro = phrase
    ? `절점 ${node.id}에 ${phrase} 하중이 있습니다. 세 방향 부재력과 이 하중을 더해 ΣFx = 0, ΣFy = 0, ΣFz = 0을 맞춥니다.`
    : unknown.length === 1
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

function reducedLine(axis: string, rows: { value: number; name: string }[], rhs: number): string {
  if (rows.length === 0) return "";
  const body = rows.map((row, index) => signedTerm(row.value, row.name, index === 0)).join(" ");
  return `${axis}에서 하중과 이미 아는 힘을 넘기면 ${body} = ${fmt(rhs)}`;
}

function loadedPlaneLines(
  rows: { member: Member; cx: number; cy: number }[],
  knownParts: { id: number; cx: number; cy: number; axial: number }[],
  applied: { fx: number; fy: number },
  support: { rx: number; ry: number },
  rhsX: number,
  rhsY: number,
): string[] {
  const lines: string[] = [];
  const axes = [
    { name: "Fx", key: "cx" as const, load: applied.fx, reaction: support.rx, rhs: rhsX },
    { name: "Fy", key: "cy" as const, load: applied.fy, reaction: support.ry, rhs: rhsY },
  ];
  for (const axis of axes) {
    const terms = [
      ...rows.map((row) => ({ value: row[axis.key], name: `N${row.member.id}` })),
      ...knownParts.map((part) => ({ value: part.axial * part[axis.key], name: `부재${part.id}` })),
    ];
    if (Math.abs(axis.reaction) > 0.05) terms.push({ value: axis.reaction, name: "반력" });
    if (Math.abs(axis.load) > 0.05) terms.push({ value: axis.load, name: "하중" });
    lines.push(sumLine(axis.name, terms));
    const moved =
      knownParts.some((part) => Math.abs(part.axial * part[axis.key]) > 0.05) ||
      Math.abs(axis.reaction) > 0.05 ||
      Math.abs(axis.load) > 0.05;
    if (!moved) continue;
    const reduced = reducedLine(
      axis.name,
      rows.map((row) => ({ value: row[axis.key], name: `N${row.member.id}` })),
      axis.rhs,
    );
    if (reduced) lines.push(reduced);
  }
  return lines;
}

function loadedSpaceLines(
  rows: { member: Member; cx: number; cy: number; cz: number }[],
  knownParts: { id: number; cx: number; cy: number; cz: number; axial: number }[],
  applied: { fx: number; fy: number; fz: number },
  support: { rx: number; ry: number; rz?: number },
  rhs: [number, number, number],
): string[] {
  const lines: string[] = [];
  const axes = [
    { name: "Fx", key: "cx" as const, load: applied.fx, reaction: support.rx, rhs: rhs[0] },
    { name: "Fy", key: "cy" as const, load: applied.fy, reaction: support.ry, rhs: rhs[1] },
    { name: "Fz", key: "cz" as const, load: applied.fz, reaction: support.rz ?? 0, rhs: rhs[2] },
  ];
  for (const axis of axes) {
    const terms = [
      ...rows.map((row) => ({ value: row[axis.key], name: `N${row.member.id}` })),
      ...knownParts.map((part) => ({ value: part.axial * part[axis.key], name: `부재${part.id}` })),
    ];
    if (Math.abs(axis.reaction) > 0.05) terms.push({ value: axis.reaction, name: "반력" });
    if (Math.abs(axis.load) > 0.05) terms.push({ value: axis.load, name: "하중" });
    lines.push(sumLine(axis.name, terms));
    const moved =
      knownParts.some((part) => Math.abs(part.axial * part[axis.key]) > 0.05) ||
      Math.abs(axis.reaction) > 0.05 ||
      Math.abs(axis.load) > 0.05;
    if (!moved) continue;
    const reduced = reducedLine(
      axis.name,
      rows.map((row) => ({ value: row[axis.key], name: `N${row.member.id}` })),
      axis.rhs,
    );
    if (reduced) lines.push(reduced);
  }
  return lines;
}

function loadReviews(model: TrussModel, analysis: Analysis, covered: Set<number>): JointStep[] {
  const space = isSpaceModel(model);
  const totals = new Map<number, { fx: number; fy: number; fz: number }>();
  for (const node of model.nodes) totals.set(node.id, { fx: 0, fy: 0, fz: 0 });
  for (const item of model.loads) {
    const current = totals.get(item.nodeId);
    if (!current) continue;
    current.fx += item.fx;
    current.fy += item.fy;
    current.fz += item.fz ?? 0;
  }
  const force = new Map(analysis.forces.map((item) => [item.memberId, item.axial]));
  const reaction = new Map(analysis.reactions.map((item) => [item.nodeId, item]));
  const nodes = new Map(model.nodes.map((node) => [node.id, node]));
  const steps: JointStep[] = [];
  for (const node of model.nodes) {
    const applied = totals.get(node.id);
    if (!applied || Math.hypot(applied.fx, applied.fy, applied.fz) <= 0.05 || covered.has(node.id)) continue;
    const phrase = loadPhrase(applied.fx, applied.fy, applied.fz);
    if (!phrase) continue;
    const support = reaction.get(node.id) ?? { rx: 0, ry: 0, rz: 0 };
    const knownParts: { id: number; cx: number; cy: number; cz: number; axial: number }[] = [];
    let closed = true;
    for (const member of model.members) {
      if (member.i !== node.id && member.j !== node.id) continue;
      const other = nodes.get(member.i === node.id ? member.j : member.i);
      if (!other) {
        closed = false;
        continue;
      }
      const axial = force.get(member.id);
      if (axial === undefined) {
        closed = false;
        continue;
      }
      if (space) {
        const dir = unit3(node, other);
        if (!dir) {
          closed = false;
          continue;
        }
        knownParts.push({ id: member.id, cx: dir.cx, cy: dir.cy, cz: dir.cz, axial });
      } else {
        const dir = unitToward(node, other);
        if (!dir) {
          closed = false;
          continue;
        }
        knownParts.push({ id: member.id, cx: dir.cx, cy: dir.cy, cz: 0, axial });
      }
    }
    const axes = space
      ? [
          { name: "Fx", key: "cx" as const, load: applied.fx, reaction: support.rx },
          { name: "Fy", key: "cy" as const, load: applied.fy, reaction: support.ry },
          { name: "Fz", key: "cz" as const, load: applied.fz, reaction: support.rz ?? 0 },
        ]
      : [
          { name: "Fx", key: "cx" as const, load: applied.fx, reaction: support.rx },
          { name: "Fy", key: "cy" as const, load: applied.fy, reaction: support.ry },
        ];
    const equations = axes.map((axis) => {
      const terms = knownParts.map((part) => ({ value: part.axial * part[axis.key], name: `부재${part.id}` }));
      if (Math.abs(axis.reaction) > 0.05) terms.push({ value: axis.reaction, name: "반력" });
      if (Math.abs(axis.load) > 0.05) terms.push({ value: axis.load, name: "하중" });
      return sumLine(axis.name, terms);
    });
    steps.push({
      nodeId: node.id,
      intro: `절점 ${node.id}에 ${phrase} 하중이 있습니다. 이미 구한 부재력을 이 절점에 다시 모아 하중과 평형을 이루는지 확인합니다.`,
      known: knownParts.map((part) => `부재 ${part.id} = ${formatForce(part.axial)}`),
      equations,
      results: [
        closed
          ? "각 방향의 합이 0이면 이 절점의 하중을 부재력이 받고 있습니다."
          : "일부 부재력은 한 절점씩의 순서로 끝나지 않아, 이 검산에는 넣지 못했습니다.",
      ],
      unknownIds: [],
    });
  }
  return steps;
}
