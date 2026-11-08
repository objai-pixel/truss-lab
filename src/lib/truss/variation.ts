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

export const VARIATION_SET_SIZE = 6;

const LABELS: Record<number, string> = {
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

type Diagonals = "pratt" | "script";

type ChordCase = { panel: number; height: number; end: number };

const CHORD_CASES: ChordCase[] = [
  { panel: 3, height: 4, end: 10 },
  { panel: 3, height: 3, end: 6 },
  { panel: 3, height: 3, end: 10 },
  { panel: 4, height: 4, end: 8 },
  { panel: 4, height: 5, end: 10 },
  { panel: 2, height: 4, end: 8 },
  { panel: 2, height: 3, end: 9 },
  { panel: 5, height: 4, end: 4 },
  { panel: 5, height: 6, end: 6 },
  { panel: 4, height: 3, end: 6 },
  { panel: 3, height: 5, end: 10 },
  { panel: 2, height: 5, end: 10 },
];

const SQUARE_PANELS = [3, 4, 5];
const DIAGONAL_LOADS = [4, 5, 6, 8, 10, 12];
const ZERO_LOADS = [8, 12, 16, 20];
const COUNT_LOADS = [6, 8, 10, 12];
const SIZES = [
  { panel: 2, height: 2 },
  { panel: 2, height: 3 },
  { panel: 3, height: 3 },
  { panel: 3, height: 4 },
  { panel: 4, height: 3 },
  { panel: 4, height: 4 },
];

function bar(id: number, i: number, j: number): Member {
  return { id, i, j, materialId: "tube" };
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]!;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = copy[index]!;
    copy[index] = copy[swap]!;
    copy[swap] = current;
  }
  return copy;
}

function num(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatAxial(axial: number): string {
  const sign = axial < 0 ? "압축" : "인장";
  const magnitude = Math.abs(axial);
  const root = magnitude / Math.SQRT2;
  if (Math.abs(root - Math.round(root)) < 0.02 && Math.round(root) > 0) {
    return `${Math.round(root)}√2 kN ${sign}`;
  }
  return `${num(magnitude)} kN ${sign}`;
}

function axialChoices(axial: number, extras: number[], random: () => number): string[] {
  const answer = formatAxial(axial);
  const pool = [...new Set(extras.flatMap((value) => [formatAxial(value), formatAxial(-value)]))].filter((item) => item !== answer);
  let extra = 1;
  while (pool.length < 3) {
    const fallback = formatAxial(axial < 0 ? -(Math.abs(axial) + extra * 5) : Math.abs(axial) + extra * 5);
    extra += 1;
    if (!pool.includes(fallback) && fallback !== answer) pool.push(fallback);
  }
  return shuffle([answer, ...pool.slice(0, 3)], random);
}

function countChoices(count: number, random: () => number): string[] {
  const pool = shuffle(
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((item) => item !== count),
    random,
  );
  return shuffle([`${count}개`, ...pool.slice(0, 3).map((item) => `${item}개`)], random);
}

function build(panel: number, height: number, diagonals: Diagonals, loads: Array<{ nodeId: number; fy: number }>): TrussModel {
  const diagonalMembers =
    diagonals === "pratt"
      ? [bar(14, 6, 2), bar(15, 2, 8), bar(16, 8, 4), bar(17, 4, 10)]
      : [bar(14, 6, 2), bar(15, 7, 3), bar(16, 9, 3), bar(17, 10, 4)];
  return {
    nodes: [1, 2, 3, 4, 5].map((id) => ({ id, x: (id - 1) * panel, y: 0 })).concat([6, 7, 8, 9, 10].map((id) => ({ id, x: (id - 6) * panel, y: height }))),
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
      ...diagonalMembers,
    ],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 5, type: "rollerY" },
    ],
    loads: loads.map((load) => ({ nodeId: load.nodeId, fx: 0, fy: load.fy })),
  };
}

function topLoads(end: number): Array<{ nodeId: number; fy: number }> {
  return [
    { nodeId: 6, fy: -end },
    { nodeId: 7, fy: -2 * end },
    { nodeId: 8, fy: -2 * end },
    { nodeId: 9, fy: -2 * end },
    { nodeId: 10, fy: -end },
  ];
}

