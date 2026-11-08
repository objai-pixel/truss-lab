export type MaterialRole = "tension" | "compression" | "balanced";

export type Material = {
  id: string;
  name: string;
  /** 허용 인장축력 N */
  tension: number;
  /** 허용 압축축력 N. 0이면 압축을 전혀 받지 못한다. */
  compression: number;
  /** 길이 1m당 가격 */
  costPerM: number;
  /** 상대 탄성계수. 정정 트러스 축력에는 영향이 없다. */
  E: number;
  /** 상대 단면적 */
  A: number;
  color: string;
  role: MaterialRole;
  summary: string;
  /** 기준 길이보다 긴 부재는 압축 허용이 (기준/길이)^지수 로 줄어든다. */
  buckling?: { referenceLength: number; exponent: number };
};

export const MATERIALS: Material[] = [
  {
    id: "plastic",
    name: "플라스틱",
    tension: 32,
    compression: 18,
    costPerM: 1,
    E: 3,
    A: 1,
    color: "#3d8eb5",
    role: "balanced",
    summary: "가장 싸지만 인장도 압축도 약합니다.",
  },
  {
    id: "cable",
    name: "케이블",
    tension: 240,
    compression: 0,
    costPerM: 3,
    E: 120,
    A: 0.25,
    color: "#241c16",
    role: "tension",
    summary: "당기는 힘에만 강합니다. 조금이라도 압축되면 늘어져 파괴로 봅니다.",
  },
  {
    id: "bamboo",
    name: "대나무",
    tension: 72,
    compression: 34,
    costPerM: 3,
    E: 14,
    A: 0.8,
    color: "#6d8f3e",
    role: "tension",
    summary: "가볍고 인장에 비교적 강하지만 압축에는 쉽게 꺾입니다.",
  },
  {
    id: "wood",
    name: "나무",
    tension: 100,
    compression: 55,
    costPerM: 4,
    E: 11,
    A: 1,
    color: "#c4843c",
    role: "tension",
    summary: "인장 100N, 압축 55N. 작은 압축재와 중간 인장재에 무난합니다.",
  },
  {
    id: "rebar",
    name: "철근",
    tension: 210,
    compression: 28,
    costPerM: 5,
    E: 200,
    A: 0.16,
    color: "#5c6770",
    role: "tension",
    summary: "인장에는 매우 강하지만 가늘어서 압축에는 좌굴하기 쉽습니다.",
  },
  {
    id: "concrete",
    name: "콘크리트",
    tension: 16,
    compression: 230,
    costPerM: 6,
    E: 28,
    A: 2.2,
    color: "#8e948f",
    role: "compression",
    summary: "압축에 강하고 인장에는 거의 못 버팁니다.",
  },
  {
    id: "tube",
    name: "강관",
    tension: 160,
    compression: 200,
    costPerM: 9,
    E: 200,
    A: 1,
    color: "#2c3844",
    role: "compression",
    summary: "인장·압축을 모두 잘 받지만 가장 비쌉니다.",
  },
];

/** 책 하중 경진에서만 고를 수 있다. 실습 1–7단계 팔레트에는 넣지 않는다. */
export const CONTEST_MATERIALS: Material[] = [
  {
    id: "paper",
    name: "종이",
    tension: 80,
    compression: 0,
    costPerM: 1,
    E: 2,
    A: 0.15,
    color: "#f4efe4",
    role: "tension",
    summary: "당길 때만 힘이 생깁니다. 누르면 접히므로 압축 허용은 0입니다.",
  },
  {
    id: "spaghetti",
    name: "스파게티",
    tension: 28,
    compression: 36,
    costPerM: 2,
    E: 4,
    A: 0.3,
    color: "#e4d2a4",
    role: "compression",
    summary: "짧은 면은 압축을 조금 받습니다. 길면 좌굴로 허용이 급감합니다.",
    buckling: { referenceLength: 2, exponent: 2 },
  },
  {
    id: "skewer",
    name: "수수깡",
    tension: 48,
    compression: 70,
    costPerM: 3,
    E: 12,
    A: 0.7,
    color: "#c4a15a",
    role: "compression",
    summary: "면보다 압축에 세지만 긴 부재는 마찬가지로 좌굴합니다.",
    buckling: { referenceLength: 2.5, exponent: 2 },
  },
];

