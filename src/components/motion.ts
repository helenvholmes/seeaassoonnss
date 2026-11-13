"use client";
// The page's "cursor", shared by every moving thing on a season page: cursor
// follow, generative type, 3D models and sketch backgrounds. With a mouse or
// trackpad it is the real cursor. On touch screens, which have no cursor, it
// moves down the screen as the page scrolls (top of the page: top of the
// screen; end of the page: bottom), so the same effects move with scroll.
// With reduced motion on, nothing subscribes and nothing moves.

export interface MotionState {
  /** Cursor in viewport pixels. */
  x: number;
  y: number;
  /** 0 at the top of the page, 1 at the end. */
  scroll: number;
  /** True when the cursor comes from scroll (touch screens). */
  fromScroll: boolean;
}

type Listener = (state: MotionState) => void;

const listeners = new Set<Listener>();
let state: MotionState = { x: 0, y: 0, scroll: 0, fromScroll: false };
let frame = 0;
let started = false;
let hasPointer = false;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function update() {
  frame = 0;
  const scroll = scrollProgress();
  const fromScroll = !hasPointer;
  state = fromScroll ? { x: window.innerWidth / 2, y: window.innerHeight * scroll, scroll, fromScroll } : { ...state, scroll, fromScroll };
  for (const l of listeners) l(state);
}

function schedule() {
  if (!frame) frame = requestAnimationFrame(update);
}

function start() {
  if (started) return;
  started = true;
  hasPointer = window.matchMedia("(pointer: fine)").matches;
  state = { x: window.innerWidth / 2, y: window.innerHeight / 2, scroll: 0, fromScroll: !hasPointer };
  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType === "touch") return;
      hasPointer = true;
      state = { ...state, x: e.clientX, y: e.clientY };
      schedule();
    },
    { passive: true },
  );
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  schedule();
}

/** Calls `listener` once per animation frame in which the cursor or scroll changed. */
export function subscribeMotion(listener: Listener): () => void {
  start();
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function currentMotion(): MotionState {
  return state;
}
