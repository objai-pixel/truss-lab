import assert from "node:assert/strict";
import test from "node:test";
import { TRIPOD, tripodCompression } from "./examples";
import { designCost, evaluateContest, evaluateDesign } from "./evaluate";
import { explain } from "./explain";
import { sampleRoad } from "./geometry";
import { solveLinear } from "./linalg";
import { createQuiz, QUIZ_PRESETS } from "./quiz";
import { PHOTO_QUESTIONS } from "./photo-quiz";
import { VARIATION_QUESTIONS } from "./variation";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { REFERENCES } from "./references";
import { STAGES } from "./stages";
import { spaceAxialByBothMethods, sumEquilibrium } from "./space";
import { analyze, axialByBothMethods } from "./solver";
import type { Member, Node, TrussModel } from "./types";

const triangle: TrussModel = {
  nodes: [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 4, y: 0 },
    { id: 3, x: 2, y: 2 },
  ],
  members: [
    { id: 1, i: 1, j: 2, materialId: "wood" },
    { id: 2, i: 1, j: 3, materialId: "wood" },
    { id: 3, i: 2, j: 3, materialId: "wood" },
  ],
  supports: [
    { nodeId: 1, type: "pin" },
    { nodeId: 2, type: "rollerY" },
  ],
  loads: [{ nodeId: 3, fx: 0, fy: -100 }],
};

test("가우스 소거가 2원 1차 방정식을 푼다", () => {
  const solution = solveLinear(
    [
      [2, 1],
      [1, -1],
    ],
    [4, -1],
  );
  assert.ok(solution);
  assert.ok(Math.abs(solution[0] - 1) < 1e-9);
  assert.ok(Math.abs(solution[1] - 2) < 1e-9);
});

test("이등변 삼각형 지붕은 절점법으로 밑변 인장, 빗변 압축이다", () => {
  const analysis = analyze(triangle);
  assert.equal(analysis.status, "overstressed");
  assert.equal(analysis.method, "joints");
  assert.equal(analysis.classification, "determinate");
  const byId = new Map(analysis.forces.map((force) => [force.memberId, force.axial]));
  assert.ok(Math.abs((byId.get(1) ?? 0) - 50) < 0.02);
  assert.ok(Math.abs((byId.get(2) ?? 0) + 70.7107) < 0.02);
  assert.ok(Math.abs((byId.get(3) ?? 0) + 70.7107) < 0.02);
  const left = analysis.reactions.find((reaction) => reaction.nodeId === 1);
  const right = analysis.reactions.find((reaction) => reaction.nodeId === 2);
  assert.ok(left && Math.abs(left.ry - 50) < 0.02 && Math.abs(left.rx) < 0.02);
  assert.ok(right && Math.abs(right.ry - 50) < 0.02);
});

test("정정 트러스에서 강성법과 절점법의 축력이 같다", () => {
  const both = axialByBothMethods({
    ...triangle,
    members: triangle.members.map((member) => ({ ...member, materialId: "tube" })),
  });
  assert.ok(both);
  both.joints.forEach((axial, index) => {
    assert.ok(Math.abs(axial - both.stiffness[index]) < 0.05);
  });

  const redundant: TrussModel = {
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 2, y: 0 },
      { id: 3, x: 2, y: 2 },
      { id: 4, x: 0, y: 2 },
    ],
    members: [
      { id: 1, i: 1, j: 2, materialId: "tube" },
      { id: 2, i: 2, j: 3, materialId: "tube" },
      { id: 3, i: 3, j: 4, materialId: "tube" },
      { id: 4, i: 4, j: 1, materialId: "tube" },
      { id: 5, i: 1, j: 3, materialId: "tube" },
      { id: 6, i: 2, j: 4, materialId: "rebar" },
    ],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 2, type: "rollerY" },
    ],
    loads: [{ nodeId: 3, fx: 0, fy: -40 }],
  };
  const extra = analyze(redundant);
  assert.equal(extra.classification, "indeterminate");
  assert.equal(extra.method, "stiffness");
  assert.notEqual(extra.status, "unstable");
  assert.ok(extra.forces.every((force) => Number.isFinite(force.axial)));
});

test("한 직선 위의 절점은 기하학적으로 불안정하다", () => {
  const flat = analyze({
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 1, y: 0 },
      { id: 3, x: 2, y: 0 },
      { id: 4, x: 3, y: 0 },
    ],
    members: [
      { id: 1, i: 1, j: 2, materialId: "wood" },
      { id: 2, i: 2, j: 3, materialId: "wood" },
      { id: 3, i: 3, j: 4, materialId: "wood" },
      { id: 4, i: 1, j: 3, materialId: "wood" },
      { id: 5, i: 2, j: 4, materialId: "wood" },
    ],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 4, type: "rollerY" },
    ],
    loads: [{ nodeId: 2, fx: 0, fy: -20 }],
  });
  assert.equal(flat.status, "unstable");
});

