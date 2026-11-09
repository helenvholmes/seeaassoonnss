"use client";
// The live 3D view (React Three Fiber). Loaded with next/dynamic only where a
// season has a 3D model, so pages without one never download three.js.
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { AnimationMixer, type Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ModelContent } from "@/lib/schema";
import { subscribeMotion } from "../motion";
import { cameraDistance, ENV_INTENSITY, FOV, fitModel, makeLights, studioEnvironment } from "./model-three";

export interface ModelSceneProps {
  url: string;
  content: ModelContent;
  /** Spin, follow and animation run; false in the editor and with reduced motion. */
  live: boolean;
  /** The element the model is drawn in; follow turns toward the cursor relative to it. */
  host: React.RefObject<HTMLElement | null>;
  onReady: () => void;
}

/** How far (radians) a following model turns toward the cursor at most. */
const FOLLOW_TURN = 0.6;

function Model({ url, content, live, host, onReady }: ModelSceneProps) {
  const gltf = useLoader(GLTFLoader, url, (loader) => {
    (loader as GLTFLoader).setMeshoptDecoder(MeshoptDecoder);
  });
  const { camera, size, gl, scene, invalidate } = useThree();
  // A clone, so one file can show in several places (SkeletonUtils keeps skinned meshes working).
  const fitted = useMemo(() => fitModel(clone(gltf.scene), content), [gltf, content]);
  const lights = useMemo(makeLights, []);
  const followRef = useRef<Group>(null);
  const spinRef = useRef<Group>(null);
  const target = useRef({ yaw: 0, pitch: 0 });

  useEffect(() => {
    const env = studioEnvironment(gl);
    scene.environment = env;
    scene.environmentIntensity = ENV_INTENSITY;
    return () => env.dispose();
  }, [gl, scene]);

  useEffect(() => {
    camera.position.set(0, 0, cameraDistance(size.width / Math.max(1, size.height)) * 1.04);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);

  const playing = live && content.animate && gltf.animations.length > 0;
  const mixer = useMemo(() => new AnimationMixer(fitted), [fitted]);
  useEffect(() => {
    if (!playing) return;
    const action = mixer.clipAction(gltf.animations[0]);
    action.play();
    return () => void action.stop();
  }, [playing, mixer, gltf]);

  useEffect(() => {
    if (!live || !content.follow) return;
    return subscribeMotion((m) => {
      const r = host.current?.getBoundingClientRect();
      if (!r) return;
      const nx = Math.max(-1, Math.min(1, (m.x - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      const ny = Math.max(-1, Math.min(1, (m.y - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      target.current = { yaw: nx * FOLLOW_TURN, pitch: ny * FOLLOW_TURN * 0.6 };
    });
  }, [live, content.follow, host]);

  useEffect(() => {
    onReady();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitted]);

  useFrame((_, dt) => {
    if (!live) return;
    if (spinRef.current && content.spin) spinRef.current.rotation.y += (content.spin * Math.PI * dt) / 180;
    if (followRef.current && content.follow) {
      const g = followRef.current.rotation;
      g.y += (target.current.yaw - g.y) * 0.08;
      g.x += (target.current.pitch - g.x) * 0.08;
    }
    if (playing) mixer.update(dt);
  });

  return (
    <>
      {lights.map((l) => (
        <primitive key={l.uuid} object={l} />
      ))}
      <group ref={followRef}>
        <group ref={spinRef}>
          <primitive object={fitted} />
        </group>
      </group>
    </>
  );
}

export default function ModelScene(props: ModelSceneProps) {
  const moving = props.live && (props.content.spin !== 0 || props.content.follow || (props.content.animate && props.content.hasAnimation));
  return (
    <Canvas
      className="model-canvas"
      frameloop={moving ? "always" : "demand"}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
      camera={{ fov: FOV, near: 0.01, far: 100, position: [0, 0, 5] }}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <Suspense fallback={null}>
        <Model {...props} />
      </Suspense>
    </Canvas>
  );
}
