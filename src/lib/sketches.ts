import "server-only";
// The sketch library: the owner's p5.js sketches, for reuse as season backgrounds.
// A season copies the code when a sketch is chosen, so pages never change on their own.
import { sql } from "./db";
import { MAX_SKETCH_CODE } from "./schema";
import { SeasonError } from "./seasons";

export interface Sketch {
  id: string;
  name: string;
  code: string;
  updatedAt: string;
}

const toSketch = (r: Record<string, unknown>): Sketch => ({ id: r.id as string, name: r.name as string, code: r.code as string, updatedAt: (r.updated_at as Date).toISOString() });

function check(name: unknown, code: unknown): { name: string; code: string } {
  if (typeof code !== "string" || !code.trim()) throw new SeasonError("The sketch has no code.", 400);
  if (code.length > MAX_SKETCH_CODE) throw new SeasonError(`Sketches can be at most ${MAX_SKETCH_CODE.toLocaleString("en")} characters.`, 400);
  return { name: typeof name === "string" ? name.slice(0, 200) : "", code };
}

export async function listSketches(): Promise<Sketch[]> {
  return (await sql`select id, name, code, updated_at from sketches order by updated_at desc`).map(toSketch);
}

export async function createSketch(name: unknown, code: unknown): Promise<Sketch> {
  const s = check(name, code);
  const [row] = await sql`insert into sketches (name, code) values (${s.name}, ${s.code}) returning id, name, code, updated_at`;
  return toSketch(row);
}

export async function updateSketch(id: string, name: unknown, code: unknown): Promise<Sketch> {
  const s = check(name, code);
  const [row] = await sql`update sketches set name = ${s.name}, code = ${s.code}, updated_at = now() where id = ${id} returning id, name, code, updated_at`;
  if (!row) throw new SeasonError("Sketch not found.", 404);
  return toSketch(row);
}

export async function deleteSketch(id: string): Promise<void> {
  const [row] = await sql`delete from sketches where id = ${id} returning id`;
  if (!row) throw new SeasonError("Sketch not found.", 404);
}
