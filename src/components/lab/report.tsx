"use client";

import { MATERIAL_MAP } from "@/lib/truss/materials";
import { formatForce, type Explanation } from "@/lib/truss/explain";
import type { Analysis, Member } from "@/lib/truss/types";

export function ForceReport({
  analysis,
  members,
  activeId,
  onPick,
}: {
  analysis: Analysis | null;
  members: Member[];
  activeId?: number | null;
  onPick?: (id: number) => void;
}) {
  if (!analysis) {
    return <p className="muted">절점과 부재를 올리면 안정성과 축력이 여기에 나타납니다.</p>;
  }
  const method =
    analysis.method === "joints" ? "절점법" : analysis.method === "stiffness" ? "직접강성법" : "판정만";
  return (
    <div className="report">
      <div className="badge-row">
        <span className={`badge status-${analysis.status}`}>{statusLabel(analysis.status)}</span>
        <span className="badge">{classLabel(analysis.classification)}</span>
        <span className="badge">{method}</span>
      </div>
      <p>{analysis.message}</p>
      <p className="muted">
        j={analysis.counts.j}, m={analysis.counts.m}, r={analysis.counts.r}. 정정 조건은 m + r = {analysis.space ? "3j" : "2j"} 입니다.
      </p>
      {analysis.forces.length > 0 ? (
        <ul className="force-list">
          {analysis.forces
            .slice()
            .sort((a, b) => b.ratio - a.ratio)
            .map((force) => {
              const member = members.find((item) => item.id === force.memberId);
              const material = member ? MATERIAL_MAP[member.materialId] : undefined;
              const ratio = Number.isFinite(force.ratio) ? Math.min(100, force.ratio * 100) : 100;
              return (
                <li key={force.memberId} className={activeId === force.memberId ? "active" : ""}>
                  <button type="button" onClick={() => onPick?.(force.memberId)}>
                    <span>
                      부재 {force.memberId} · {material?.name ?? "재료"}
                    </span>
                    <strong>{formatForce(force.axial)}</strong>
                    <span className="bar">
                      <i style={{ width: `${ratio}%` }} className={force.overstressed ? "over" : force.mode} />
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      ) : null}
    </div>
  );
}

export function ExplanationView({ explanation }: { explanation: Explanation }) {
  return (
    <article className="explain">
      <h3>{explanation.title}</h3>
      <p>{explanation.summary}</p>
      <p>{explanation.determinacy}</p>
      {explanation.reactions.length > 0 ? (
        <>
          <h4>반력</h4>
          <ol>
            {explanation.reactions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </>
      ) : null}
      {explanation.steps.map((step) => (
        <section key={`${step.nodeId}-${step.intro}`}>
          <h4>절점 {step.nodeId}</h4>
          <p>{step.intro}</p>
          {step.known.length > 0 ? <p className="muted">{step.known.join(" · ")}</p> : null}
          {step.equations.map((equation) => (
            <p key={equation} className="eq">
              {equation}
            </p>
          ))}
          <ul>
            {step.results.map((result) => (
              <li key={result}>{result}</li>
            ))}
          </ul>
        </section>
      ))}
      {explanation.leftover.map((line) => (
        <p key={line}>{line}</p>
      ))}
      <p className="note">{explanation.note}</p>
    </article>
  );
}

export function SolutionWalk({
  explanation,
  index,
  onIndex,
}: {
  explanation: Explanation;
  index: number;
  onIndex: (next: number) => void;
}) {
  const last = explanation.steps.length;
  const at = Math.max(0, Math.min(index, last));
  const step = at === 0 ? null : explanation.steps[at - 1];
  return (
    <article className="explain">
      <h3>{explanation.title}</h3>
      <p>{explanation.summary}</p>
      <div className="walk-bar">
        <button type="button" onClick={() => onIndex(at - 1)} disabled={at === 0}>
          이전
        </button>
        <span>
          {at === 0 ? "정정과 반력" : `절점 ${step?.nodeId}`} · {at + 1} / {last + 1}
        </span>
        <button type="button" onClick={() => onIndex(at + 1)} disabled={at >= last}>
          다음
        </button>
      </div>
      {step ? (
        <section>
          <p>{step.intro}</p>
          {step.known.length > 0 ? <p className="muted">{step.known.join(" · ")}</p> : null}
          {step.equations.map((equation) => (
            <p key={equation} className="eq">
              {equation}
            </p>
          ))}
          <ul>
            {step.results.map((result) => (
              <li key={result}>{result}</li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <p>{explanation.determinacy}</p>
          {explanation.reactions.length > 0 ? (
            <ol>
              {explanation.reactions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          ) : null}
        </>
      )}
      {at === last
        ? explanation.leftover.map((line) => (
            <p key={line}>{line}</p>
          ))
        : null}
      {at === last ? <p className="note">{explanation.note}</p> : null}
    </article>
  );
}

function statusLabel(status: Analysis["status"]): string {
  if (status === "ok") return "안전";
  if (status === "overstressed") return "파괴";
  if (status === "unstable") return "불안정";
  return "입력 오류";
}

function classLabel(classification: Analysis["classification"]): string {
  if (classification === "determinate") return "정정";
  if (classification === "indeterminate") return "부정정";
  if (classification === "unstable") return "기구";
  return "미완성";
}

export function hoverText(analysis: Analysis | null, member: Member | null): string | null {
  if (!member) return null;
  const material = MATERIAL_MAP[member.materialId];
  if (!analysis || analysis.status === "invalid") {
    return `${material?.name ?? "부재"} ${member.id}번`;
  }
  if (analysis.status === "unstable" || analysis.forces.length === 0) {
    return `${material?.name ?? "부재"} ${member.id}번 · 축력을 구할 수 없습니다`;
  }
  const force = analysis.forces.find((item) => item.memberId === member.id);
  if (!force || !material) return null;
  const allow = force.axial >= 0 ? force.allowTension : force.allowCompression;
  const ratio = allow <= 0 ? "허용 없음" : `허용 ${allow.toFixed(0)}N의 ${(Math.abs(force.axial) / allow * 100).toFixed(0)}%`;
  return `부재 ${member.id} · ${material.name}\n${formatForce(force.axial)}\n${ratio}`;
}
