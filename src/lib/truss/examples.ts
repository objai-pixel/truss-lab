import type { TrussModel } from "./types";

const depth = Math.sqrt(3);

export const TRIPOD_HEIGHT = 2;
export const TRIPOD_LOAD = 60;

/** 세 다리 삼각대. 꼭대기 연직하중 P, 다리 길이 L, 높이 h이면 각 부재 압축은 P·L/(3h)다. */
export const TRIPOD: TrussModel = {
  nodes: [
    { id: 1, x: 2, y: 0, z: 0 },
    { id: 2, x: -1, y: 0, z: depth },
    { id: 3, x: -1, y: 0, z: -depth },
    { id: 4, x: 0, y: TRIPOD_HEIGHT, z: 0 },
  ],
  members: [
    { id: 5, i: 1, j: 4, materialId: "tube" },
    { id: 6, i: 2, j: 4, materialId: "tube" },
    { id: 7, i: 3, j: 4, materialId: "tube" },
  ],
  supports: [
    { nodeId: 1, type: "ball" },
    { nodeId: 2, type: "ball" },
    { nodeId: 3, type: "ball" },
  ],
  loads: [{ nodeId: 4, fx: 0, fy: -TRIPOD_LOAD }],
};

export function tripodCompression(load = TRIPOD_LOAD, height = TRIPOD_HEIGHT): number {
  const length = Math.hypot(2, height);
  return (load * length) / (3 * height);
}
