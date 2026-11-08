import type { Load, Node, Support } from "./types";

export type StageLoad = Load & { label: string };

export type Stage = {
  id: number;
  title: string;
  kicker: string;
  budget: number;
  story: string;
  objective: string;
  hint: string;
  nodes: Node[];
  fixedNodeIds: number[];
  supports: Support[];
  staticLoads: StageLoad[];
  car: { road: number[]; weight: number; samples: number } | null;
  /** 책 하중 경진. 재료 팔레트와 채점이 일반 단계와 다르다. */
  contest?: boolean;
  bookNodeId?: number;
};

export const BOOK_NEWTON = 20;

/** 계곡 배경의 왼쪽·오른쪽 언덕이 만나는 교대. 그림과 초기 절점이 이 좌표를 함께 쓴다. */
export const VALLEY_LEFT = 2;
export const VALLEY_RIGHT = 10;

export const STAGES: Stage[] = [
  {
    id: 1,
    title: "가운데 떨어지는 돌",
    kicker: "1단계 · 삼각형",
    budget: 88,
    story:
      "폭 8m 계곡입니다. 왼쪽 언덕 끝은 핀, 오른쪽 언덕 끝은 수직 롤러이고, 골짜기 한가운데 절점 위로 60N 돌이 떨어집니다. 세 절점은 그림의 언덕과 골짜기에 이미 놓여 있습니다.",
    objective: "돌이 부재를 부러뜨리지 않게, 예산 88 안에서 트러스를 완성하세요.",
    hint: "밑의 세 점이 한 직선이면 삼각형이 없어 무너집니다. 위로 꼭짓점을 올리세요. 가운데 수직재는 인장(케이블·철근), 빗재는 압축(나무·콘크리트)인 경우가 많습니다. 높이를 키우면 빗재 압축이 줄어들지만 길이가 늘어 비용도 늘어납니다.",
    nodes: [
      { id: 1, x: VALLEY_LEFT, y: 0 },
      { id: 2, x: VALLEY_RIGHT, y: 0 },
      { id: 3, x: (VALLEY_LEFT + VALLEY_RIGHT) / 2, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 2, type: "rollerY" },
    ],
    staticLoads: [{ nodeId: 3, fx: 0, fy: -60, label: "돌 60N" }],
    car: null,
  },
  {
    id: 2,
    title: "두 곳의 돌",
    kicker: "2단계 · 두 절점",
    budget: 150,
    story: "같은 8m 계곡입니다. 왼쪽 언덕에서 2m, 6m, 골짜기 위에 55N 돌이 하나씩 떨어집니다.",
    objective: "두 하중을 동시에 견디세요. 예산은 150입니다.",
    hint: "하중 절점마다 위를 향한 삼각형을 만들고, 위쪽을 잇는 상현재가 필요합니다. 수직재는 대개 인장, 바깥 빗재는 압축입니다. 식의 개수가 모자라면(m + r < 2j) 계산 전에 무너집니다.",
    nodes: [
      { id: 1, x: VALLEY_LEFT, y: 0 },
      { id: 2, x: VALLEY_RIGHT, y: 0 },
      { id: 3, x: VALLEY_LEFT + 2, y: 0 },
      { id: 4, x: VALLEY_LEFT + 6, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3, 4],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 2, type: "rollerY" },
    ],
    staticLoads: [
      { nodeId: 3, fx: 0, fy: -55, label: "돌 55N" },
      { nodeId: 4, fx: 0, fy: -55, label: "돌 55N" },
    ],
    car: null,
  },
  {
    id: 3,
    title: "무거운 쪽과 가벼운 쪽",
    kicker: "3단계 · 비대칭",
    budget: 150,
    story: "왼쪽 돌은 90N, 오른쪽 돌은 30N입니다. 모양이 대칭이어도 힘은 대칭이 아닙니다.",
    objective: "큰 하중 쪽 압축재가 먼저 항복하지 않게 재료를 나누세요. 예산 150.",
    hint: "왼쪽 빗재의 압축이 오른쪽보다 큽니다. 왼쪽만 콘크리트나 강관으로 올리고, 인장이 확실한 하단 현재는 케이블이 쌉니다. 전체를 강관으로 하면 예산을 넘기기 쉽습니다.",
    nodes: [
      { id: 1, x: VALLEY_LEFT, y: 0 },
      { id: 2, x: VALLEY_RIGHT, y: 0 },
      { id: 3, x: VALLEY_LEFT + 2, y: 0 },
      { id: 4, x: VALLEY_LEFT + 6, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3, 4],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 2, type: "rollerY" },
    ],
    staticLoads: [
      { nodeId: 3, fx: 0, fy: -90, label: "큰 돌 90N" },
      { nodeId: 4, fx: 0, fy: -30, label: "작은 돌 30N" },
    ],
    car: null,
  },
  {
    id: 4,
    title: "첫 번째 자동차",
    kicker: "4단계 · 이동 하중",
    budget: 176,
    story: "바닥 절점 0, 2, 4, 6, 8m가 도로입니다. 80N 자동차가 왼쪽 끝에서 오른쪽 끝까지 지나갑니다. 하중은 항상 가장 가까운 두 절점에만 나뉩니다.",
    objective: "경로 전체에서 한 번도 파괴되지 않아야 합니다. 예산 176.",
    hint: "자동차가 움직이는 동안 같은 부재가 인장과 압축을 번갈아 받을 수 있습니다. 그런 부재에 케이블을 쓰면, 압축이 되는 순간 실패합니다. 부호가 바뀌는 부재는 나무·강관처럼 양쪽 허용축력이 있는 재료를 쓰세요.",
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 2, y: 0 },
      { id: 3, x: 4, y: 0 },
      { id: 4, x: 6, y: 0 },
      { id: 5, x: 8, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3, 4, 5],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 5, type: "rollerY" },
    ],
    staticLoads: [],
    car: { road: [1, 2, 3, 4, 5], weight: 80, samples: 16 },
  },
  {
    id: 5,
    title: "벽에서 나온 전망대",
    kicker: "5단계 · 캔틸레버",
    budget: 76,
    story:
      "왼쪽 벽의 아래 절점은 핀, 위 절점은 수평만 막는 롤러입니다. 두 반력이 짝힘이 되어 모멘트를 받습니다. 끝 절점에 70N이 섭니다.",
    objective: "벽 밖으로 4m를 내민 트러스를 예산 76 안에 만드세요.",
    hint: "벽의 두 절점과 끝 절점, 삼각형 세 부재만으로도 정정이 될 수 있습니다. 끝으로 내려가는 빗재는 인장, 바닥 수평재는 압축인 경우가 많습니다. 케이블을 압축 부재에 넣지 마세요.",
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 0, y: 3 },
      { id: 3, x: 4, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 2, type: "rollerX" },
    ],
    staticLoads: [{ nodeId: 3, fx: 0, fy: -70, label: "사람+짐 70N" }],
    car: null,
  },
  {
    id: 6,
    title: "케이블을 가려 쓰라",
    kicker: "6단계 · 재료 배치",
    budget: 120,
    story: "8m 계곡 한가운데, 골짜기 위 절점에 100N 돌이 있습니다. 강관만 쓰면 예산이 터지고, 케이블만 쓰면 압축 부재가 풀립니다.",
    objective: "인장 부재와 압축 부재를 구분해서 가장 싼 안전한 재료를 고르세요. 예산 120.",
    hint: "가운데 수직재와 하현재는 인장인 경우가 많고, 상현재와 빗재는 압축인 경우가 많습니다. 시험 뒤 해설의 부호를 보고 재료를 바꿔 다시 시험해 보세요. 절점법 순서: 반력 → 미지부재가 2개 이하인 절점.",
    nodes: [
      { id: 1, x: VALLEY_LEFT, y: 0 },
      { id: 2, x: VALLEY_RIGHT, y: 0 },
      { id: 3, x: (VALLEY_LEFT + VALLEY_RIGHT) / 2, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 2, type: "rollerY" },
    ],
    staticLoads: [{ nodeId: 3, fx: 0, fy: -100, label: "돌 100N" }],
    car: null,
  },
  {
    id: 7,
    title: "트럭과 한가운데 돌",
    kicker: "7단계 · 종합",
    budget: 188,
    story:
      "도로 위에 120N 트럭이 지나가는 동안, 한가운데 절점에는 50N 돌이 계속 올라가 있습니다. 두 하중이 동시에 작용합니다.",
    objective: "트럭이 어디 있든 파괴되지 않는 트러스를 예산 188 안에 만드세요. 효율이 낮으면 통과하지 못합니다.",
    hint: "이동 하중의 포락을 생각하세요. 어떤 부재는 트럭 위치에 따라 부호가 바뀝니다. 그 부재는 케이블이 될 수 없습니다. 항상 인장인 하현재에만 케이블을 쓰고, 압축이 큰 상현재는 콘크리트나 강관으로 막으세요. 높이를 2~3m로 잡으면 축력과 길이의 균형이 좋습니다.",
    nodes: [
      { id: 1, x: 0, y: 0 },
      { id: 2, x: 2, y: 0 },
      { id: 3, x: 4, y: 0 },
      { id: 4, x: 6, y: 0 },
      { id: 5, x: 8, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3, 4, 5],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 5, type: "rollerY" },
    ],
    staticLoads: [{ nodeId: 3, fx: 0, fy: -50, label: "돌 50N" }],
    car: { road: [1, 2, 3, 4, 5], weight: 120, samples: 16 },
  },
  {
    id: 8,
    title: "책 하중 경진",
    kicker: "경진 · 책 하중",
    budget: 120,
    contest: true,
    bookNodeId: 3,
    story:
      "폭 6m 책상입니다. 왼쪽은 핀, 오른쪽은 수직 롤러이고, 한가운데 절점에 책을 올립니다. 종이, 스파게티, 수수깡만 쓸 수 있습니다. 종이는 인장만 받고, 면과 수수깡은 길수록 압축에서 좌굴합니다.",
    objective: "삼각형으로 하중을 나누고, 더 적은 재료비로 책을 버티세요. 점수는 견딘 무게 ÷ 재료비입니다.",
    hint: "가운데 절점 위로 꼭짓점을 올리면 삼각형이 됩니다. 빗부재는 압축인 경우가 많아 종이를 쓰면 접힙니다. 스파게티와 수수깡은 길면 허용축력이 줄어드니 짧게 나누세요. 당기기만 하는 아래 부재에는 싼 종이를 쓰세요.",
    nodes: [
      { id: 1, x: 3, y: 0 },
      { id: 2, x: 9, y: 0 },
      { id: 3, x: 6, y: 0 },
    ],
    fixedNodeIds: [1, 2, 3],
    supports: [
      { nodeId: 1, type: "pin" },
      { nodeId: 2, type: "rollerY" },
    ],
    staticLoads: [],
    car: null,
  },
];

export function stageById(id: number): Stage {
  const stage = STAGES.find((item) => item.id === id);
  if (!stage) throw new Error(`없는 단계: ${id}`);
  return stage;
}
