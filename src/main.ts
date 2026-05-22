import "./style.css";
import * as THREE from "three";
import { HandTracker } from "./hand-tracker";
import { HandSkeleton } from "./hand-skeleton";
import { GestureDetector, type GestureState } from "./gesture";
import { EnergyBall, createFloorRing } from "./effects";
import { ChargeParticles } from "./particles";
import { createStarfield } from "./starfield";

const canvas = document.getElementById("scene") as HTMLCanvasElement;
const video = document.getElementById("cam") as HTMLVideoElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const cameraBadge = document.getElementById("camera-badge") as HTMLSpanElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;

function showError(prefix: string, err: unknown) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (statusText) statusText.textContent = `${prefix}：${msg}`;
  console.error(prefix, err);
}
window.addEventListener("error", (e) => showError("脚本错误", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => showError("异步错误", e.reason));

// ---------------------------------------------------------------------------
// Three.js scene
// ---------------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000308);
scene.fog = new THREE.FogExp2(0x000308, 0.08);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 5);

scene.add(createStarfield());
scene.add(createFloorRing());

const skeleton = new HandSkeleton();
scene.add(skeleton.group);

const ball = new EnergyBall();
ball.attachTo(scene);

const particles = new ChargeParticles();
scene.add(particles.group);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener("resize", resize);

// ---------------------------------------------------------------------------
// Tracking + gestures
// ---------------------------------------------------------------------------
const tracker = new HandTracker(video);
const detector = new GestureDetector();

let lastTime = performance.now();
let prevStateKind: GestureState["kind"] | null = null;

async function bootstrap() {
  try {
    statusText.textContent = "加载手部识别模型…";
    await tracker.init();
    statusText.textContent = "模型已就绪，点击启动摄像头";
  } catch (err) {
    statusText.textContent = "模型加载失败：" + (err as Error).message;
    console.error(err);
  }
}

startBtn.addEventListener("click", async () => {
  try {
    startBtn.disabled = true;
    statusText.textContent = "请求摄像头权限…";
    await tracker.startCamera();
    cameraBadge.textContent = "摄像头已启动";
    cameraBadge.classList.add("on");
    startBtn.classList.add("hidden");
    statusText.textContent = "请把手放到摄像头前";
  } catch (err) {
    startBtn.disabled = false;
    statusText.textContent = "摄像头启动失败：" + (err as Error).message;
    console.error(err);
  }
});

bootstrap();

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const nowSec = now / 1000;

  const hand = tracker.detect();
  if (hand) {
    skeleton.update(hand.landmarks);
  } else {
    skeleton.clear();
  }

  const snap = detector.update(skeleton, dt, !!hand, nowSec);
  statusText.textContent = snap.label;

  // --- Energy ball + particles, driven by gesture state -------------------
  const kind = snap.state.kind;

  // Particle spawn: entering aiming from anywhere except paused (paused
  // briefly drops to aiming, particles stay where they are).
  const enteredAiming = kind === "aiming" && prevStateKind !== "aiming" && prevStateKind !== "paused";
  if (enteredAiming) particles.spawn(snap.tipAnchor);

  switch (kind) {
    case "aiming":
    case "paused":
      particles.setMode("converge");
      ball.charge(snap.tipAnchor, snap.level * 0.55);
      break;
    case "charged":
      particles.setMode("hold");
      ball.charge(snap.tipAnchor, 0.55 + snap.level * 0.45);
      break;
    case "fired": {
      // Map angular speed → launch strength. Threshold is 4.5 rad/s; a vigorous
      // flick is around 12 rad/s. Clamp so even a soft fire still moves.
      const strength = THREE.MathUtils.clamp(
        (snap.angularSpeed - 4) / 10,
        0.3,
        2.2,
      );
      particles.fire(snap.forward, 8 + strength * 12);
      ball.launch(strength, snap.forward);
      break;
    }
    case "cooldown":
      // particles coast on the impulse from fire() and fade
      particles.setMode("fire");
      break;
    case "scattered":
      particles.setMode("scatter");
      break;
    case "idle":
      particles.setMode("idle");
      break;
  }
  particles.update(dt, snap.tipAnchor, snap.level, nowSec);
  ball.tick(dt);

  prevStateKind = kind;

  // gentle scene drift
  scene.rotation.y = Math.sin(now * 0.0001) * 0.05;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
