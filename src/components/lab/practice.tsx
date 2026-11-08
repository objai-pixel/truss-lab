"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { designCost, evaluateContest, evaluateDesign, type Trial } from "@/lib/truss/evaluate";
import { explain } from "@/lib/truss/explain";
import { sampleRoad } from "@/lib/truss/geometry";
import { CONTEST_MATERIALS, MATERIALS } from "@/lib/truss/materials";
import { analyze } from "@/lib/truss/solver";
import { BOOK_NEWTON, STAGES, type Stage } from "@/lib/truss/stages";
import type { Load, Member, Node } from "@/lib/truss/types";
import { Board, type BoardPick, type BoardSelection } from "./board";
import { COLS, ROWS } from "./grid";
import { ExplanationView, ForceReport, hoverText } from "./report";
import { ScenePicker, stageScene, type SceneId } from "./scenes";

type Tool = "select" | "node" | "member" | "erase";

export function Practice({ stages = STAGES.filter((stage) => !stage.contest) }: { stages?: Stage[] }) {
  const [stageId, setStageId] = useState(stages[0]?.id ?? 1);
  const stage = stages.find((item) => item.id === stageId) ?? stages[0];
  const [build, setBuild] = useState(() => fresh(stage));
  const [tool, setTool] = useState<Tool>("node");
  const [selected, setSelected] = useState<BoardSelection | null>(null);
  const [note, setNote] = useState("");
  const [materialId, setMaterialId] = useState(stages[0]?.contest ? "skewer" : "wood");
  const [pending, setPending] = useState<number | null>(null);
  const [carT, setCarT] = useState(0);
  const [phase, setPhase] = useState<"build" | "run" | "done">("build");
  const [trial, setTrial] = useState<Trial | null>(null);
  const [targetT, setTargetT] = useState(1);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [hint, setHint] = useState(false);
  const [cleared, setCleared] = useState<number[]>([]);
  const [sceneChoice, setSceneChoice] = useState<SceneId | "mission">("mission");
  const [gridLock, setGridLock] = useState(false);
  const [books, setBooks] = useState(1);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const carRef = useRef(0);

  useEffect(() => {
    const raw = window.sessionStorage.getItem("truss-lab-cleared");
    if (!raw) return;
    const timer = window.setTimeout(() => {
      try {
        const parsed = JSON.parse(raw) as number[];
        if (Array.isArray(parsed)) setCleared(parsed.filter((id) => typeof id === "number"));
      } catch {
        window.sessionStorage.removeItem("truss-lab-cleared");
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const raw = window.localStorage.getItem("truss-lab-contest-best");
    if (!raw) return;
    const score = Number(raw);
    if (Number.isFinite(score)) setBestScore(score);
  }, []);

  useEffect(() => {
    if (stage.contest) {
      if (!CONTEST_MATERIALS.some((item) => item.id === materialId)) setMaterialId("skewer");
      return;
    }
    if (!MATERIALS.some((item) => item.id === materialId)) setMaterialId("wood");
  }, [stage, materialId]);

  useEffect(() => {
    if (phase !== "run") return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(targetT, carRef.current + dt / 6);
      carRef.current = next;
      setCarT(next);
      if (next >= targetT - 0.001) {
        setPhase("done");
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase, targetT]);

  const cost = designCost(build.nodes, build.members);
  const liveLoads = useMemo(
    () => loadsAt(stage, build.nodes, phase === "build" ? null : carT, books),
    [stage, build.nodes, phase, carT, books],
  );
  const analysis = useMemo(
    () => analyze({ nodes: build.nodes, members: build.members, supports: stage.supports, loads: phase === "build" ? [] : liveLoads }),
    [build, stage.supports, liveLoads, phase],
  );
  const shownLoads = phase === "build" && !stage.contest ? stage.staticLoads : liveLoads;
  const carSample = stage.car && phase !== "build" ? sampleRoad(build.nodes, stage.car.road, stage.car.weight, carT, stage.staticLoads) : null;
  const storyAnalysis = phase === "done" && trial?.worst ? trial.worst.analysis : analysis;
  const storyLoads = phase === "done" && trial?.worst ? loadsAt(stage, build.nodes, trial.worst.t, books) : liveLoads;
  const explanation = phase === "build" ? null : explain(
    { nodes: build.nodes, members: build.members, supports: stage.supports, loads: storyLoads },
    storyAnalysis,
  );
  const broken = phase !== "build" && (trial?.passed === false || analysis.status === "overstressed" || analysis.status === "unstable");

  function selectStage(next: Stage) {
    setStageId(next.id);
    setBuild(fresh(next));
    setPending(null);
    setPhase("build");
    setTrial(null);
    setCarT(0);
    setHint(false);
    setSelected(null);
    setNote("");
    setBooks(1);
  }

  const removeSelection = useCallback((target: BoardSelection) => {
    if (target.kind === "support" || target.kind === "weight") {
      setNote("미션의 지점과 하중은 지울 수 없습니다.");
      return;
    }
    if (target.kind === "node" && stage.fixedNodeIds.includes(target.id)) {
      setNote("그림에 놓인 절점은 미션 조건이라 지울 수 없습니다. 직접 놓은 절점과 부재만 지울 수 있습니다.");
      return;
    }
    if (target.kind === "member") {
      setBuild((current) => ({ ...current, members: current.members.filter((member) => member.id !== target.id) }));
      setNote("고른 부재만 지웠습니다.");
    } else {
      const id = target.id;
      setBuild((current) => ({
        ...current,
        nodes: current.nodes.filter((node) => node.id !== id),
        members: current.members.filter((member) => member.i !== id && member.j !== id),
      }));
      if (pending === id) setPending(null);
      setNote("고른 절점과 그 절점에 붙은 부재만 지웠습니다.");
    }
    setSelected(null);
  }, [pending, stage]);

  function onPick(pick: BoardPick) {
    if (phase === "run") return;
    if (tool === "select" || tool === "erase") {
      const target = singleTarget(pick);
      if (tool === "select") {
        setSelected(target);
        setNote(target ? "이 객체만 지우거나, 빈 곳을 눌러 선택을 해제하세요." : "선택을 해제했습니다.");
        return;
      }
      if (target) removeSelection(target);
      return;
    }
    if (tool === "node" && pick.grid && pick.nodeId === null) {
      if (pick.grid.x < 0 || pick.grid.x > COLS || pick.grid.y < 0 || pick.grid.y > ROWS) return;
      if (build.nodes.some((node) => Math.hypot(node.x - pick.grid!.x, node.y - pick.grid!.y) < 0.2)) return;
      setBuild((current) => ({
        ...current,
        nodes: [...current.nodes, { id: current.nextId, x: pick.grid!.x, y: pick.grid!.y }],
        nextId: current.nextId + 1,
      }));
    }
    if (tool === "member" && pick.nodeId !== null) {
      if (pending === null) setPending(pick.nodeId);
      else if (pending === pick.nodeId) setPending(null);
      else {
        const a = pending;
        const b = pick.nodeId;
        if (!build.members.some((member) => (member.i === a && member.j === b) || (member.i === b && member.j === a))) {
          setBuild((current) => ({
            ...current,
            members: [...current.members, { id: current.nextId, i: a, j: b, materialId }],
            nextId: current.nextId + 1,
          }));
        }
        setPending(null);
      }
    }
    if (tool === "member" && pick.memberId !== null && pick.nodeId === null) {
      setBuild((current) => ({
        ...current,
        members: current.members.map((member) => (member.id === pick.memberId ? { ...member, materialId } : member)),
      }));
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!selected) return;
      event.preventDefault();
      removeSelection(selected);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, removeSelection]);

  function runTest() {
    const result = stage.contest ? evaluateContest(stage, build.nodes, build.members, books) : evaluateDesign(stage, build.nodes, build.members);
    setTrial(result);
    if (result.passed && stage.contest && result.score > (bestScore ?? -1)) {
      setBestScore(result.score);
      window.localStorage.setItem("truss-lab-contest-best", String(result.score));
    }
    if (result.passed) {
      const next = Array.from(new Set([...cleared, stage.id]));
      setCleared(next);
      window.sessionStorage.setItem("truss-lab-cleared", JSON.stringify(next));
    }
    if (stage.car) {
      const failT = result.cases.find((item) => item.analysis.status !== "ok")?.t;
      carRef.current = 0;
      setCarT(0);
      setTargetT(failT ?? 1);
      setPhase("run");
    } else {
      setPhase("done");
    }
  }

  const palette = stage.contest ? CONTEST_MATERIALS : MATERIALS;
  const hoverMember = build.members.find((member) => member.id === hoverId) ?? null;
  const tip = phase === "build" ? null : hoverText(analysis, hoverMember);
  const scene = sceneChoice === "mission" ? stageScene(stage.id) : sceneChoice;
  const showGrid = gridLock || tool === "node";

  return (
    <div className="workspace">
      <aside className="panel tools">
        {stages.length > 1 ? (
          <div className="stage-pills">
            {stages.map((item) => (
              <button key={item.id} type="button" className={item.id === stage.id ? "on" : ""} onClick={() => selectStage(item)}>
                {item.id}
                {cleared.includes(item.id) ? " ★" : ""}
              </button>
            ))}
          </div>
        ) : null}
        <p className="kicker">{stage.kicker}</p>
        <h2>{stage.title}</h2>
        <p>{stage.story}</p>
        <p>
          <strong>{stage.objective}</strong>
        </p>
        <p className={cost > stage.budget ? "over-budget" : "budget"}>
          예산 {cost.toFixed(1)} / {stage.budget}
          {stage.contest && trial?.passed ? ` · 점수 ${trial.score.toFixed(2)}` : ""}
        </p>
        {stage.contest ? (
          <div className="contest-card">
            <strong>
              책 {books}권 · {books * BOOK_NEWTON}N
            </strong>
            <div className="row-actions">
              <button type="button" onClick={() => setBooks((value) => Math.max(1, value - 1))} disabled={phase === "run" || books <= 1}>
                한 권 빼기
              </button>
              <button type="button" onClick={() => setBooks((value) => Math.min(12, value + 1))} disabled={phase === "run" || books >= 12}>
                한 권 더
              </button>
            </div>
            <p>모형에서 책 1권은 {BOOK_NEWTON}N입니다. 한가운데 고정 절점에 실립니다.</p>
            {bestScore !== null ? <p>이 브라우저 최고 점수 {bestScore.toFixed(2)}</p> : null}
            <p>실물 대회</p>
            <ol>
              <li>두 지지대 사이에 경간을 둡니다.</li>
              <li>종이, 스파게티, 수수깡을 삼각형이 되게 잇고, 이음은 절점에만 둡니다.</li>
              <li>책은 부재 중간이 아니라 절점 위에 올립니다.</li>
              <li>한 권씩 더하고, 처음 부러지거나 접히는 부재에서 멈춥니다.</li>
              <li>점수는 버틴 책 무게를 재료비로 나눈 값입니다.</li>
            </ol>
          </div>
        ) : null}
        <div className="tool-grid">
          {(
            [
              ["select", "선택"],
              ["node", "절점"],
              ["member", "부재"],
              ["erase", "지우기"],
            ] as Array<[Tool, string]>
          ).map(([id, label]) => (
            <button key={id} type="button" className={tool === id ? "on" : ""} onClick={() => setTool(id)}>
              {label}
            </button>
          ))}
        </div>
        {selected ? (
          <div className="row-actions">
            <span className="badge">{selectionLabel(selected)}</span>
            <button type="button" onClick={() => removeSelection(selected)}>
              이 객체 지우기
            </button>
          </div>
        ) : (
          <p className="muted">부재나 직접 놓은 절점을 하나만 골라 지우세요. 단계 다시는 미션을 처음부터 놓습니다.</p>
        )}
        {note ? <p className="note">{note}</p> : null}
        <div className="materials">
          {palette.map((material) => (
            <button key={material.id} type="button" className={materialId === material.id ? "on" : ""} onClick={() => setMaterialId(material.id)}>
              <i style={{ background: material.color }} />
              <span>
                <strong>{material.name}</strong>
                <small>
                  인 {material.tension} / 압 {material.buckling ? `${material.compression}N·짧을 때` : material.compression} · {material.costPerM}/m
                </small>
              </span>
            </button>
          ))}
        </div>
        <button type="button" className="primary" onClick={runTest} disabled={phase === "run"}>
          시험하기
        </button>
        <button type="button" onClick={() => selectStage(stage)}>
          이 단계 다시
        </button>
        <button type="button" className="text-button" onClick={() => setHint((value) => !value)}>
          {hint ? "힌트 접기" : "힌트"}
        </button>
        {hint ? <p className="note">{stage.hint}</p> : null}
      </aside>
      <div className="stage">
        <div className="stage-bar">
          <span>{phase === "build" ? "파란 테두리 절점은 고정입니다. 하중은 시험 때 절점에만 작용합니다." : trial?.title}</span>
        </div>
        <div className="board-options">
          <ScenePicker value={sceneChoice} onChange={setSceneChoice} includeMission />
          <button
            type="button"
            className={gridLock ? "on" : ""}
            aria-pressed={gridLock}
            title="절점을 놓을 때는 격자가 항상 보입니다. 다른 도구에서도 보려면 켜 두세요."
            onClick={() => setGridLock((value) => !value)}
          >
            격자 항상 표시
          </button>
        </div>
        <Board
          nodes={build.nodes}
          members={build.members}
          supports={stage.supports}
          loads={shownLoads}
          analysis={phase === "build" ? null : analysis}
          car={carSample ? { x: carSample.x, y: carSample.y } : null}
          carPath={stage.car?.road ?? []}
          pendingNodeId={pending}
          hoverMemberId={hoverId}
          fixedNodeIds={stage.fixedNodeIds}
          ghostLoads={phase === "build"}
          showStones={phase !== "build" && stage.staticLoads.length > 0}
          showGrid={showGrid}
          scene={scene}
          selected={selected}
          onPick={onPick}
          onHoverMember={(id, point) => {
            setHoverId(id);
            setPointer(point);
          }}
        />
        {tip && pointer ? (
          <div className="tooltip" style={{ left: pointer.x + 14, top: pointer.y + 14 }}>
            {tip.split("\n").map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        ) : null}
        {broken && phase === "done" ? <p className="fail-banner">파괴되었습니다. 허용을 넘은 부재를 바꾸거나 높이와 배치를 조정하세요.</p> : null}
      </div>
      <aside className="panel readout">
        {trial ? (
          <>
            <h3 className={trial.passed ? "good" : "bad"}>{trial.title}</h3>
            <p>{trial.detail}</p>
          </>
        ) : (
          <>
            <p className="muted">부재를 올리고 시험하기를 누르면, 하중 경로 전체를 절점법(부정정이면 강성법)으로 검사합니다.</p>
            <p className="muted">
              지금 형태: {analyze({ nodes: build.nodes, members: build.members, supports: stage.supports, loads: [] }).message}
            </p>
          </>
        )}
        <ForceReport
          analysis={phase === "build" ? null : storyAnalysis}
          members={build.members}
          activeId={hoverId}
          onPick={setHoverId}
        />
        {phase !== "build" && explanation ? <ExplanationView explanation={explanation} /> : null}
      </aside>
    </div>
  );
}

function singleTarget(pick: BoardPick): BoardSelection | null {
  if (pick.weightId !== null) return { kind: "weight", id: pick.weightId };
  if (pick.supportNodeId !== null) return { kind: "support", id: pick.supportNodeId };
  if (pick.nodeId !== null) return { kind: "node", id: pick.nodeId };
  if (pick.memberId !== null) return { kind: "member", id: pick.memberId };
  return null;
}

function selectionLabel(target: BoardSelection): string {
  if (target.kind === "member") return `부재 ${target.id}`;
  if (target.kind === "node") return `절점 ${target.id}`;
  if (target.kind === "support") return `지점 ${target.id}`;
  return `하중 ${target.id}`;
}

function fresh(stage: Stage): { nodes: Node[]; members: Member[]; nextId: number } {
  return { nodes: stage.nodes.map((node) => ({ ...node })), members: [], nextId: 100 };
}

function loadsAt(stage: Stage, nodes: Node[], t: number | null, books: number): Load[] {
  if (stage.contest && stage.bookNodeId) {
    return [{ nodeId: stage.bookNodeId, fx: 0, fy: -Math.max(1, books) * BOOK_NEWTON }];
  }
  const extra: Load[] = stage.staticLoads.map(({ nodeId, fx, fy }) => ({ nodeId, fx, fy }));
  if (!stage.car || t === null) return extra;
  return sampleRoad(nodes, stage.car.road, stage.car.weight, t, extra)?.loads ?? extra;
}
