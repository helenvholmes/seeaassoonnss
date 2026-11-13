// Compresses an uploaded glTF binary (.glb) for the web. Pure: no database or
// storage, so tests and scripts can use it directly.
//
// What changes (measured on the Khronos sample models, see docs/requirements.md):
// 1. Textures, usually 85–99% of a file, are re-encoded as WebP (quality 85) and
//    shrunk to fit `textureSize` px. Re-encoding also drops any EXIF or GPS data
//    inside embedded JPEG textures.
// 2. Geometry is quantized and packed with meshopt (EXT_meshopt_compression):
//    positions are stored in 14 bits per axis, normals in 10 and texture
//    coordinates in 12. On a model 1 m across that is a grid of about 0.06 mm.
// 3. Unused data is removed, duplicate data merged, animation keyframes that a
//    straight line between neighbours already gives are dropped.
// Meshopt rather than Draco: files come out about the same size, but the meshopt
// decoder is about 20 KB of JavaScript (Draco: about 300 KB of WebAssembly loaded
// from a CDN) and decodes faster.
import { Logger, NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, resample, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

export const TEXTURE_SIZES = [1024, 2048] as const;
export type TextureSize = (typeof TEXTURE_SIZES)[number];
export const DEFAULT_TEXTURE_SIZE: TextureSize = 2048;

export interface ModelStats {
  bytes: number;
  vertices: number;
  textures: number;
  /** Largest texture side in px, 0 without textures. */
  largestTexture: number;
  animations: number;
}

export interface CompressedModel {
  glb: Uint8Array;
  before: ModelStats;
  after: ModelStats;
  /** Steps that were skipped, in plain words. */
  warnings: string[];
}

let ioPromise: Promise<NodeIO> | null = null;
let dracoIoPromise: Promise<NodeIO> | null = null;

function baseIo(): NodeIO {
  return new NodeIO()
    .setLogger(new Logger(Logger.Verbosity.ERROR))
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
}

/**
 * The reader and writer. The Draco decoder (a WebAssembly file) loads only for
 * uploads that are Draco-compressed, so other models never depend on it.
 */
function io(draco: boolean): Promise<NodeIO> {
  if (!draco) {
    ioPromise ??= Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]).then(baseIo);
    return ioPromise;
  }
  dracoIoPromise ??= (async () => {
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
    let decoder: unknown;
    try {
      decoder = await draco3d.createDecoderModule();
    } catch (e) {
      dracoIoPromise = null;
      throw new ModelError(`This model is Draco-compressed, and the Draco decoder could not load on the server (${(e as Error).message}). Export it without Draco compression and try again.`);
    }
    // Uploads may already be Draco-compressed (many exporters do this); they are decoded and re-packed with meshopt.
    return baseIo().registerDependencies({ "draco3d.decoder": decoder });
  })();
  return dracoIoPromise;
}

/** Whether a .glb says it uses Draco mesh compression (read from its JSON chunk). */
export function usesDraco(glb: Uint8Array): boolean {
  if (glb.length < 20) return false;
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) return false; // "JSON"
  const json = new TextDecoder().decode(glb.subarray(20, Math.min(glb.length, 20 + jsonLength)));
  return json.includes("KHR_draco_mesh_compression");
}

export function isGlb(buf: Uint8Array): boolean {
  // "glTF" magic, then version 2.
  return buf.length >= 12 && buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46 && buf[4] === 2;
}

function stats(doc: Document, bytes: number): ModelStats {
  const root = doc.getRoot();
  let vertices = 0;
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) vertices += prim.getAttribute("POSITION")?.getCount() ?? 0;
  const textures = root.listTextures();
  const largestTexture = textures.reduce((max, t) => Math.max(max, ...(t.getSize() ?? [0, 0])), 0);
  return { bytes, vertices, textures: textures.length, largestTexture, animations: root.listAnimations().length };
}

export class ModelError extends Error {}

export async function compressModel(input: Uint8Array, textureSize: TextureSize = DEFAULT_TEXTURE_SIZE): Promise<CompressedModel> {
  if (!isGlb(input)) throw new ModelError("This is not a glTF binary (.glb) file. Export the model as .glb (glTF 2.0 binary).");
  const nodeIO = await io(usesDraco(input));
  let doc: Document;
  try {
    doc = await nodeIO.readBinary(input);
  } catch (e) {
    throw new ModelError(`This model could not be read: ${(e as Error).message}`);
  }
  if (!doc.getRoot().listMeshes().length) throw new ModelError("This file has no meshes to show.");
  const before = stats(doc, input.byteLength);
  const warnings: string[] = [];

  await doc.transform(dedup(), prune(), resample());
  try {
    await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", resize: [textureSize, textureSize], quality: 85 }));
  } catch {
    // For example KTX2 textures, which sharp cannot read. They stay as they are.
    warnings.push("Textures were left as they are: their format could not be re-encoded.");
  }
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "medium" }));

  const glb = await nodeIO.writeBinary(doc);
  return { glb, before, after: stats(doc, glb.byteLength), warnings };
}
