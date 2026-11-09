// three.js helpers shared by the live 3D view (React Three Fiber) and the poster
// renderer, so a poster looks like the live model.
import { AmbientLight, Box3, DirectionalLight, Euler, Group, MathUtils, PMREMGenerator, Sphere, type Object3D, type Texture, type WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { ModelContent } from "@/lib/schema";

export const FOV = 30;
/** Strength of the studio environment light; 1 washes out light colors. */
export const ENV_INTENSITY = 0.75;

/**
 * Wraps a loaded scene so it sits at the origin, scaled to fit a sphere of
 * radius 1 (times the owner's scale) and turned by the owner's rotation.
 */
export function fitModel(scene: Object3D, content: Pick<ModelContent, "scale" | "rotation">): Group {
  const inner = new Group();
  inner.add(scene);
  const sphere = new Box3().setFromObject(scene).getBoundingSphere(new Sphere());
  const r = sphere.radius || 1;
  scene.position.sub(sphere.center);
  inner.scale.setScalar(content.scale / r);
  const outer = new Group();
  outer.add(inner);
  outer.rotation.copy(modelEuler(content.rotation));
  return outer;
}

export function modelEuler(rotation: [number, number, number]): Euler {
  return new Euler(MathUtils.degToRad(rotation[0]), MathUtils.degToRad(rotation[1]), MathUtils.degToRad(rotation[2]), "YXZ");
}

/** Camera distance at which a sphere of radius 1 just fits, for this aspect ratio. */
export function cameraDistance(aspect: number, fov = FOV): number {
  const v = MathUtils.degToRad(fov) / 2;
  const h = Math.atan(Math.tan(v) * aspect);
  return 1 / Math.sin(Math.min(v, h));
}

/** Soft studio light from three's built-in room, so metal and gloss look right without downloading an HDR file. */
export function studioEnvironment(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return texture;
}

/** A little direct light on top of the environment, from the upper right. */
export function makeLights(): Object3D[] {
  const sun = new DirectionalLight(0xffffff, 1.2);
  sun.position.set(3, 5, 4);
  return [new AmbientLight(0xffffff, 0.25), sun];
}
