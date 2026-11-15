/** Typewriter pace: ms per letter, so short quotes type slowly and long ones still finish in a few seconds. */
export function typeInterval(letters: number) {
  return Math.min(70, Math.max(18, 2800 / Math.max(1, letters)));
}

/** The short beat the typewriter takes after a semicolon, in ms. */
export const SEMICOLON_PAUSE = 200;

/**
 * When each letter appears, in ms after typing starts: one interval apart,
 * with a short pause after each semicolon.
 */
export function typeSchedule(chars: string[]): number[] {
  const step = typeInterval(chars.length);
  const times: number[] = [];
  let t = 0;
  for (let i = 0; i < chars.length; i++) {
    times.push(t);
    t += step + (chars[i] === ";" ? SEMICOLON_PAUSE : 0);
  }
  return times;
}

/** How many letters are typed `elapsed` ms in. */
export function typedCount(schedule: number[], elapsed: number, from = 0) {
  let n = from;
  while (n < schedule.length && schedule[n] <= elapsed) n++;
  return n;
}
