import { isSpaceModel } from "./geometry";
import { compressionCapacity, materialOf } from "./materials";
import type { Analysis, Load, MemberForce, Reaction, TrussModel } from "./types";

const FORCE_EPS = 0.05;

export function memberSpan(model: TrussModel, memberIndex: number): number {
  const member = model.members[memberIndex];
  const a = model.nodes.find((node) => node.id === member.i);
  const b = model.nodes.find((node) => node.id === member.j);
  if (!a || !b) return 0;
  return Math.hypot(b.x - a.x, b.y - a.y, (b.z ?? 0) - (a.z ?? 0));
}

function loadMagnitude(load: Load): number {
  return Math.hypot(load.fx, load.fy, load.fz ?? 0);
}

export function completeAnalysis(
  model: TrussModel,
  classification: Analysis["classification"],
  method: Analysis["method"],
  axials: number[],
  reactions: Reaction[],
  counts: Analysis["counts"],
): Analysis {
  const space = isSpaceModel(model);
  const forces: MemberForce[] = [];
  const failures: Analysis["failures"] = [];
  for (let index = 0; index < model.members.length; index += 1) {
    const member = model.members[index];
    const material = materialOf(member.materialId);
    const axial = axials[index];
    const compression = compressionCapacity(material, memberSpan(model, index));
    let mode: MemberForce["mode"] = "zero";
    let ratio = 0;
    let overstressed = false;
    let limit = 0;
    if (axial > FORCE_EPS) {
      mode = "tension";
      limit = material.tension;
      ratio = limit <= 0 ? Number.POSITIVE_INFINITY : axial / limit;
      overstressed = axial > limit + FORCE_EPS;
      if (overstressed) failures.push({ memberId: member.id, axial, limit, mode: "tension" });
    } else if (axial < -FORCE_EPS) {
      mode = "compression";
      limit = compression;
      ratio = limit <= 0 ? Number.POSITIVE_INFINITY : -axial / limit;
      overstressed = -axial > limit + FORCE_EPS;
      if (overstressed) {
        failures.push({ memberId: member.id, axial, limit, mode: "compression" });
      }
    }
    forces.push({
      memberId: member.id,
      axial,
      allowTension: material.tension,
      allowCompression: compression,
      overstressed,
      ratio,
      mode,
    });
  }

  const meaningful = model.loads.filter((load) => loadMagnitude(load) > FORCE_EPS);
  const loadOnSupportsOnly =
    meaningful.length > 0 &&
    meaningful.every((load) =>
      model.supports.some((support) => support.nodeId === load.nodeId && (support.type === "pin" || support.type === "ball")),
    );

  if (failures.length > 0) {
    const worst = [...failures].sort((a, b) => Math.abs(b.axial) / Math.max(b.limit, 0.01) - Math.abs(a.axial) / Math.max(a.limit, 0.01))[0];
    const member = model.members.find((item) => item.id === worst.memberId);
    const material = member ? materialOf(member.materialId) : null;
    const kind = worst.mode === "tension" ? "인장" : "압축";
    return {
      status: "overstressed",
      message: `${material?.name ?? "부재"} ${worst.memberId}번 부재가 ${kind} ${Math.abs(worst.axial).toFixed(1)}N을 받아 허용 ${worst.limit.toFixed(0)}N을 넘었습니다.`,
      classification,
      method,
      forces,
      reactions,
      failures,
      counts,
      loadOnSupportsOnly,
      space,
    };
  }

  let message = "모든 부재가 허용축력 안에 있습니다.";
  if (meaningful.length === 0) message = "하중이 없습니다. 돌, 상자, 자동차를 올리면 축력이 생깁니다.";
  else if (loadOnSupportsOnly) {
    message = "하중이 고정 지점 위에만 있어 부재로 거의 전달되지 않습니다. 경간 사이의 절점에 올리세요.";
  }
  return {
    status: "ok",
    message,
    classification,
    method,
    forces,
    reactions,
    failures,
    counts,
    loadOnSupportsOnly,
    space,
  };
}
