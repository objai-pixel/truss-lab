import type { Member, TrussModel } from "./types";

export type VariationExpect =
  | { kind: "axial"; memberId: number; axial: number }
  | { kind: "compression"; count: number }
  | { kind: "zero"; count: number };

export type VariationQuestion = {
  id: string;
  ask: string;
  note: string;
  model: TrussModel;
  labels: Record<number, string>;
  focusMemberId?: number;
  choices: string[];
  answer: string;
  hint: string;
  steps: string[];
  expect: VariationExpect;
};

const wood = "wood";

function bar(id: number, i: number, j: number): Member {
  return { id, i, j, materialId: wood };
}

function pratt(panel: number, height: number): { model: Omit<TrussModel, "loads">; labels: Record<number, string> } {
  const labels: Record<number, string> = {
    1: "A",
    2: "C",
    3: "D",
    4: "E",
    5: "B",
    6: "F",
    7: "G",
    8: "H",
    9: "I",
    10: "J",
  };
  return {
    labels,
    model: {
      nodes: [
        { id: 1, x: 0, y: 0 },
        { id: 2, x: panel, y: 0 },
        { id: 3, x: 2 * panel, y: 0 },
        { id: 4, x: 3 * panel, y: 0 },
        { id: 5, x: 4 * panel, y: 0 },
        { id: 6, x: 0, y: height },
        { id: 7, x: panel, y: height },
        { id: 8, x: 2 * panel, y: height },
        { id: 9, x: 3 * panel, y: height },
        { id: 10, x: 4 * panel, y: height },
      ],
      members: [
        bar(1, 1, 2),
        bar(2, 2, 3),
        bar(3, 3, 4),
        bar(4, 4, 5),
        bar(5, 6, 7),
        bar(6, 7, 8),
        bar(7, 8, 9),
        bar(8, 9, 10),
        bar(9, 1, 6),
        bar(10, 2, 7),
        bar(11, 3, 8),
        bar(12, 4, 9),
        bar(13, 5, 10),
        bar(14, 6, 2),
        bar(15, 2, 8),
        bar(16, 8, 4),
        bar(17, 4, 10),
      ],
      supports: [
        { nodeId: 1, type: "pin" },
        { nodeId: 5, type: "rollerY" },
      ],
    },
  };
}

const slope = pratt(3, 4);
const square = pratt(4, 4);
const center = pratt(2, 2);
const bottom = pratt(3, 3);

