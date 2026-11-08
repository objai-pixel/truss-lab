"use client";

import { useState } from "react";
import { STAGES } from "@/lib/truss/stages";
import { Calculator } from "./calculator";
import { Lesson } from "./lesson";
import { Practice } from "./practice";
import { QuizMode } from "./quiz-mode";

type Mode = "calc" | "practice" | "contest" | "quiz";

const CONTEST_STAGES = STAGES.filter((stage) => stage.contest);

const MODES: Record<Mode, { label: string; copy: string }> = {
  calc: {
    label: "트러스 계산기",
    copy: "절점과 부재를 놓고 축력을 확인합니다. 공간 모드에서는 세 방향 힘과 계산 과정을 함께 봅니다.",
  },
  practice: {
    label: "실습",
    copy: "예산 안에서 단계별 미션을 설계합니다.",
  },
  contest: {
    label: "경진 대비",
    copy: "종이, 스파게티, 수수깡으로 책 하중을 버티는 연습을 합니다. 점수는 견딘 무게를 재료비로 나눈 값입니다.",
  },
  quiz: {
    label: "퀴즈",
    copy: "변형 문제는 6개씩 새로 나오고, 틀린 문제는 오답노트에 모입니다. 사진 문제와 재료 연습도 있습니다. 힌트는 원할 때 열고, 풀이는 답을 확인한 뒤에 나옵니다.",
  },
};

export function Lab() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [opened, setOpened] = useState<{ calc: boolean; practice: boolean; contest: boolean; quiz: boolean }>({
    calc: false,
    practice: false,
    contest: false,
    quiz: false,
  });
  const [lesson, setLesson] = useState(false);

  function open(next: Mode) {
    setOpened((current) => ({ ...current, [next]: true }));
    setMode(next);
  }

  return (
    <div className="lab">
      {mode === null ? (
        <Gate onOpen={open} />
      ) : (
        <>
          <header className="topbar">
            <div className="brand">
              <p className="kicker">건축구조 · 모형 실습실</p>
              <h1>{MODES[mode].label}</h1>
              <p>{MODES[mode].copy}</p>
            </div>
            <div className="mode-switch">
              <button type="button" onClick={() => setMode(null)}>
                처음으로
              </button>
              <button type="button" className="text-button" onClick={() => setLesson(true)}>
                절점법 수업
              </button>
            </div>
          </header>
        </>
      )}
      {opened.calc ? (
        <div hidden={mode !== "calc"}>
          <Calculator />
        </div>
      ) : null}
      {opened.practice ? (
        <div hidden={mode !== "practice"}>
          <Practice />
        </div>
      ) : null}
      {opened.contest ? (
        <div hidden={mode !== "contest"}>
          <Practice stages={CONTEST_STAGES} />
        </div>
      ) : null}
      {opened.quiz ? (
        <div hidden={mode !== "quiz"}>
          <QuizMode />
        </div>
      ) : null}
      {mode !== null ? (
        <footer className="colophon">
          격자 한 칸은 1m, 힘은 N인 교육용 모형입니다. 인장은 파랑, 압축은 적색입니다. 부재가 허용축력을 넘기면 파괴되고, 견디면 커서를 올린 부재의 축력이 나타납니다.
        </footer>
      ) : null}
      <Lesson open={lesson} onClose={() => setLesson(false)} />
    </div>
  );
}

function Gate({ onOpen }: { onOpen: (mode: Mode) => void }) {
  return (
    <section className="gate">
      <div className="brand">
        <p className="kicker">건축구조 · 모형 실습실</p>
        <h1>트러스 실습실</h1>
        <p>들어갈 화면을 고르세요.</p>
      </div>
      <div className="gate-choices">
        <button type="button" className="gate-card" onClick={() => onOpen("calc")}>
          <GateTruss />
          <span className="kicker">01</span>
            <strong>트러스 계산기</strong>
            <span>절점을 놓고 부재를 이어 축력과 계산 과정을 확인합니다. 공간 모드도 있습니다.</span>
        </button>
        <button type="button" className="gate-card" onClick={() => onOpen("practice")}>
          <GateSpan />
          <span className="kicker">02</span>
          <strong>실습</strong>
          <span>예산 안에서 계곡, 도로, 절벽 미션을 설계합니다.</span>
        </button>
        <button type="button" className="gate-card" onClick={() => onOpen("contest")}>
          <GateContest />
          <span className="kicker">03</span>
          <strong>경진 대비</strong>
          <span>종이, 스파게티, 수수깡으로 책 하중을 버티는 연습을 따로 합니다.</span>
        </button>
        <button type="button" className="gate-card" onClick={() => onOpen("quiz")}>
          <GateQuiz />
          <span className="kicker">04</span>
          <strong>퀴즈</strong>
          <span>변형 문제는 6개씩 새로 나옵니다. 틀린 문제는 오답노트에 모이고, 사진 문제와 재료 연습도 있습니다.</span>
        </button>
      </div>
    </section>
  );
}

function GateTruss() {
  return (
    <svg className="gate-art" viewBox="0 0 220 96" aria-hidden="true">
      <path d="M18 78 H202" />
      <path d="M18 78 L110 22 L202 78" />
      <path d="M110 22 V78" />
      <circle cx="18" cy="78" r="4" />
      <circle cx="110" cy="78" r="4" />
      <circle cx="202" cy="78" r="4" />
      <circle cx="110" cy="22" r="4" />
    </svg>
  );
}

function GateQuiz() {
  return (
    <svg className="gate-art" viewBox="0 0 220 96" aria-hidden="true">
      <rect x="28" y="22" width="52" height="58" rx="8" className="gate-card-face" />
      <path d="M40 40h28M40 52h20" />
      <rect x="140" y="22" width="52" height="58" rx="8" className="gate-card-face" />
      <path d="M152 64h28M152 52h18" />
      <path d="M96 70 L110 34 L124 70" />
      <circle cx="110" cy="34" r="3.5" />
    </svg>
  );
}

function GateContest() {
  return (
    <svg className="gate-art" viewBox="0 0 220 96" aria-hidden="true">
      <path d="M28 74 H192" />
      <path d="M28 74 L110 28 L192 74" />
      <path d="M110 28 V74" />
      <rect x="86" y="58" width="48" height="16" rx="2" className="gate-card-face" />
      <path d="M86 66 H134" />
      <circle cx="28" cy="74" r="4" />
      <circle cx="110" cy="74" r="4" />
      <circle cx="192" cy="74" r="4" />
      <circle cx="110" cy="28" r="4" />
    </svg>
  );
}

function GateSpan() {
  return (
    <svg className="gate-art gate-span" viewBox="0 0 220 96" aria-hidden="true">
      <path d="M0 70 C40 78 70 88 90 96 L0 96 Z" className="gate-bank" />
      <path d="M220 70 C180 78 150 88 130 96 L220 96 Z" className="gate-bank" />
      <path d="M78 92 C110 80 140 92 168 84" className="gate-water" />
      <path d="M24 62 H196" />
      <path d="M24 62 L70 28 H150 L196 62" />
      <path d="M70 28 V62 M150 28 V62" />
    </svg>
  );
}