function chordQuestions(random: () => number): VariationQuestion[] {
  const { panel, height, end } = pick(CHORD_CASES, random);
  const model = build(panel, height, "pratt", topLoads(end));
  const sum = 8 * end;
  const reaction = 4 * end;
  const interior = 2 * end;
  const upper = (-3 * end * panel) / height;
  const lower = (4 * end * panel) / height;
  const upperLeft = reaction * panel - end * panel;
  const lowerLeft = reaction * 2 * panel - end * 2 * panel - interior * panel;
  const note = `칸 길이 ${panel} m, 높이 ${height} m. A는 핀, B는 수직 롤러입니다. 위 절점 하중은 F ${end} kN, G·H·I 각 ${interior} kN, J ${end} kN입니다. 사재는 가운데를 향해 내려갑니다.`;
  return [
    {
      id: `upper-${panel}x${height}-e${end}`,
      ask: `이 트러스에서 상현재 FG의 축력은 얼마입니까? 인장은 양, 압축은 음으로 읽습니다.`,
      note,
      model,
      labels: LABELS,
      focusMemberId: 5,
      choices: axialChoices(upper, [reaction, lower, end], random),
      answer: formatAxial(upper),
      hint: "좌우가 같으면 수직반력은 전체 하중의 절반입니다. FG를 자르고 아래 절점 C를 모멘트 중심으로 잡으면, C에 모이는 사재와 하현재는 식에서 빠집니다.",
      steps: [
        `위 하중의 합은 ${end}+${interior}+${interior}+${interior}+${end} = ${sum} kN입니다. 좌우가 같으므로 A의 수직반력은 ${reaction} kN 위입니다.`,
        "FG가 지나는 단면에서 모멘트 중심을 C로 잡습니다. C에 모이는 사재 FC와 하현재 AC는 팔길이가 0입니다.",
        `C의 왼쪽에서 반력 ${reaction} kN과 F의 ${end} kN은 모두 C에서 ${panel} m 떨어져 있습니다. FG는 C보다 ${height} m 위에 있습니다.`,
        `반시계를 양으로 두면 ${reaction}×${panel} − ${end}×${panel} + N×${height} = 0 입니다. ${num(upperLeft)} + ${height}N = 0 이므로 N = ${num(upper)} kN입니다.`,
        `음수는 압축입니다. FG는 ${formatAxial(upper)}입니다.`,
      ],
      expect: { kind: "axial", memberId: 5, axial: upper },
    },
    {
      id: `lower-${panel}x${height}-e${end}`,
      ask: "같은 치수와 하중에서 하현재 CD의 축력은 얼마입니까?",
      note,
      model,
      labels: LABELS,
      focusMemberId: 2,
      choices: axialChoices(lower, [reaction, upper, interior], random),
      answer: formatAxial(lower),
      hint: "CD를 지나는 단면에서 위 절점 H를 모멘트 중심으로 잡습니다. H에 모이는 상현재와 사재는 빠지고, 하현재의 팔길이는 트러스 높이입니다.",
      steps: [
        `A의 수직반력은 ${reaction} kN 위입니다.`,
        "CD가 들어 있는 왼쪽 조각의 모멘트 중심을 H로 잡습니다. GH와 사재 CH는 H를 지나므로 모멘트가 없습니다.",
        `H에서 왼쪽으로 반력은 ${2 * panel} m, F의 ${end} kN도 ${2 * panel} m, G의 ${interior} kN은 ${panel} m입니다. CD는 H보다 ${height} m 아래에 있습니다.`,
        `${reaction}×${2 * panel} − ${end}×${2 * panel} − ${interior}×${panel} − N×${height} = 0 입니다. ${num(lowerLeft)} = ${height}N 이므로 N = ${num(lower)} kN입니다.`,
        `양수는 인장입니다. CD는 ${formatAxial(lower)}입니다.`,
      ],
      expect: { kind: "axial", memberId: 2, axial: lower },
    },
  ];
}

