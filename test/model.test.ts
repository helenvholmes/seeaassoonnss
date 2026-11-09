// Model compression on a model built here (so the repository ships no model files).
import assert from "node:assert/strict";
import { test } from "node:test";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import { compressModel, isGlb } from "../src/lib/gltf.ts";

async function sampleGlb(textureSide: number): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  // A finely divided square: enough vertices for compression to matter.
  const n = 60;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let y = 0; y <= n; y++)
    for (let x = 0; x <= n; x++) {
      pos.push(x / n - 0.5, Math.sin(x / 6) * 0.05, y / n - 0.5);
      uv.push(x / n, y / n);
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = y * (n + 1) + x;
      idx.push(a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2);
    }
  const png = await sharp({ create: { width: textureSide, height: textureSide, channels: 3, background: "#9fbf8a" } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${textureSide}" height="${textureSide}"><circle cx="50%" cy="50%" r="30%" fill="#c63d32"/></svg>`) }])
    .png()
    .toBuffer();
  const texture = doc.createTexture("base").setImage(new Uint8Array(png)).setMimeType("image/png");
  const material = doc.createMaterial("m").setBaseColorTexture(texture);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
    .setAttribute("TEXCOORD_0", doc.createAccessor().setType("VEC2").setArray(new Float32Array(uv)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buffer))
    .setMaterial(material);
  const mesh = doc.createMesh("leaf").addPrimitive(prim);
  doc.createScene().addChild(doc.createNode().setMesh(mesh));
  return new NodeIO().writeBinary(doc);
}

test("compresses a model: smaller file, textures resized to the limit, same vertex count", async () => {
  const input = await sampleGlb(4096);
  assert.ok(isGlb(input));
  const out = await compressModel(input, 1024);
  assert.ok(isGlb(out.glb));
  assert.ok(out.after.bytes < out.before.bytes, `${out.after.bytes} < ${out.before.bytes}`);
  assert.equal(out.before.largestTexture, 4096);
  assert.equal(out.after.largestTexture, 1024);
  assert.equal(out.after.vertices, out.before.vertices);
  // The result reads back.
  const { MeshoptDecoder } = await import("meshoptimizer");
  await MeshoptDecoder.ready;
  const { ALL_EXTENSIONS } = await import("@gltf-transform/extensions");
  const back = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).readBinary(out.glb);
  assert.equal(back.getRoot().listMeshes().length, 1);
  assert.equal(back.getRoot().listTextures()[0].getMimeType(), "image/webp");
});

test("refuses files that are not .glb", async () => {
  await assert.rejects(compressModel(new TextEncoder().encode('{"asset":{"version":"2.0"}}')), /not a glTF binary/);
});