test("케이블은 압축이 생기면 파괴로 판정한다", () => {
  const model: TrussModel = {
    ...triangle,
    members: triangle.members.map((member) => ({ ...member, materialId: member.id === 1 ? "tube" : "cable" })),
  };
  const analysis = analyze(model);
  assert.equal(analysis.status, "overstressed");
  assert.equal(analysis.failures.length > 0, true);
  assert.ok(analysis.failures.some((failure) => failure.mode === "compression"));
});

test("절점법 해설이 삼각형 지붕의 인장 하현재를 보여 준다", () => {
  const analysis = analyze(triangle);
  const story = explain(triangle, analysis);
  assert.match(story.determinacy, /정정/);
  assert.ok(story.steps.length >= 1);
  const text = JSON.stringify(story);
  assert.match(text, /인장/);
  assert.match(text, /압축/);
  assert.equal(story.leftover.length, 0);
});

test("자동차 하중은 인접 절점에만 나뉘고 합이 무게와 같다", () => {
  const nodes = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 2, y: 0 },
    { id: 3, x: 4, y: 0 },
  ];
  const mid = sampleRoad(nodes, [1, 2, 3], 80, 0.25);
  assert.ok(mid);
  const sum = mid.loads.reduce((total, load) => total + -load.fy, 0);
  assert.ok(Math.abs(sum - 80) < 1e-6);
  assert.ok(mid.loads.every((load) => load.nodeId === 1 || load.nodeId === 2));
  const end = sampleRoad(nodes, [1, 2, 3], 80, 1);
  assert.ok(end && end.loads.length === 1 && end.loads[0].nodeId === 3);
});

test("각 실습 단계의 예시 답은 통과하고 케이블만으로는 실패한다", () => {
  for (const reference of REFERENCES) {
    const stage = STAGES.find((item) => item.id === reference.stageId);
    assert.ok(stage);
    const trial = evaluateDesign(stage, reference.nodes, reference.members);
    assert.equal(trial.passed, true, `${stage.id}: ${trial.detail}`);
    assert.ok(trial.cost <= stage.budget);
    const tube: Member[] = reference.members.map((member) => ({ ...member, materialId: "tube" }));
    assert.ok(designCost(reference.nodes, tube) > stage.budget, `stage ${stage.id} tube should exceed budget`);
    const cable: Member[] = reference.members.map((member) => ({ ...member, materialId: "cable" }));
    const cableTrial = evaluateDesign(stage, reference.nodes, cable);
    assert.equal(cableTrial.passed, false, `stage ${stage.id} all cable should fail`);
  }
});

test("퀴즈 프리셋은 인장 부재와 압축 부재를 모두 가진다", () => {
  for (const preset of QUIZ_PRESETS) {
    const analysis = analyze(preset.model);
    assert.notEqual(analysis.status, "unstable");
    assert.ok(analysis.forces.some((force) => force.mode === "tension"));
    assert.ok(analysis.forces.some((force) => force.mode === "compression"));
  }
  const quiz = createQuiz(() => 0);
  assert.equal(quiz.kind, "sort");
  assert.equal(quiz.kind === "sort" && quiz.cards.length, 4);
});