function diagonalQuestions(random: () => number): VariationQuestion[] {
  const panel = pick(SQUARE_PANELS, random);
  const end = pick(DIAGONAL_LOADS, random);
  const model = build(panel, panel, "pratt", topLoads(end));
  const sum = 8 * end;
  const reaction = 4 * end;
  const interior = 2 * end;
  const outer = 3 * end * Math.SQRT2;
  const inner = -end * Math.SQRT2;
  const note = `칸 길이 ${panel} m, 높이 ${panel} m라 사재는 45°입니다. 위 절점 하중은 F ${end} kN, G·H·I 각 ${interior} kN, J ${end} kN입니다. A는 핀, B는 수직 롤러입니다.`;
  return [
    {
      id: `outer-${panel}-b${end}`,
      ask: "왼쪽 끝 사재 FC의 축력은 얼마입니까?",
      note,
      model,
      labels: LABELS,
      focusMemberId: 14,
      choices: axialChoices(outer, [end * Math.SQRT2, 2 * end * Math.SQRT2, inner], random),
      answer: formatAxial(outer),
      hint: "45° 사재의 연직성분은 축력을 √2로 나눈 값입니다. 왼쪽 끝 칸만 자르면 상현재와 하현재는 수평이라 연직 평형에 들어가지 않습니다.",
      steps: [
        `하중 합은 ${sum} kN입니다. 대칭이므로 A의 수직반력은 ${reaction} kN 위입니다.`,
        "FC는 F에서 C로 가운데를 향해 내려갑니다. 인장일 때 이 사재는 왼쪽 조각의 F를 아래로 당깁니다.",
        `왼쪽 끝의 연직합은 ${reaction} − ${end} − N/√2 = 0 입니다.`,
        `N/√2 = ${3 * end} 이므로 N = ${3 * end}√2 kN입니다.`,
        `부호가 양이므로 FC는 ${formatAxial(outer)}입니다.`,
      ],
      expect: { kind: "axial", memberId: 14, axial: outer },
    },
    {
      id: `inner-${panel}-b${end}`,
      ask: "왼쪽에서 둘째 칸의 사재 CH 축력은 얼마입니까?",
      note,
      model,
      labels: LABELS,
      focusMemberId: 15,
      choices: axialChoices(inner, [outer, 2 * end * Math.SQRT2, end * Math.SQRT2], random),
      answer: formatAxial(inner),
      hint: "자른 선 왼쪽의 연직하중과 반력, 사재의 연직성분만 더합니다. 상현재와 하현재는 수평입니다.",
      steps: [
        `A의 수직반력은 ${reaction} kN 위입니다.`,
        `CH를 지나는 단면의 왼쪽에는 F의 ${end} kN과 G의 ${interior} kN이 있습니다.`,
        "이 사재가 왼쪽 조각을 위로 밀면 압축입니다.",
        `${reaction} − ${end} − ${interior} + N/√2 = 0 이므로 N/√2 = −${end}, N = −${end}√2 kN입니다.`,
        `음수는 압축입니다. CH는 ${formatAxial(inner)}입니다.`,
      ],
      expect: { kind: "axial", memberId: 15, axial: inner },
    },
  ];
}