export const MATERIAL_MAP: Record<string, Material> = Object.fromEntries(
  [...MATERIALS, ...CONTEST_MATERIALS].map((material) => [material.id, material]),
);

export function compressionCapacity(material: Material, length: number): number {
  const rule = material.buckling;
  if (!rule || !(length > rule.referenceLength)) return material.compression;
  return material.compression * (rule.referenceLength / length) ** rule.exponent;
}

export function materialOf(id: string): Material {
  const material = MATERIAL_MAP[id];
  if (!material) {
    throw new Error(`알 수 없는 재료: ${id}`);
  }
  return material;
}

/** 퀴즈 카드용. 실습 팔레트에 없는 재료도 포함한다. */
export type QuizMaterial = {
  id: string;
  name: string;
  tension: number;
  compression: number;
  group: "tension" | "compression";
  fact: string;
  icon: string;
};

export const QUIZ_MATERIALS: QuizMaterial[] = [
  {
    id: "cable",
    name: "케이블",
    tension: 240,
    compression: 0,
    group: "tension",
    icon: "cable",
    fact: "강선을 묶은 케이블은 당길 때만 힘이 생깁니다. 압축 허용축력은 0입니다.",
  },
  {
    id: "rope",
    name: "로프",
    tension: 150,
    compression: 0,
    group: "tension",
    icon: "rope",
    fact: "섬유 로프는 인장 전용입니다. 누르면 접힐 뿐 압축력을 전달하지 못합니다.",
  },
  {
    id: "rebar",
    name: "철근",
    tension: 210,
    compression: 28,
    group: "tension",
    icon: "rebar",
    fact: "철근은 항복강도가 높아 인장에 쓰입니다. 세장하면 압축에서 좌굴합니다.",
  },
  {
    id: "wood",
    name: "나무",
    tension: 100,
    compression: 50,
    group: "tension",
    icon: "wood",
    fact: "이 모형의 나무는 인장 100N, 압축 50N으로 인장 쪽이 더 여유 있습니다.",
  },
  {
    id: "bamboo",
    name: "대나무",
    tension: 72,
    compression: 34,
    group: "tension",
    icon: "bamboo",
    fact: "대나무 섬유는 길이 방향 인장에 강하고, 압축에는 상대적으로 약합니다.",
  },
  {
    id: "concrete",
    name: "콘크리트",
    tension: 16,
    compression: 230,
    group: "compression",
    icon: "concrete",
    fact: "콘크리트는 압축에 강하고 인장에는 쉽게 갈라집니다. 그래서 인장 쪽에 철근을 넣습니다.",
  },
  {
    id: "castiron",
    name: "주철",
    tension: 30,
    compression: 180,
    group: "compression",
    icon: "castiron",
    fact: "주철은 취성이라 압축에는 강하지만 인장에는 갑자기 파괴됩니다.",
  },
  {
    id: "stone",
    name: "석재",
    tension: 12,
    compression: 200,
    group: "compression",
    icon: "stone",
    fact: "석조 아치와 기둥이 압축으로 서는 이유입니다. 당기면 이음이 벌어집니다.",
  },
  {
    id: "brick",
    name: "벽돌",
    tension: 10,
    compression: 140,
    group: "compression",
    icon: "brick",
    fact: "조적조는 압축 부재입니다. 인장력이 생기면 줄눈이 갈라집니다.",
  },
  {
    id: "glass",
    name: "유리",
    tension: 20,
    compression: 120,
    group: "compression",
    icon: "glass",
    fact: "유리는 표면의 미세 균열 때문에 인장에 약하고 압축에는 비교적 강합니다.",
  },
];
