import { sampleRoad } from "./geometry";
import { MATERIALS, materialOf } from "./materials";
import { analyze } from "./solver";
import { BOOK_NEWTON, type Stage } from "./stages";
import type { Analysis, Load, Member, Node, TrussModel } from "./types";

export type CaseResult = {
  label: string;
  t: number | null;
  analysis: Analysis;
};

export type Trial = {
  passed: boolean;
  cost: number;
  budget: number;
  title: string;
  detail: string;
  cases: CaseResult[];
  worst: CaseResult | null;
  score: number;
};

export function memberLength(nodes: Node[], member: Member): number {
  const a = nodes.find((node) => node.id === member.i);
  const b = nodes.find((node) => node.id === member.j);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
}

export function designCost(nodes: Node[], members: Member[]): number {
  return members.reduce((sum, member) => sum + materialOf(member.materialId).costPerM * memberLength(nodes, member), 0);
}

export function evaluateDesign(stage: Stage, nodes: Node[], members: Member[]): Trial {
  const cost = designCost(nodes, members);
  const budget = stage.budget;
  const supports = stage.supports;
  const base: TrussModel = { nodes, members, supports, loads: [] };

  if (cost > budget + 0.05) {
    return {
      passed: false,
      cost,
      budget,
      title: "예산을 넘었습니다",
      detail: `사용 ${cost.toFixed(1)} / 예산 ${budget}. 부재를 줄이거나 더 싼 재료로 바꾸세요. 케이블은 인장 전용이라 쌀 때가 많습니다.`,
      cases: [],
      worst: null,
      score: 0,
    };
  }

  const cases = loadCases(stage, nodes);
  if (cases === null) {
    return {
      passed: false,
      cost,
      budget,
      title: "도로를 만들 수 없습니다",
      detail: "자동차가 지나갈 절점이 빠져 있습니다.",
      cases: [],
      worst: null,
      score: 0,
    };
  }

  const results: CaseResult[] = cases.map((item) => ({
    label: item.label,
    t: item.t,
    analysis: analyze({ ...base, loads: item.loads }),
  }));

  const worst = pickWorst(results);
  const failed = results.find((item) => item.analysis.status !== "ok");
  if (failed) {
    return {
      passed: false,
      cost,
      budget,
      title: failed.analysis.status === "unstable" || failed.analysis.status === "invalid" ? "트러스가 불안정합니다" : "부재가 파괴되었습니다",
      detail: `${failed.label}: ${failed.analysis.message}`,
      cases: results,
      worst: failed,
      score: 0,
    };
  }

  const weight = stage.staticLoads.reduce((sum, load) => sum + Math.max(0, -load.fy), 0);
  const score = stage.contest && cost > 0.05 ? weight / cost : 0;
  const peak = worst ? `가장 큰 사용률은 ${worst.label}에서 ${peakRatio(worst.analysis).toFixed(0)}%입니다.` : "";
  const scoreText = stage.contest ? ` 점수 ${score.toFixed(2)} = 책 ${weight.toFixed(0)}N ÷ 재료비 ${cost.toFixed(1)}.` : "";
  return {
    passed: true,
    cost,
    budget,
    title: "견딥니다",
    detail: `사용 비용 ${cost.toFixed(1)}, 예산 ${budget}. ${peak}${scoreText} 부재에 마우스를 올리면 그 하중 상태의 축력이 보입니다.`,
    cases: results,
    worst,
    score,
  };
}

export function evaluateContest(stage: Stage, nodes: Node[], members: Member[], books: number): Trial {
  if (!stage.contest || !stage.bookNodeId) {
    return evaluateDesign(stage, nodes, members);
  }
  if (books < 1) {
    return {
      passed: false,
      cost: designCost(nodes, members),
      budget: stage.budget,
      title: "책을 올려 주세요",
      detail: "가운데 절점에 책을 한 권 이상 올린 뒤 시험하세요.",
      cases: [],
      worst: null,
      score: 0,
    };
  }
  const weighed: Stage = {
    ...stage,
    staticLoads: [{ nodeId: stage.bookNodeId, fx: 0, fy: -books * BOOK_NEWTON, label: `책 ${books}권 ${books * BOOK_NEWTON}N` }],
    car: null,
  };
  return evaluateDesign(weighed, nodes, members);
}

function peakRatio(analysis: Analysis): number {
  return Math.max(0, ...analysis.forces.map((force) => (Number.isFinite(force.ratio) ? force.ratio * 100 : 999)));
}

function pickWorst(results: CaseResult[]): CaseResult | null {
  if (results.length === 0) return null;
  return [...results].sort((a, b) => {
    const rank = (item: CaseResult) => {
      if (item.analysis.status === "unstable" || item.analysis.status === "invalid") return 10_000;
      if (item.analysis.status === "overstressed") return 1_000 + peakRatio(item.analysis);
      return peakRatio(item.analysis);
    };
    return rank(b) - rank(a);
  })[0];
}

function loadCases(stage: Stage, nodes: Node[]): { label: string; t: number | null; loads: Load[] }[] | null {
  const extra: Load[] = stage.staticLoads.map(({ nodeId, fx, fy }) => ({ nodeId, fx, fy }));
  if (!stage.car) {
    const label = stage.staticLoads.map((load) => load.label).join(" + ") || "하중";
    return [{ label, t: null, loads: extra }];
  }
  const cases: { label: string; t: number | null; loads: Load[] }[] = [];
  for (let step = 0; step <= stage.car.samples; step += 1) {
    const t = step / stage.car.samples;
    const sample = sampleRoad(nodes, stage.car.road, stage.car.weight, t, extra);
    if (!sample) return null;
    cases.push({
      label: `자동차 ${sample.distance.toFixed(1)}m / ${sample.total.toFixed(1)}m`,
      t,
      loads: sample.loads,
    });
  }
  return cases;
}

export function cheapestMaterialId(minAxial: number, maxAxial: number): string | null {
  let best: { id: string; cost: number } | null = null;
  for (const material of MATERIALS) {
    const tensionOk = maxAxial <= material.tension + 0.05;
    const compressionOk = -minAxial <= material.compression + 0.05;
    if (!tensionOk || !compressionOk) continue;
    if (!best || material.costPerM < best.cost) best = { id: material.id, cost: material.costPerM };
  }
  return best?.id ?? null;
}