function zeroQuestion(random: () => number): VariationQuestion {
  const size = pick(SIZES, random);
  const load = pick(ZERO_LOADS, random);
  const kind = pick(["script-center", "script-bottom", "pratt-bottom", "pratt-center"] as const, random);
  if (kind === "script-center") {
    return {
      id: `zero-script-center-${size.panel}x${size.height}-${load}`,
      ask: `가운데 위 절점 H에만 ${load} kN이 작용합니다. 축력이 0인 부재는 몇 개입니까?`,
      note: `칸 길이 ${size.panel} m, 높이 ${size.height} m. 사재는 양쪽 끝에서 가운데 아래 절점을 향해 내려갑니다. 다른 절점에는 하중이 없습니다.`,
      model: build(size.panel, size.height, "script", [{ nodeId: 8, fy: -load }]),
      labels: LABELS,
      choices: countChoices(2, random),
      answer: "2개",
      hint: "끝 아래 절점에 수평하중이 없고, 그 절점의 다른 부재가 수평 부재와 나란하지 않으면 그 수평 부재의 축력은 0입니다. 양쪽 끝을 각각 보세요.",
      steps: [
        "A에는 수직재 AF와 하현재 AC만 만납니다. 수평반력은 0이므로 AC 방향으로 힘을 만들 부재가 AC뿐입니다.",
        "ΣFx = 0에서 AC의 축력은 0입니다. B쪽 하현재 EB도 같은 이유로 0입니다.",
        `나머지 상현재, 수직재, 사재는 가운데 ${load} kN을 양쪽 지점으로 나누므로 축력이 있습니다.`,
        "영부재는 AC와 EB, 두 개입니다.",
      ],
      expect: { kind: "zero", count: 2 },
    };
  }
  if (kind === "script-bottom") {
    return {
      id: `zero-script-bottom-${size.panel}x${size.height}-${load}`,
      ask: `아래 절점 C, D, E에만 ${load} kN씩 있습니다. 축력이 0인 부재는 몇 개입니까?`,
      note: `칸 길이 ${size.panel} m, 높이 ${size.height} m. 사재는 양쪽 끝에서 가운데 아래를 향해 내려갑니다. 위 절점에는 하중이 없습니다.`,
      model: build(size.panel, size.height, "script", [
        { nodeId: 2, fy: -load },
        { nodeId: 3, fy: -load },
        { nodeId: 4, fy: -load },
      ]),
      labels: LABELS,
      choices: countChoices(3, random),
      answer: "3개",
      hint: "위 한가운데 절점 H에는 하중이 없고, 만나는 상현재 두 개가 일직선입니다. 그 절점의 수직재가 영부재인지 먼저 보세요. 그다음 양쪽 끝 하현재를 보세요.",
      steps: [
        "H에는 상현재 GH, HI와 수직재 DH만 만납니다. 두 상현재는 한 직선이고 H에는 하중이 없습니다.",
        "직선과 다른 방향인 DH의 축력은 0입니다.",
        "A와 B의 끝 하현재 AC, EB도 수평반력이 없어 0입니다.",
        "영부재는 AC, EB, DH로 세 개입니다.",
      ],
      expect: { kind: "zero", count: 3 },
    };
  }
  if (kind === "pratt-bottom") {
    return {
      id: `zero-pratt-bottom-${size.panel}x${size.height}-${load}`,
      ask: `아래 절점 C, D, E에 ${load} kN씩 있고 위에는 하중이 없습니다. 축력이 0인 부재는 몇 개입니까?`,
      note: `칸 길이 ${size.panel} m, 높이 ${size.height} m인 프랫형입니다. 사재는 가운데를 향해 아래로 내려갑니다.`,
      model: build(size.panel, size.height, "pratt", [
        { nodeId: 2, fy: -load },
        { nodeId: 3, fy: -load },
        { nodeId: 4, fy: -load },
      ]),
      labels: LABELS,
      choices: countChoices(4, random),
      answer: "4개",
      hint: "위 절점 G와 I에는 하중이 없고, 상현재 두 개가 일직선이며 사재가 없습니다. 그 수직재부터 확인하고, 양쪽 끝 하현재도 보세요.",
      steps: [
        "G에는 상현재 FG·GH와 수직재 CG만 만납니다. 상현재는 일직선이고 하중이 없으므로 CG는 0입니다. I의 수직재 EI도 같습니다.",
        "A와 B에는 수평반력이 없으므로 끝 하현재 AC와 EB도 0입니다.",
        "한가운데 수직재 DH는 아래 하중을 매달고, 상현재와 사재도 힘을 전달합니다.",
        "영부재는 AC, EB, CG, EI로 네 개입니다.",
      ],
      expect: { kind: "zero", count: 4 },
    };
  }
  return {
    id: `zero-pratt-center-${size.panel}x${size.height}-${load}`,
    ask: `위 한가운데 H에만 ${load} kN이 있습니다. 축력이 0인 부재는 몇 개입니까?`,
    note: `칸 길이 ${size.panel} m, 높이 ${size.height} m인 프랫형입니다. 사재는 가운데를 향해 내려가고, 다른 절점에는 하중이 없습니다.`,
    model: build(size.panel, size.height, "pratt", [{ nodeId: 8, fy: -load }]),
    labels: LABELS,
    choices: countChoices(5, random),
    answer: "5개",
    hint: "하중이 없는 절점에서 두 부재가 일직선이고 나머지 하나가 다른 방향이면, 그 나머지 부재는 영부재입니다. 아래 한가운데 D와 위 절점 G, I를 먼저 보세요.",
    steps: [
      "D에는 하현재 CD·DE와 수직재 DH만 만납니다. 하현재는 일직선이고 D에는 하중이 없으므로 DH는 0입니다.",
      "G와 I에는 하중이 없고 상현재만 일직선으로 만납니다. 수직재 CG, EI는 0입니다.",
      "양쪽 끝 하현재 AC, EB는 수평반력이 없어 0입니다.",
      `H의 ${load} kN은 사재 CH, HE와 상현재가 양쪽 지점으로 나눕니다.`,
      "영부재는 AC, EB, CG, DH, EI로 다섯 개입니다.",
    ],
    expect: { kind: "zero", count: 5 },
  };
}

