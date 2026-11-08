"use client";

import { VALLEY_LEFT, VALLEY_RIGHT } from "@/lib/truss/stages";
import { BOARD_H, BOARD_W, toScreen } from "./grid";

export type SceneId = "valley" | "road" | "cliff" | "workshop" | "paper";

export const SCENES: Array<{ id: SceneId; label: string }> = [
  { id: "valley", label: "계곡" },
  { id: "road", label: "도로" },
  { id: "cliff", label: "절벽" },
  { id: "workshop", label: "작업실" },
  { id: "paper", label: "백지" },
];

/** 실습 단계의 이야기에 맞는 기본 배경. */
export function stageScene(stageId: number): SceneId {
  if (stageId === 4 || stageId === 7) return "road";
  if (stageId === 5) return "cliff";
  if (stageId === 8) return "workshop";
  return "valley";
}

export function ScenePicker({
  value,
  onChange,
  includeMission = false,
}: {
  value: SceneId | "mission";
  onChange: (next: SceneId | "mission") => void;
  includeMission?: boolean;
}) {
  const options: Array<{ id: SceneId | "mission"; label: string }> = [
    ...(includeMission ? [{ id: "mission" as const, label: "미션" }] : []),
    ...SCENES,
  ];
  return (
    <div className="scene-picker" role="group" aria-label="배경">
      {options.map((option) => (
        <button key={option.id} type="button" className={value === option.id ? "on" : ""} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SceneBackdrop({ scene, uid }: { scene: SceneId; uid: string }) {
  return (
    <g className={`scene scene-${scene}`}>
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={scene === "cliff" ? "#d7e7f2" : "#d5ebf8"} />
          <stop offset="55%" stopColor="#f4efe4" />
          <stop offset="100%" stopColor="#e7f0df" />
        </linearGradient>
        <linearGradient id={`rock-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6a6258" />
          <stop offset="70%" stopColor="#8d8478" />
          <stop offset="100%" stopColor="#b3aa9c" />
        </linearGradient>
        <clipPath id={`board-clip-${uid}`}>
          <rect x="8" y="8" width={BOARD_W - 16} height={BOARD_H - 16} rx="18" />
        </clipPath>
      </defs>
      <g clipPath={`url(#board-clip-${uid})`}>
        {scene === "valley" ? <Valley uid={uid} /> : null}
        {scene === "road" ? <Road uid={uid} /> : null}
        {scene === "cliff" ? <Cliff uid={uid} /> : null}
        {scene === "workshop" ? <Workshop /> : null}
        {scene === "paper" ? <Paper /> : null}
      </g>
    </g>
  );
}

function Valley({ uid }: { uid: string }) {
  const left = toScreen(VALLEY_LEFT, 0);
  const right = toScreen(VALLEY_RIGHT, 0);
  const ground = left.sy;
  const lipL = left.sx + 36;
  const lipR = right.sx - 36;
  return (
    <g>
      <rect width={BOARD_W} height={BOARD_H} fill={`url(#sky-${uid})`} />
      <circle cx="660" cy="78" r="28" fill="#fff6d2" />
      <path d="M0 250 C120 190 220 230 340 190 C470 146 580 210 784 160 L784 360 C560 330 360 390 180 340 C70 310 0 330 0 330 Z" fill="#d7e4c9" />
      <path d="M0 330 C150 280 280 350 460 300 C620 258 700 310 784 270 L784 450 C500 430 240 470 0 410 Z" fill="#c3d4ad" />
      <path d={`M0 ${ground - 36} L${lipL - 8} ${ground - 36} L${lipL - 8} ${ground} L${lipL + 22} ${BOARD_H} L0 ${BOARD_H} Z`} fill="#7d9a60" />
      <path d={`M${BOARD_W} ${ground - 36} L${lipR + 8} ${ground - 36} L${lipR + 8} ${ground} L${lipR - 22} ${BOARD_H} L${BOARD_W} ${BOARD_H} Z`} fill="#719456" />
      <path
        d={`M${lipL + 8} ${ground + 28} C${(lipL + lipR) / 2 - 70} ${ground + 8} ${(lipL + lipR) / 2 + 70} ${ground + 46} ${lipR - 8} ${ground + 18} L${lipR - 16} ${BOARD_H} L${lipL + 16} ${BOARD_H} Z`}
        fill="#6ea4b8"
      />
      <path
        d={`M${lipL + 40} ${ground + 36} Q${(left.sx + right.sx) / 2} ${ground + 22} ${lipR - 40} ${ground + 36}`}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2"
      />
      <circle cx={left.sx - 52} cy={ground - 4} r="7" fill="#8a8174" />
      <circle cx={right.sx + 48} cy={ground - 8} r="5" fill="#9a9084" />
    </g>
  );
}

function Road({ uid }: { uid: string }) {
  return (
    <g>
      <rect width={BOARD_W} height={BOARD_H} fill={`url(#sky-${uid})`} />
      <circle cx="140" cy="74" r="26" fill="#fff6d2" />
      <path d="M0 300 C160 250 300 320 480 270 C640 230 700 280 784 250 L784 430 L0 430 Z" fill="#d5e3c4" />
      <path d="M0 390 C180 360 320 420 520 380 C650 356 720 390 784 370 L784 470 L0 470 Z" fill="#b7c99a" />
      <rect x="0" y="508" width={BOARD_W} height="14" fill="#c6b48a" />
      <rect x="0" y="522" width={BOARD_W} height="24" fill="#5e656e" />
      <line x1="36" y1="534" x2="748" y2="534" stroke="rgba(255,255,255,0.78)" strokeWidth="3" strokeDasharray="22 16" />
      <line x1="0" y1="522" x2={BOARD_W} y2="522" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
    </g>
  );
}

function Cliff({ uid }: { uid: string }) {
  return (
    <g>
      <rect width={BOARD_W} height={BOARD_H} fill={`url(#sky-${uid})`} />
      <circle cx="620" cy="86" r="24" fill="#fff6d2" />
      <path d="M120 360 C260 320 420 390 620 340 C700 320 760 340 784 330 L784 546 L120 546 Z" fill="#d5e4ea" />
      <path d="M180 470 C320 440 520 510 784 450 L784 546 L180 546 Z" fill="#b9d0d4" opacity="0.85" />
      <path d={`M0 8 L104 8 L86 90 L112 170 L78 250 L100 340 L70 430 L92 546 L0 546 Z`} fill={`url(#rock-${uid})`} />
      <path d="M18 40 L46 70 M30 160 L62 140 M22 260 L58 290 M16 400 L50 370" stroke="rgba(40,32,26,0.28)" strokeWidth="2" fill="none" />
      <path d="M0 430 L86 418 L70 546 L0 546 Z" fill="#6d7d58" />
    </g>
  );
}

function Workshop() {
  return (
    <g>
      <rect width={BOARD_W} height={BOARD_H} fill="#d9c4a2" />
      <rect x="26" y="22" width={BOARD_W - 52} height={BOARD_H - 44} rx="4" fill="#fbf6ec" />
      <rect x="26" y="22" width={BOARD_W - 52} height="14" fill="#efe0c6" />
      <rect x="48" y="22" width="46" height="14" fill="rgba(180, 90, 70, 0.35)" />
      <rect x="210" y="22" width="70" height="14" fill="rgba(70, 110, 150, 0.28)" />
    </g>
  );
}

function Paper() {
  return (
    <g>
      <rect width={BOARD_W} height={BOARD_H} fill="#efe6d6" />
      <rect x="18" y="18" width={BOARD_W - 36} height={BOARD_H - 36} rx="6" fill="#fbf8f2" stroke="rgba(80,52,24,0.08)" />
    </g>
  );
}
