"use client";

import { useState } from "react";
import { analyze } from "@/lib/truss/solver";
import { VARIATION_QUESTIONS, type VariationQuestion } from "@/lib/truss/variation";
import type { Analysis } from "@/lib/truss/types";

export function VariationQuiz() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answered, setAnswered] = useState(0);
  const question = VARIATION_QUESTIONS[index];
  const finished = index >= VARIATION_QUESTIONS.length;

  function submit() {
    if (!question || !picked || revealed) return;
    setRevealed(true);
    setAnswered((value) => value + 1);
    if (picked === question.answer) setCorrectCount((value) => value + 1);
  }

  function next() {
    setIndex((value) => value + 1);
    setPicked(null);
    setRevealed(false);
    setHintOpen(false);
  }

  function restart() {
    setIndex(0);
    setPicked(null);
    setRevealed(false);
    setHintOpen(false);
    setCorrectCount(0);
    setAnswered(0);
  }

  if (finished) {
    return (
      <section className="photo-quiz">
        <header className="quiz-score">
          <div>
            <p className="kicker">변형 문제</p>
            <h2>변형 문제 {VARIATION_QUESTIONS.length}개를 모두 풀었습니다.</h2>
          </div>
          <p>
            {correctCount} / {answered} 정답
          </p>
        </header>
        <p>단면의 모멘트와 전단, 영부재, 압축재 개수를 각각 확인했습니다. 힌트는 열지 않아도 되고, 풀이는 답을 확인한 뒤에 나옵니다.</p>
        <button type="button" onClick={restart}>
          처음부터
        </button>
      </section>
    );
  }

  const correct = picked === question.answer;
  const analysis = revealed ? analyze(question.model) : null;

  return (
    <section className="photo-quiz">
      <header className="quiz-score">
        <div>
          <p className="kicker">변형 문제 · {index + 1} / {VARIATION_QUESTIONS.length}</p>
          <h2>{question.ask}</h2>
        </div>
        <p>
          {correctCount} / {answered} 정답
          {revealed ? <span className={correct ? "good" : "bad"}>{correct ? " 맞았습니다" : " 다시 보세요"}</span> : null}
        </p>
      </header>
      <VariationFigure question={question} analysis={analysis} />
      <p className="note">{question.note}</p>
      <div className="options photo-choices">
        {question.choices.map((choice) => {
          const mark = revealed && choice === question.answer ? " right" : revealed && choice === picked ? " wrong" : "";
          const selected = !revealed && choice === picked ? " on" : "";
          return (
            <button key={choice} type="button" className={`photo-choice${selected}${mark}`} disabled={revealed} onClick={() => setPicked(choice)}>
              {choice}
            </button>
          );
        })}
      </div>
      <div className="row-actions">
        <button type="button" className="text-button" onClick={() => setHintOpen((value) => !value)}>
          {hintOpen ? "힌트 닫기" : "힌트 보기"}
        </button>
        {revealed ? (
          <button type="button" onClick={next}>
            {index + 1 === VARIATION_QUESTIONS.length ? "결과 보기" : "다음 문제"}
          </button>
        ) : (
          <button type="button" disabled={picked === null} onClick={submit}>
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
          return (
            <line
              key={member.id}
              x1={sx(a.x)}
              y1={sy(a.y)}
              x2={sx(b.x)}
              y2={sy(b.y)}
              className={`variation-member ${tone}`}
            />
          );
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
