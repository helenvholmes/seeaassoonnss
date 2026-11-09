// Model compression on a model built here (so the repository ships no model files).
import assert from "node:assert/strict";
import { test } from "node:test";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import { compressModel, isGlb, usesDraco } from "../src/lib/gltf.ts";

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

test("tells Draco-compressed .glb files apart, so only they load the Draco decoder", async () => {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const prim = doc.createPrimitive().setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])).setBuffer(buffer));
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)));
  const plain = await new NodeIO().writeBinary(doc);
  assert.equal(usesDraco(plain), false);
  // A GLB whose JSON names the Draco extension.
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: "2.0" }, extensionsUsed: ["KHR_draco_mesh_compression"] }).padEnd(80, " "));
  const glb = new Uint8Array(20 + json.length);
  const view = new DataView(glb.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, glb.length, true);
  view.setUint32(12, json.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  glb.set(json, 20);
  assert.equal(usesDraco(glb), true);
  assert.equal(usesDraco(new Uint8Array(4)), false);
});
