"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MaterialArt, TrussArt } from "./art";
import { analyze } from "@/lib/truss/solver";
import { PhotoQuiz } from "./photo-quiz";
import { VariationQuiz } from "./variation-quiz";
import { TRUSS_GUIDE, createQuiz, type MemberQuiz, type Quiz, type SortQuiz, type SpeedQuiz } from "@/lib/truss/quiz";
import type { TrussModel } from "@/lib/truss/types";

type Bin = "tension" | "compression";
type Lane = "variation" | "photo" | "drill";

export function QuizMode() {
  const [lane, setLane] = useState<Lane>("variation");
  const [quiz, setQuiz] = useState<Quiz>(() => createQuiz());
  const [phase, setPhase] = useState<"play" | "explain">("play");
  const [correctCount, setCorrectCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [paused, setPaused] = useState(false);
  const [placements, setPlacements] = useState<Record<string, Bin | undefined>>({});
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const answered = useRef(false);

  function finish(ok: boolean) {
    if (answered.current) return;
    answered.current = true;
    setLastCorrect(ok);
    setTotal((value) => value + 1);
    if (ok) setCorrectCount((value) => value + 1);
    setPhase("explain");
    setPaused(false);
  }

  function goNext() {
    answered.current = false;
    setPhase("play");
    setPaused(false);
    setPlacements({});
    setActiveCard(null);
    setPicked([]);
    setQuiz((current) => createQuiz(Math.random, current.kind));
  }

  function submitSort(current: SortQuiz) {
    const complete = current.cards.every((card) => placements[card.id]);
    if (!complete) return;
    finish(current.cards.every((card) => placements[card.id] === card.group));
  }

  return (
    <div className="quiz-layout">
      <div className="segmented">
        <button type="button" className={lane === "variation" ? "on" : ""} onClick={() => setLane("variation")}>
          변형 문제
        </button>
        <button type="button" className={lane === "photo" ? "on" : ""} onClick={() => setLane("photo")}>
          사진 문제
        </button>
        <button type="button" className={lane === "drill" ? "on" : ""} onClick={() => setLane("drill")}>
          연습 퀴즈
        </button>
      </div>
      {lane === "variation" ? <VariationQuiz /> : null}
      {lane === "photo" ? <PhotoQuiz /> : null}
      {lane === "drill" ? (
      <>
      <header className="quiz-score">
        <div>
          <p className="kicker">무작위 퀴즈</p>
          <h2>{quiz.prompt}</h2>
        </div>
        <p>
          {correctCount} / {total} 정답
          {phase === "explain" ? <span className={lastCorrect ? "good" : "bad"}>{lastCorrect ? " 맞았습니다" : " 다시 보세요"}</span> : null}
        </p>
      </header>
      {quiz.kind === "sort" ? (
        <SortPlay
          quiz={quiz}
          phase={phase}
          placements={placements}
          activeCard={activeCard}
          onActive={setActiveCard}
          onPlace={(bin) => {
            if (!activeCard || phase !== "play") return;
            setPlacements((current) => ({ ...current, [activeCard]: bin }));
          }}
          onSubmit={() => submitSort(quiz)}
        />
      ) : null}
      {quiz.kind === "speed" ? (
        <SpeedPlay key={quiz.id} quiz={quiz} phase={phase} locked={phase !== "play"} onPick={(kind) => finish(kind === quiz.figure)} onTimeout={() => finish(false)} />
      ) : null}
      {quiz.kind === "members" ? (
        <MemberPlay
          quiz={quiz}
          phase={phase}
          picked={picked}
          onToggle={(id) => {
            if (phase !== "play") return;
            setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
          }}
          onSubmit={() => {
            const same = picked.length === quiz.correctIds.length && quiz.correctIds.every((id) => picked.includes(id));
            finish(same);
          }}
        />
      ) : null}
      {phase === "explain" ? (
        <ExplainDock key={quiz.id} paused={paused} onPause={() => setPaused((value) => !value)} onNext={goNext}>
          <Explanation quiz={quiz} />
        </ExplainDock>
      ) : null}
      </>
      ) : null}
    </div>
  );
}

function SortPlay({
  quiz,
  phase,
  placements,
  activeCard,
  onActive,
  onPlace,
  onSubmit,
}: {
  quiz: SortQuiz;
  phase: "play" | "explain";
  placements: Record<string, Bin | undefined>;
  activeCard: string | null;
  onActive: (id: string) => void;
  onPlace: (bin: Bin) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="sort-board">
      <div className="card-row">
        {quiz.cards.map((card) => {
          const placed = placements[card.id];
          const reveal = phase === "explain";
          const right = placed === card.group;
          return (
            <button
              key={card.id}
              type="button"
              className={`quiz-card${activeCard === card.id ? " on" : ""}${reveal ? (right ? " right" : " wrong") : ""}`}
              onClick={() => onActive(card.id)}
            >
              <MaterialArt icon={card.icon} />
              <strong>{card.name}</strong>
              {quiz.showStats ? (
                <small>
                  인장 {card.tension}N · 압축 {card.compression}N
                </small>
              ) : (
                <small>{placed ? (placed === "tension" ? "인장 칸" : "압축 칸") : "카드를 고른 뒤 칸을 누르세요"}</small>
              )}
            </button>
          );
        })}
      </div>
      <div className="bins">
        <button type="button" onClick={() => onPlace("tension")}>
          인장에 강한 재료
        </button>
        <button type="button" onClick={() => onPlace("compression")}>
          압축에 강한 재료
        </button>
      </div>
      {phase === "play" ? (
        <button type="button" className="primary" onClick={onSubmit}>
          분류 확인
        </button>
      ) : null}
    </div>
  );
}

function ExplainDock({
  paused,
  onPause,
  onNext,
  children,
}: {
  paused: boolean;
  onPause: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const [secondsLeft, setSecondsLeft] = useState(12);
  const nextRef = useRef(onNext);
  useEffect(() => {
    nextRef.current = onNext;
  }, [onNext]);
  useEffect(() => {
    if (paused) return;
    if (secondsLeft <= 0) {
      nextRef.current();
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [paused, secondsLeft]);
  return (
    <section className="explain-card">
      {children}
      <div className="row-actions">
        <button type="button" className="primary" onClick={onNext}>
          해설 건너뛰고 다음
        </button>
        <button type="button" onClick={onPause}>
          {paused ? "자동 진행" : "해설 멈추기"}
        </button>
        <span className="muted">{paused ? "멈춰 있습니다." : `${secondsLeft}초 뒤 다음 문제`}</span>
      </div>
    </section>
  );
}

function SpeedPlay({
  quiz,
  phase,
  locked,
  onPick,
  onTimeout,
}: {
  quiz: SpeedQuiz;
  phase: "play" | "explain";
  locked: boolean;
  onPick: (kind: SpeedQuiz["figure"]) => void;
  onTimeout: () => void;
}) {
  const [remain, setRemain] = useState(quiz.seconds);
  const timeoutRef = useRef(onTimeout);
  const fired = useRef(false);
  useEffect(() => {
    timeoutRef.current = onTimeout;
  }, [onTimeout]);
  useEffect(() => {
    if (locked || fired.current) return;
    if (remain <= 0) {
      fired.current = true;
      timeoutRef.current();
      return;
    }
    const timer = window.setTimeout(() => setRemain((value) => Math.max(0, value - 0.1)), 100);
    return () => window.clearTimeout(timer);
  }, [locked, remain]);
  return (
    <div className="speed-board">
      <div className="timer" aria-label={`${remain.toFixed(0)}초`}>
        <i style={{ width: `${(remain / quiz.seconds) * 100}%` }} />
      </div>
      <TrussArt kind={quiz.figure} />
      <div className="options">
        {quiz.options.map((option) => (
          <button key={option} type="button" disabled={locked} className={phase === "explain" && option === quiz.figure ? "right" : ""} onClick={() => onPick(option)}>
            {TRUSS_GUIDE[option].name}
          </button>
        ))}
      </div>
    </div>
  );
}

function MemberPlay({
  quiz,
  phase,
  picked,
  onToggle,
  onSubmit,
}: {
  quiz: MemberQuiz;
  phase: "play" | "explain";
  picked: number[];
  onToggle: (id: number) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="member-quiz">
      <MemberFigure model={quiz.model} picked={picked} reveal={phase === "explain"} correct={quiz.correctIds} onToggle={onToggle} />
      {phase === "play" ? (
        <button type="button" className="primary" onClick={onSubmit}>
          선택 확인
        </button>
      ) : null}
    </div>
  );
}

function MemberFigure({
  model,
  picked,
  reveal,
  correct,
  onToggle,
}: {
  model: TrussModel;
  picked: number[];
  reveal: boolean;
  correct: number[];
  onToggle: (id: number) => void;
}) {
  const analysis = analyze(model);
  const xs = model.nodes.map((node) => node.x);
  const ys = model.nodes.map((node) => node.y);
  const minX = Math.min(...xs) - 0.7;
  const maxX = Math.max(...xs) + 0.7;
  const minY = Math.min(...ys) - 0.9;
  const maxY = Math.max(...ys) + 0.9;
  const width = 520;
  const height = 280;
  const sx = (x: number) => ((x - minX) / (maxX - minX)) * (width - 48) + 24;
  const sy = (y: number) => ((maxY - y) / (maxY - minY)) * (height - 48) + 24;
  return (
    <svg className="member-figure" viewBox={`0 0 ${width} ${height}`}>
      <rect width={width} height={height} className="art-paper" />
      {model.members.map((member) => {
        const a = model.nodes.find((node) => node.id === member.i);
        const b = model.nodes.find((node) => node.id === member.j);
        if (!a || !b) return null;
        const force = analysis.forces.find((item) => item.memberId === member.id);
        const chosen = picked.includes(member.id);
        const isCorrect = correct.includes(member.id);
        let color = "#2b241c";
        if (reveal && force?.mode === "tension") color = "#1d4e89";
        if (reveal && force?.mode === "compression") color = "#9d341f";
        if (reveal && force?.mode === "zero") color = "#8d8376";
        return (
          <g key={member.id} onClick={() => onToggle(member.id)} className="quiz-member">
            <line x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} stroke="transparent" strokeWidth="16" />
            <line
              x1={sx(a.x)}
              y1={sy(a.y)}
              x2={sx(b.x)}
              y2={sy(b.y)}
              stroke={color}
              strokeWidth={chosen ? 8 : 4}
              strokeDasharray={chosen && !reveal ? "7 4" : undefined}
            />
            <text x={(sx(a.x) + sx(b.x)) / 2} y={(sy(a.y) + sy(b.y)) / 2 - 8} className="member-tag">
              {member.id}
              {reveal && isCorrect ? " ●" : ""}
            </text>
          </g>
        );
      })}
      {model.supports.map((support) => {
        const node = model.nodes.find((item) => item.id === support.nodeId);
        if (!node) return null;
        return (
          <text key={support.nodeId} x={sx(node.x) - 8} y={sy(node.y) + 28} className="node-tag">
            {support.type === "pin" ? "핀" : "롤러"}
          </text>
        );
      })}
      {model.loads.map((load) => {
        const node = model.nodes.find((item) => item.id === load.nodeId);
        if (!node) return null;
        return (
          <text key={load.nodeId} x={sx(node.x) - 10} y={sy(node.y) - 18} className="load-tag">
            {Math.abs(load.fy).toFixed(0)}N
          </text>
        );
      })}
      {model.nodes.map((node) => (
        <circle key={node.id} cx={sx(node.x)} cy={sy(node.y)} r="6" className="quiz-node" />
      ))}
    </svg>
  );
}

function Explanation({ quiz }: { quiz: Quiz }) {
  if (quiz.kind === "sort") {
    return (
      <div>
        <h3>재료는 허용축력이 큰 쪽으로 분류했습니다</h3>
        <ul>
          {quiz.cards.map((card) => (
            <li key={card.id}>
              <strong>{card.name}</strong> — {card.group === "tension" ? "인장에 강함" : "압축에 강함"}. {card.fact} 이 카드는 인장 {card.tension}N, 압축 {card.compression}N입니다.
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (quiz.kind === "speed") {
    const guide = TRUSS_GUIDE[quiz.figure];
    return (
      <div>
        <h3>{guide.name}</h3>
        <p>{guide.tell}</p>
        <p>{guide.why}</p>
        <p className="muted">하우는 경사재가 중앙을 향해 위로 올라가고, 프랫은 아래로 내려갑니다. 와렌은 수직재 없는 삼각형의 반복, 킹포스트는 수직재 하나, 퀸포스트는 수직재 둘입니다.</p>
      </div>
    );
  }
  const analysis = analyze(quiz.model);
  return (
    <div>
      <h3>{quiz.ask === "tension" ? "인장 부재" : "압축 부재"}</h3>
      <p>{quiz.blurb}</p>
      <ul>
        {analysis.forces.map((force) => (
          <li key={force.memberId}>
            부재 {force.memberId}: {force.mode === "tension" ? "인장" : force.mode === "compression" ? "압축" : "영부재"} {Math.abs(force.axial).toFixed(1)}N
            {quiz.correctIds.includes(force.memberId) ? " · 정답" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