function compressionQuestion(random: () => number): VariationQuestion {
  const size = pick(SIZES, random);
  const load = pick(COUNT_LOADS, random);
  const kind = pick(["bottom", "top", "ends"] as const, random);
  if (kind === "bottom") {
    return {
      id: `compression-bottom-${size.panel}x${size.height}-${load}`,
      ask: `하중이 아래 절점 C, D, E에만 ${load} kN씩 있습니다. 압축을 받는 부재는 몇 개입니까?`,
      note: `칸 길이 ${size.panel} m, 높이 ${size.height} m인 프랫형입니다. 사재는 가운데를 향해 아래로 내려갑니다. 위 절점에는 하중이 없습니다.`,
      model: build(size.panel, size.height, "pratt", [
        { nodeId: 2, fy: -load },
        { nodeId: 3, fy: -load },
        { nodeId: 4, fy: -load },
      ]),
      labels: LABELS,
      choices: countChoices(8, random),
      answer: "8개",
      hint: "상현재는 보통 압축입니다. 끝 수직재와, 전단이 남는 안쪽 사재의 부호를 나누어 세세요. 영부재는 압축에 넣지 않습니다.",
      steps: [
        `아래 하중의 합은 ${3 * load} kN이고 대칭이므로 A와 B의 수직반력은 각 ${num((3 * load) / 2)} kN 위입니다.`,
        "상현재 FG, GH, HI, IJ 네 개는 모두 압축입니다.",
        "끝 수직재 AF, JB는 압축입니다. 안쪽 수직재 CG, EI는 영부재이고, 한가운데 DH는 아래 하중을 매달아 인장입니다.",
        "바깥 사재 FC, EJ는 인장입니다. 가운데로 내려가는 사재 CH, HE는 압축입니다.",
        "압축 부재는 상현재 4개, 끝 수직재 2개, 안쪽 사재 2개로 모두 8개입니다.",
      ],
      expect: { kind: "compression", count: 8 },
    };
  }
  if (kind === "top") {
    const end = load;
    const interior = 2 * load;
    return {
      id: `compression-top-${size.panel}x${size.height}-${load}`,
      ask: "위 절점에만 하중이 있습니다. 압축을 받는 부재는 몇 개입니까?",
      note: `칸 길이 ${size.panel} m, 높이 ${size.height} m인 프랫형입니다. 위 하중은 F ${end} kN, G·H·I 각 ${interior} kN, J ${end} kN입니다.`,
      model: build(size.panel, size.height, "pratt", topLoads(end)),
      labels: LABELS,
      choices: countChoices(10, random),
      answer: "10개",
      hint: "반력을 구한 뒤 상현재와 수직재를 먼저 나누세요. 한가운데 수직재는 대칭 때문에 영부재가 될 수 있습니다.",
      steps: [
        `위 하중의 합은 ${8 * end} kN입니다. 대칭이므로 수직반력은 양쪽 각 ${4 * end} kN 위입니다.`,
        "상현재 네 개는 압축입니다. 끝 수직재 AF, JB와 그 안쪽 수직재 CG, EI도 압축입니다.",
        "한가운데 수직재 DH와 끝 하현재 AC, EB는 영부재입니다. 안쪽 하현재 CD, DE는 인장입니다.",
        "바깥 사재 FC, EJ는 인장, 안쪽 사재 CH, HE는 압축입니다.",
        "압축 부재는 상현재 4개, 수직재 4개, 안쪽 사재 2개로 모두 10개입니다.",
      ],
      expect: { kind: "compression", count: 10 },
    };
  }
  return {
    id: `compression-ends-${size.panel}x${size.height}-${load}`,
    ask: `하중이 아래 절점 C와 E에만 ${load} kN씩 있습니다. 압축을 받는 부재는 몇 개입니까?`,
    note: `칸 길이 ${size.panel} m, 높이 ${size.height} m인 프랫형입니다. D와 위 절점에는 하중이 없습니다. 사재는 가운데를 향해 내려갑니다.`,
    model: build(size.panel, size.height, "pratt", [
      { nodeId: 2, fy: -load },
      { nodeId: 4, fy: -load },
    ]),
    labels: LABELS,
    choices: countChoices(6, random),
    answer: "6개",
    hint: "C와 E의 하중은 그 칸의 사재와 끝 수직재가 주로 받습니다. 가운데 칸은 전단이 없어 사재와 수직재가 0인지 확인하세요.",
    steps: [
      `하중 합은 ${2 * load} kN이고 대칭이므로 수직반력은 양쪽 각 ${load} kN 위입니다.`,
      "상현재 네 개와 끝 수직재 AF, JB는 압축입니다.",
      "수직재 CG, DH, EI와 안쪽 사재 CH, HE, 끝 하현재 AC, EB는 영부재입니다.",
      "안쪽 하현재 CD, DE와 바깥 사재 FC, EJ는 인장입니다.",
      "압축 부재는 상현재 4개와 끝 수직재 2개로 모두 6개입니다.",
    ],
    expect: { kind: "compression", count: 6 },
  };
}

/** 단면법, 사재, 영부재, 압축 개수를 한 세트에 6문제 넣는다. 호출할 때마다 치수와 하중이 바뀐다. */
export function createVariationSet(random: () => number = Math.random): VariationQuestion[] {
  return shuffle([...chordQuestions(random), ...diagonalQuestions(random), zeroQuestion(random), compressionQuestion(random)], random);
}
