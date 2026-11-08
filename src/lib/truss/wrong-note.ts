import type { VariationQuestion } from "./variation";

const KEY = "truss-lab-variation-wrongs";
const LIMIT = 40;

export type WrongNote = {
  key: string;
  savedAt: number;
  picked: string;
  question: VariationQuestion;
};

const listeners = new Set<() => void>();

export function questionKey(question: VariationQuestion): string {
  return question.id;
}

function isNote(value: unknown): value is WrongNote {
  if (!value || typeof value !== "object") return false;
  const note = value as WrongNote;
  return typeof note.key === "string" && typeof note.picked === "string" && typeof note.question?.ask === "string" && typeof note.question.answer === "string";
}

export function loadWrongs(): WrongNote[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNote);
  } catch {
    return [];
  }
}

function write(notes: WrongNote[]) {
  window.localStorage.setItem(KEY, JSON.stringify(notes.slice(0, LIMIT)));
  listeners.forEach((listener) => listener());
}

export function saveWrong(question: VariationQuestion, picked: string): WrongNote[] {
  const key = questionKey(question);
  const next = [{ key, savedAt: Date.now(), picked, question }, ...loadWrongs().filter((note) => note.key !== key)];
  write(next);
  return next.slice(0, LIMIT);
}

export function removeWrong(key: string): WrongNote[] {
  const next = loadWrongs().filter((note) => note.key !== key);
  write(next);
  return next;
}

export function subscribeWrongs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
