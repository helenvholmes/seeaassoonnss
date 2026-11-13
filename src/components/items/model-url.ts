// Small helpers for 3D models that do not need three.js, so pages can use them
// without downloading it.

let webgl: boolean | null = null;

/** Whether this browser can draw WebGL. Checked once; the test context is released at once. */
export function hasWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    webgl = !!gl;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl = false;
  }
  return webgl;
}

export const modelUrl = (mediaBase: string, mediaId: string) => `${mediaBase}/media/${mediaId}/model.glb`;