test("사진 문제는 문장과 힌트, 풀이가 있고 사진 파일이 있다", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const ids = new Set<string>();
  assert.ok(PHOTO_QUESTIONS.length >= 10);
  for (const question of PHOTO_QUESTIONS) {
    assert.equal(ids.has(question.id), false);
    ids.add(question.id);
    assert.ok(question.ask.length > 20);
    assert.ok(question.choices.includes(question.answer));
    assert.equal(new Set(question.choices).size, question.choices.length);
    assert.ok(question.hint.length > 8);
    assert.ok(question.steps.length >= 3);
    assert.equal(existsSync(join(root, "public", question.image.replace(/^\//, ""))), true, question.image);
  }
});

test("변형 문제의 보기는 계산기 축력과 같다", () => {
  assert.ok(VARIATION_QUESTIONS.length >= 6);
  for (const question of VARIATION_QUESTIONS) {
    assert.ok(question.choices.includes(question.answer));
    assert.equal(new Set(question.choices).size, question.choices.length);
    assert.ok(question.hint.length > 8);
    assert.ok(question.steps.length >= 3);
    const analysis = analyze(question.model);
    assert.equal(analysis.status, "ok", question.id);
    if (question.expect.kind === "axial") {
      const { memberId, axial } = question.expect;
      const force = analysis.forces.find((item) => item.memberId === memberId);
      assert.ok(force && Math.abs(force.axial - axial) < 0.05, `${question.id} ${force?.axial}`);
    }
    if (question.expect.kind === "compression") {
      const count = analysis.forces.filter((force) => force.mode === "compression").length;
      assert.equal(count, question.expect.count, question.id);
    }
    if (question.expect.kind === "zero") {
      const count = analysis.forces.filter((force) => force.mode === "zero").length;
      assert.equal(count, question.expect.count, question.id);
    }
  }
});

test("삼각대는 공간 절점법으로 P·L/(3h) 압축이고 평형이 맞다", () => {
  const analysis = analyze(TRIPOD);
  assert.equal(analysis.status, "ok");
  assert.equal(analysis.method, "joints");
  assert.equal(analysis.classification, "determinate");
  const expected = tripodCompression();
  for (const force of analysis.forces) {
    assert.ok(Math.abs(force.axial + expected) < 0.02, `부재 ${force.memberId} = ${force.axial}`);
  }
  const balance = sumEquilibrium(TRIPOD, analysis.reactions);
  assert.ok(Math.abs(balance.fx) < 0.02);
  assert.ok(Math.abs(balance.fy) < 0.02);
  assert.ok(Math.abs(balance.fz) < 0.02);
  const both = spaceAxialByBothMethods(TRIPOD);
  assert.ok(both);
  both.joints.forEach((axial, index) => {
    assert.ok(Math.abs(axial - both.stiffness[index]) < 0.05);
  });
  const story = explain(TRIPOD, analysis);
  assert.match(story.determinacy, /3j/);
  assert.match(JSON.stringify(story), /ΣFz/);
  assert.equal(story.leftover.length, 0);
  assert.ok(story.steps.length >= 1);
  assert.ok(story.steps.every((step) => step.unknownIds.length > 0 && step.unknownIds.length <= 3));
});

test("평면에 눌린 삼각대는 기하학적으로 불안정하다", () => {
  const flat = analyze({
    ...TRIPOD,
    nodes: TRIPOD.nodes.map((node) => (node.id === 4 ? { ...node, y: 0 } : node)),
  });
  assert.equal(flat.status, "unstable");
});

test("바닥 부재를 더한 삼각대는 부정정 강성법으로 푼다", () => {
  const redundant = analyze({
    ...TRIPOD,
    members: [
      ...TRIPOD.members,
      { id: 8, i: 1, j: 2, materialId: "tube" },
      { id: 9, i: 2, j: 3, materialId: "tube" },
      { id: 10, i: 3, j: 1, materialId: "tube" },
    ],
  });
  assert.equal(redundant.method, "stiffness");
  assert.equal(redundant.classification, "indeterminate");
  assert.notEqual(redundant.status, "unstable");
  const balance = sumEquilibrium(TRIPOD, redundant.reactions);
  assert.ok(Math.abs(balance.fy) < 0.05);
});

test("책 하중 경진은 짧은 수수깡은 통과하고 종이 압축재와 긴 스파게티는 실패한다", () => {
  const stage = STAGES.find((item) => item.contest);
  assert.ok(stage);
  const nodes: Node[] = [
    { id: 1, x: 3, y: 0 },
    { id: 2, x: 9, y: 0 },
    { id: 3, x: 6, y: 0 },
    { id: 4, x: 6, y: 2 },
  ];
  const safe: Member[] = [
    { id: 1, i: 1, j: 3, materialId: "paper" },
    { id: 2, i: 3, j: 2, materialId: "paper" },
    { id: 3, i: 1, j: 4, materialId: "skewer" },
    { id: 4, i: 4, j: 2, materialId: "skewer" },
    { id: 5, i: 3, j: 4, materialId: "paper" },
  ];
  const held = evaluateContest(stage, nodes, safe, 1);
  assert.equal(held.passed, true, held.detail);
  assert.ok(held.score > 0);
  assert.ok(held.cost <= stage.budget);

  const paper: Member[] = safe.map((member) => ({ ...member, materialId: "paper" }));
  assert.equal(evaluateContest(stage, nodes, paper, 1).passed, false);

  const spaghetti: Member[] = safe.map((member) => ({ ...member, materialId: member.id === 3 || member.id === 4 ? "spaghetti" : member.materialId }));
  assert.equal(evaluateContest(stage, nodes, spaghetti, 1).passed, false);
});
