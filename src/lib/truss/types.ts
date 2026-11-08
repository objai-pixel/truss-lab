export type Node = {
  id: number;
  x: number;
  y: number;
  /** 깊이. 값이 있으면 공간 트러스로 푼다. 평면 모델은 이 필드를 두지 않는다. */
  z?: number;
};

export type Member = {
  id: number;
  i: number;
  j: number;
  materialId: string;
};

/** 핀은 수평·수직을 모두 막고, rollerY는 수직만, rollerX는 수평만 막는다. 볼은 공간의 세 방향, 홈은 수직과 깊이를 막는다. */
export type SupportType = "pin" | "rollerY" | "rollerX" | "ball" | "slot";

export type Support = {
  nodeId: number;
  type: SupportType;
};

/** 외력. +x 오른쪽, +y 위, +z 깊이. 중력 방향 하중은 fy가 음수다. */
export type Load = {
  nodeId: number;
  fx: number;
  fy: number;
  fz?: number;
};

export type TrussModel = {
  nodes: Node[];
  members: Member[];
  supports: Support[];
  loads: Load[];
};

export type MemberForce = {
  memberId: number;
  axial: number;
  allowTension: number;
  allowCompression: number;
  overstressed: boolean;
  /** 허용축력 대비 사용률. 인장은 N/Ta, 압축은 |N|/Ca. */
  ratio: number;
  mode: "tension" | "compression" | "zero";
};

export type Reaction = {
  nodeId: number;
  rx: number;
  ry: number;
  rz?: number;
};

export type Analysis = {
  status: "ok" | "overstressed" | "unstable" | "invalid";
  message: string;
  classification: "determinate" | "indeterminate" | "unstable" | "invalid";
  method: "joints" | "stiffness" | "none";
  forces: MemberForce[];
  reactions: Reaction[];
  failures: {
    memberId: number;
    axial: number;
    limit: number;
    mode: "tension" | "compression";
  }[];
  counts: { j: number; m: number; r: number };
  /** 공간 트러스면 정정 조건이 m + r = 3j 다. */
  space?: boolean;
  /** 하중이 전부 지점 절점에만 있어 부재 축력이 생기지 않는 경우 */
  loadOnSupportsOnly: boolean;
};
