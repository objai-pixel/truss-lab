"use client";

import { useState } from "react";
import { PHOTO_QUESTIONS } from "@/lib/truss/photo-quiz";

export function PhotoQuiz() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answered, setAnswered] = useState(0);
  const question = PHOTO_QUESTIONS[index];
  const finished = index >= PHOTO_QUESTIONS.length;

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
            <p className="kicker">사진 문제</p>
            <h2>사진 {PHOTO_QUESTIONS.length}장을 모두 읽었습니다.</h2>
          </div>
          <p>
            {correctCount} / {answered} 정답
          </p>
        </header>
        <p>형식은 사진 속 부재가 만나는 방식으로 읽었습니다. 힌트를 열지 않고도 풀 수 있고, 풀이는 답을 확인한 뒤에만 나옵니다.</p>
        <button type="button" onClick={restart}>
          처음부터
        </button>
      </section>
    );
  }

  const correct = picked === question.answer;

  return (
    <section className="photo-quiz">
      <header className="quiz-score">
        <div>
          <p className="kicker">사진 문제 · {index + 1} / {PHOTO_QUESTIONS.length}</p>
          <h2>{question.ask}</h2>
        </div>
        <p>
          {correctCount} / {answered} 정답
          {revealed ? <span className={correct ? "good" : "bad"}>{correct ? " 맞았습니다" : " 다시 보세요"}</span> : null}
        </p>
      </header>
      <figure className="photo-frame">
        <img src={question.image} alt={question.alt} />
      </figure>
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
            {index + 1 === PHOTO_QUESTIONS.length ? "결과 보기" : "다음 문제"}
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
          <p>{correct ? "고른 형식이 이 사진의 읽기와 같습니다." : `이 사진의 형식은 ${question.answer}입니다.`}</p>
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
