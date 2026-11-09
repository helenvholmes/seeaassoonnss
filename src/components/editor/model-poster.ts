// Renders a still of a 3D model in the browser, for its poster image. Uses the
// same fitting, light and camera as the live view (items/model-three.ts).
import { ACESFilmicToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import type { ModelContent } from "@/lib/schema";
import { cameraDistance, ENV_INTENSITY, FOV, fitModel, makeLights, studioEnvironment } from "../items/model-three";

const SIZE = 1024;

export async function renderModelPoster(url: string, content: Pick<ModelContent, "scale" | "rotation">): Promise<Blob> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setSize(SIZE, SIZE, false);
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.outputColorSpace = SRGBColorSpace;
    const scene = new Scene();
    const env = studioEnvironment(renderer);
    scene.environment = env;
    scene.environmentIntensity = ENV_INTENSITY;
    scene.add(...makeLights(), fitModel(gltf.scene, content));
    const camera = new PerspectiveCamera(FOV, 1, 0.01, 100);
    camera.position.set(0, 0, cameraDistance(1) * 1.04);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((resolve) => renderer.domElement.toBlob(resolve, "image/png"));
    env.dispose();
    if (!blob) throw new Error("The poster could not be drawn.");
    return blob;
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