export const VARIATION_QUESTIONS: VariationQuestion[] = [
  {
    id: "upper-fg",
    ask: "아래 트러스에서 상현재 FG의 축력은 얼마입니까? 인장은 양, 압축은 음으로 읽습니다.",
    note: "칸 길이 3 m, 높이 4 m. A는 핀, B는 수직 롤러입니다. 위 절점 하중은 F 10 kN, G·H·I 각 20 kN, J 10 kN입니다.",
    model: {
      ...slope.model,
      loads: [
        { nodeId: 6, fx: 0, fy: -10 },
        { nodeId: 7, fx: 0, fy: -20 },
        { nodeId: 8, fx: 0, fy: -20 },
        { nodeId: 9, fx: 0, fy: -20 },
        { nodeId: 10, fx: 0, fy: -10 },
      ],
    },
    labels: slope.labels,
    focusMemberId: 5,
    choices: ["22.5 kN 인장", "22.5 kN 압축", "30 kN 압축", "40 kN 인장"],
    answer: "22.5 kN 압축",
    hint: "좌우가 같으면 수직반력은 전체 하중의 절반입니다. FG를 자르고, 그 사재와 하현재가 만나는 아래 절점을 모멘트 중심으로 잡으면 그 두 부재는 식에서 빠집니다.",
    steps: [
      "위 하중의 합은 10+20+20+20+10 = 80 kN입니다. 좌우 대칭이므로 A의 수직반력은 40 kN 위입니다.",
      "FG가 지나는 단면에서 모멘트 중심을 C로 잡습니다. C에 모이는 사재 FC와 하현재 AC는 팔 길이가 0입니다.",
      "C의 왼쪽에는 반력 40 kN과 F의 10 kN이 있고, 둘 다 C에서 3 m 떨어집니다. FG는 C보다 4 m 위에 있습니다.",
      "반시계를 양으로 두면 40×3 − 10×3 + N×4 = 0 입니다. 90 + 4N = 0 이므로 N = −22.5 kN입니다.",
      "음수는 압축입니다. FG는 22.5 kN 압축입니다.",
    ],
    expect: { kind: "axial", memberId: 5, axial: -22.5 },
  },
  {
    id: "lower-cd",
    ask: "같은 트러스에서 하현재 CD의 축력은 얼마입니까?",
    note: "칸 길이 3 m, 높이 4 m. 하중과 지점은 앞 문제와 같습니다. 묻는 부재만 CD로 바뀝니다.",
    model: {
      ...slope.model,
      loads: [
        { nodeId: 6, fx: 0, fy: -10 },
        { nodeId: 7, fx: 0, fy: -20 },
        { nodeId: 8, fx: 0, fy: -20 },
        { nodeId: 9, fx: 0, fy: -20 },
        { nodeId: 10, fx: 0, fy: -10 },
      ],
    },
    labels: slope.labels,
    focusMemberId: 2,
    choices: ["22.5 kN 인장", "30 kN 압축", "30 kN 인장", "40 kN 인장"],
    answer: "30 kN 인장",
    hint: "CD를 지나는 단면에서 위 절점 H를 모멘트 중심으로 잡으면, H에 모이는 상현재와 사재는 빠집니다. 하현재의 팔 길이는 트러스 높이입니다.",
    steps: [
      "A의 수직반력은 여전히 40 kN 위입니다.",
      "CD가 포함된 왼쪽 조각의 모멘트 중심을 H로 잡습니다. GH와 사재 CH는 H를 지나므로 모멘트가 없습니다.",
      "H에서 왼쪽으로 반력은 6 m, F의 10 kN은 6 m, G의 20 kN은 3 m입니다. CD는 H보다 4 m 아래에 있습니다.",
      "40×6 − 10×6 − 20×3 − N×4 = 0 입니다. 120 = 4N 이므로 N = 30 kN입니다.",
      "양수는 인장입니다. CD는 30 kN 인장입니다.",
    ],
    expect: { kind: "axial", memberId: 2, axial: 30 },
  },
  {
    id: "diagonal-outer",
    ask: "칸이 정사각형인 트러스입니다. 왼쪽 끝 사재 FC의 축력은 얼마입니까?",
    note: "칸 길이 4 m, 높이 4 m라 사재는 45°입니다. 위 절점 하중은 F 6 kN, G·H·I 각 12 kN, J 6 kN입니다.",
    model: {
      ...square.model,
      loads: [
        { nodeId: 6, fx: 0, fy: -6 },
        { nodeId: 7, fx: 0, fy: -12 },
        { nodeId: 8, fx: 0, fy: -12 },
        { nodeId: 9, fx: 0, fy: -12 },
        { nodeId: 10, fx: 0, fy: -6 },
      ],
    },
    labels: square.labels,
    focusMemberId: 14,
    choices: ["6√2 kN 압축", "12√2 kN 인장", "18√2 kN 인장", "18√2 kN 압축"],
    answer: "18√2 kN 인장",
    hint: "45° 사재의 연직성분은 축력을 √2로 나눈 값입니다. FC만 남기도록 왼쪽 끝 칸을 자르면, 반력과 F의 하중만 연직 평형에 들어옵니다.",
    steps: [
      "하중 합은 6+12+12+12+6 = 48 kN입니다. 대칭이므로 A의 수직반력은 24 kN 위입니다.",
      "FC는 F에서 C로 중앙을 향해 내려갑니다. 인장일 때 이 사재는 왼쪽 조각의 F를 아래쪽으로 당깁니다.",
      "왼쪽 끝만 남기면 연직합은 24 − 6 − N/√2 = 0 입니다.",
      "N/√2 = 18 이므로 N = 18√2 kN입니다.",
      "부호가 양이므로 FC는 18√2 kN 인장입니다.",
    ],
    expect: { kind: "axial", memberId: 14, axial: 18 * Math.SQRT2 },
  },
  {
    id: "diagonal-inner",
    ask: "같은 45° 트러스에서, 왼쪽에서 둘째 칸의 사재 CH 축력은 얼마입니까?",
    note: "치수와 하중은 앞의 45° 트러스와 같습니다. 묻는 부재는 C와 H를 잇는 사재입니다.",
    model: {
      ...square.model,
      loads: [
        { nodeId: 6, fx: 0, fy: -6 },
        { nodeId: 7, fx: 0, fy: -12 },
        { nodeId: 8, fx: 0, fy: -12 },
        { nodeId: 9, fx: 0, fy: -12 },
        { nodeId: 10, fx: 0, fy: -6 },
      ],
    },
    labels: square.labels,
    focusMemberId: 15,
    choices: ["6√2 kN 인장", "6√2 kN 압축", "12√2 kN 압축", "18√2 kN 인장"],
    answer: "6√2 kN 압축",
    hint: "상현재와 하현재는 수평이라 연직 평형에 들어가지 않습니다. 자른 선 왼쪽에 남은 연직하중과 반력, 그리고 사재의 연직성분만 더합니다.",
    steps: [
      "A의 수직반력은 24 kN 위입니다.",
      "CH를 지나는 단면의 왼쪽에는 F의 6 kN과 G의 12 kN이 있습니다.",
      "이 사재가 왼쪽 조각을 위로 밀면 압축입니다. 연직합을 24 − 6 − 12 + N/√2 = 0 으로 두면 됩니다.",
      "6 + N/√2 = 0 이므로 N = −6√2 kN입니다.",
      "음수는 압축입니다. CH는 6√2 kN 압축입니다.",
    ],
    expect: { kind: "axial", memberId: 15, axial: -6 * Math.SQRT2 },
  },
  {
    id: "zero-count",
    ask: "가운데 위 절점 H에만 12 kN이 작용합니다. 축력이 0인 부재는 몇 개입니까?",
    note: "칸 길이 2 m, 높이 2 m. 다른 절점에는 하중이 없습니다. A는 핀, B는 수직 롤러입니다.",
    model: {
      ...center.model,
      members: [
        ...center.model.members.filter((member) => member.id < 14),
        { id: 14, i: 6, j: 2, materialId: "wood" },
        { id: 15, i: 7, j: 3, materialId: "wood" },
        { id: 16, i: 9, j: 3, materialId: "wood" },
        { id: 17, i: 10, j: 4, materialId: "wood" },
      ],
      loads: [{ nodeId: 8, fx: 0, fy: -12 }],
    },
    labels: center.labels,
    choices: ["1개", "2개", "4개", "6개"],
    answer: "2개",
    hint: "끝 아래 절점에 수평하중이 없고, 그 절점의 수평 부재가 다른 부재와 나란하지 않으면 그 수평 부재의 축력은 0입니다. 양쪽 끝을 각각 보세요.",
    steps: [
      "A에는 수직재 AF와 하현재 AC만 만납니다. 수평반력은 0이므로 AC 방향으로 힘을 만들 부재가 AC뿐입니다.",
      "ΣFx = 0 에서 AC의 축력은 0입니다. B쪽 하현재 EB도 같은 이유로 0입니다.",
      "나머지 상현재, 수직재, 사재는 가운데 12 kN을 양 지점으로 나르므로 축력이 있습니다.",
      "따라서 영부재는 AC와 EB, 두 개입니다.",
    ],
    expect: { kind: "zero", count: 2 },
  },
  {
    id: "compression-count",
    ask: "하중이 아래 절점 C, D, E에만 8 kN씩 있습니다. 압축을 받는 부재는 몇 개입니까?",
    note: "칸 길이 3 m, 높이 3 m인 프랫형입니다. 사재는 중앙을 향해 아래로 내려갑니다. 위 절점에는 하중이 없습니다.",
    model: {
      ...bottom.model,
      loads: [
        { nodeId: 2, fx: 0, fy: -8 },
        { nodeId: 3, fx: 0, fy: -8 },
        { nodeId: 4, fx: 0, fy: -8 },
      ],
    },
    labels: bottom.labels,
    choices: ["6개", "7개", "8개", "10개"],
    answer: "8개",
    hint: "먼저 반력을 구하세요. 상현재는 보통 압축이고, 끝 수직재도 압축인 경우가 많습니다. 안쪽 사재는 전단의 방향으로 압축인지 인장인지가 갈립니다.",
    steps: [
      "하중 합은 24 kN이고 대칭이므로 A와 B의 수직반력은 각 12 kN 위입니다.",
      "상현재 FG, GH, HI, IJ 네 개는 모두 압축입니다.",
      "끝 수직재 AF와 JB는 압축입니다. 그 안쪽 수직재 CG와 EI는 영부재이고, 한가운데 수직재 DH는 아래 하중을 매달아 인장입니다.",
      "바깥 사재 FC, EJ는 인장입니다. 중앙 쪽으로 내려가는 사재 CH, HE는 압축입니다.",
      "압축 부재는 상현재 4개, 끝 수직재 2개, 안쪽 사재 2개로 모두 8개입니다.",
    ],
    expect: { kind: "compression", count: 8 },
  },
];
