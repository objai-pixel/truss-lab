"use client";

import { useEffect, useState, type ReactNode } from "react";
import { analyze } from "@/lib/truss/solver";
import { createVariationSet, VARIATION_SET_SIZE, type VariationQuestion } from "@/lib/truss/variation";
import { loadWrongs, removeWrong, saveWrong, subscribeWrongs, type WrongNote } from "@/lib/truss/wrong-note";
import type { Analysis } from "@/lib/truss/types";

export function VariationQuiz() {
  const [questions, setQuestions] = useState(() => createVariationSet());
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [missed, setMissed] = useState(0);
  const question = questions[index];
  const finished = index >= questions.length;

  function submit() {
    if (!question || !picked || revealed) return;
    setRevealed(true);
    setAnswered((value) => value + 1);
    if (picked === question.answer) {
      setCorrectCount((value) => value + 1);
      return;
    }
    saveWrong(question, picked);
    setMissed((value) => value + 1);
  }

  function next() {
    setIndex((value) => value + 1);
    setPicked(null);
    setRevealed(false);
    setHintOpen(false);
  }

  function anotherSet() {
    setQuestions(createVariationSet());
    setIndex(0);
    setPicked(null);
    setRevealed(false);
    setHintOpen(false);
    setCorrectCount(0);
    setAnswered(0);
    setMissed(0);
  }

  if (finished) {
    return (
      <section className="photo-quiz">
        <header className="quiz-score">
          <div>
            <p className="kicker">변형 문제</p>
            <h2>이번 6문제를 모두 풀었습니다.</h2>
          </div>
          <p>
            {correctCount} / {answered} 정답
          </p>
        </header>
        <p>
          {missed > 0
            ? `틀린 ${missed}문제는 오답노트에 모아 두었습니다. 다음 6문제는 치수와 하중이 달라집니다.`
            : "여섯 문제를 모두 맞혔습니다. 다음 세트는 치수와 하중이 달라집니다."}
        </p>
        <button type="button" onClick={anotherSet}>
          다른 6문제
        </button>
      </section>
    );
  }

  return (
    <QuestionPlay
      question={question}
      kicker={`변형 문제 · ${index + 1} / ${VARIATION_SET_SIZE}`}
      picked={picked}
      revealed={revealed}
      hintOpen={hintOpen}
      correctCount={correctCount}
      answered={answered}
      onPick={setPicked}
      onHint={() => setHintOpen((value) => !value)}
      onSubmit={submit}
      onNext={next}
      nextLabel={index + 1 === questions.length ? "결과 보기" : "다음 문제"}
    />
  );
}

export function WrongNote() {
  const [notes, setNotes] = useState<WrongNote[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setNotes(loadWrongs());
    refresh();
    return subscribeWrongs(refresh);
  }, []);

  const active = notes.find((note) => note.key === activeKey) ?? null;

  if (active) {
    return (
      <WrongReplay
        note={active}
        onBack={() => setActiveKey(null)}
        onResolved={(key) => {
          setNotes(removeWrong(key));
          setActiveKey(null);
        }}
        onMissed={(question, picked) => setNotes(saveWrong(question, picked))}
      />
    );
  }

  return (
    <section className="photo-quiz">
      <header className="quiz-score">
        <div>
          <p className="kicker">오답노트</p>
          <h2>{notes.length > 0 ? `틀린 변형 문제 ${notes.length}개` : "아직 틀린 문제가 없습니다."}</h2>
        </div>
      </header>
      {notes.length === 0 ? (
        <p>변형 문제를 풀다가 틀리면 여기에 모입니다. 다시 풀어 맞히면 노트에서 빠집니다.</p>
      ) : (
        <div className="wrong-list">
          {notes.map((note) => (
            <button key={note.key} type="button" onClick={() => setActiveKey(note.key)}>
              <strong>{note.question.ask}</strong>
              <small>
                지난 선택 {note.picked} · 정답은 다시 풀 때 확인합니다
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function WrongReplay({
  note,
  onBack,
  onResolved,
  onMissed,
}: {
  note: WrongNote;
  onBack: () => void;
  onResolved: (key: string) => void;
  onMissed: (question: VariationQuestion, picked: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const correct = picked === note.question.answer;

  function submit() {
    if (!picked || revealed) return;
    setRevealed(true);
    if (picked === note.question.answer) return;
    onMissed(note.question, picked);
  }

  return (
    <QuestionPlay
      question={note.question}
      kicker="오답노트"
      picked={picked}
      revealed={revealed}
      hintOpen={hintOpen}
      correctCount={0}
      answered={0}
      onPick={setPicked}
      onHint={() => setHintOpen((value) => !value)}
      onSubmit={submit}
      onNext={() => (correct ? onResolved(note.key) : onBack())}
      nextLabel={correct ? "노트에서 빼기" : "목록으로"}
      showScore={false}
      extraAction={
        revealed ? undefined : (
          <button type="button" className="text-button" onClick={onBack}>
            목록으로
          </button>
        )
      }
    />
  );
}

function QuestionPlay({
  question,
  kicker,
  picked,
  revealed,
  hintOpen,
  correctCount,
  answered,
  onPick,
  onHint,
  onSubmit,
  onNext,
  nextLabel,
  showScore = true,
  extraAction,
}: {
  question: VariationQuestion;
  kicker: string;
  picked: string | null;
  revealed: boolean;
  hintOpen: boolean;
  correctCount: number;
  answered: number;
  onPick: (choice: string) => void;
  onHint: () => void;
  onSubmit: () => void;
  onNext: () => void;
  nextLabel: string;
  showScore?: boolean;
  extraAction?: ReactNode;
}) {
  const correct = picked === question.answer;
  const analysis = revealed ? analyze(question.model) : null;
  return (
    <section className="photo-quiz">
      <header className="quiz-score">
        <div>
          <p className="kicker">{kicker}</p>
          <h2>{question.ask}</h2>
        </div>
        {showScore ? (
          <p>
            {correctCount} / {answered} 정답
            {revealed ? <span className={correct ? "good" : "bad"}>{correct ? " 맞았습니다" : " 다시 보세요"}</span> : null}
          </p>
        ) : revealed ? (
          <p className={correct ? "good" : "bad"}>{correct ? "맞았습니다" : "다시 보세요"}</p>
        ) : null}
      </header>
      <VariationFigure question={question} analysis={analysis} />
      <p className="note">{question.note}</p>
      <div className="options photo-choices">
        {question.choices.map((choice) => {
          const mark = revealed && choice === question.answer ? " right" : revealed && choice === picked ? " wrong" : "";
          const selected = !revealed && choice === picked ? " on" : "";
          return (
            <button key={choice} type="button" className={`photo-choice${selected}${mark}`} disabled={revealed} onClick={() => onPick(choice)}>
              {choice}
            </button>
          );
        })}
      </div>
      <div className="row-actions">
        <button type="button" className="text-button" onClick={onHint}>
          {hintOpen ? "힌트 닫기" : "힌트 보기"}
        </button>
        {extraAction}
        {revealed ? (
          <button type="button" onClick={onNext}>
            {nextLabel}
          </button>
        ) : (
          <button type="button" disabled={picked === null} onClick={onSubmit}>
            정답 확인
          </button>
        )}
      </div>
      {hintOpen ? <p className="hint-box">힌트. {question.hint}</p> : null}
      {revealed ? (
        <article className="explain-card">
          <h3>풀이</h3>
          <p>{correct ? "계산한 축력과 같은 보기입니다." : `정답은 ${question.answer}입니다.`}</p>
          <ol>
            {question.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      ) : null}
    </section>
  );
}

function VariationFigure({ question, analysis }: { question: VariationQuestion; analysis: Analysis | null }) {
  const pad = 48;
  const scale = 26;
  const maxX = Math.max(...question.model.nodes.map((node) => node.x));
  const maxY = Math.max(...question.model.nodes.map((node) => node.y));
  const width = pad * 2 + maxX * scale;
  const height = pad * 2 + maxY * scale + 28;
  const sx = (x: number) => pad + x * scale;
  const sy = (y: number) => pad + 16 + (maxY - y) * scale;
  const forceOf = (id: number) => analysis?.forces.find((force) => force.memberId === id);

  return (
    <figure className="photo-frame">
      <svg className="variation-figure" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="변형 문제 트러스">
        {question.model.members.map((member) => {
          const a = question.model.nodes.find((node) => node.id === member.i);
          const b = question.model.nodes.find((node) => node.id === member.j);
          if (!a || !b) return null;
          const force = forceOf(member.id);
          const focus = member.id === question.focusMemberId;
          const tone = force ? force.mode : focus ? "focus" : "plain";
          return <line key={member.id} x1={sx(a.x)} y1={sy(a.y)} x2={sx(b.x)} y2={sy(b.y)} className={`variation-member ${tone}`} />;
        })}
        {question.model.loads.map((load) => {
          const node = question.model.nodes.find((item) => item.id === load.nodeId);
          if (!node || load.fy >= 0) return null;
          const x = sx(node.x);
          const y = sy(node.y);
          return (
            <g key={`load-${load.nodeId}`} className="variation-load">
              <line x1={x} y1={y - 34} x2={x} y2={y - 14} />
              <path d={`M${x - 4} ${y - 18} L${x} ${y - 10} L${x + 4} ${y - 18}`} />
              <text x={x + 6} y={y - 24}>
                {-load.fy}kN
              </text>
            </g>
          );
        })}
        {question.model.supports.map((support) => {
          const node = question.model.nodes.find((item) => item.id === support.nodeId);
          if (!node) return null;
          const x = sx(node.x);
          const y = sy(node.y);
          return (
            <g key={`support-${support.nodeId}`} className="variation-support">
              <path d={`M${x} ${y + 2} L${x - 8} ${y + 16} L${x + 8} ${y + 16} Z`} />
              {support.type === "rollerY" ? <line x1={x - 10} y1={y + 20} x2={x + 10} y2={y + 20} /> : null}
            </g>
          );
        })}
        {question.model.nodes.map((node) => (
          <g key={node.id}>
            <circle cx={sx(node.x)} cy={sy(node.y)} r="4.5" className="variation-joint" />
            <text x={sx(node.x) + 7} y={sy(node.y) - 8} className="variation-label">
              {question.labels[node.id]}
            </text>
          </g>
        ))}
      </svg>
    </figure>
  );
}
