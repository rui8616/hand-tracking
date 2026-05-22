import * as THREE from "three";
import type { HandSkeleton } from "./hand-skeleton";

export type GestureState =
  | { kind: "idle" }
  | { kind: "aiming"; level: number }
  | { kind: "paused"; level: number; t: number }    // pose lost briefly
  | { kind: "charged"; level: number; t: number }   // full → hold → decay
  | { kind: "fired" }
  | { kind: "cooldown"; t: number }
  | { kind: "scattered"; t: number };

export interface GestureSnapshot {
  state: GestureState;
  /** Index fingertip position in scene space — particle target / ball anchor. */
  tipAnchor: THREE.Vector3;
  /** Index MCP→TIP direction, exponentially smoothed (~0.2s) — fire direction. */
  forward: THREE.Vector3;
  /** 0..1 across aiming/paused/charged; 0 elsewhere. */
  level: number;
  isPointing: boolean;
  /** Peak angular speed of the index finger direction over last 0.25s, rad/s. */
  angularSpeed: number;
  label: string;
}

// --- tuning -----------------------------------------------------------------
const POINT_INDEX_MAX_CURL = 0.35;   // index must be below (extended)
const POINT_OTHER_MIN_CURL = 0.5;    // middle/ring/pinky must be above (curled)
const CHARGE_TIME_S = 3.0;           // 3s from 0 → 100%
const HOLD_FULL_S = 3.5;             // hold at 100% for ~3.5s
const DECAY_TO_ZERO_S = 7.0;         // then decay over ~7s
const PAUSE_TOLERANCE_S = 0.3;       // pose can drop out this long without scattering
const FIRE_RATE_THRESHOLD = 4.5;     // rad/s peak → fire
const FORWARD_SMOOTH_S = 0.2;        // direction time constant
const DIR_WINDOW_S = 0.25;           // history window for peak angular speed
const COOLDOWN_S = 1.0;
const SCATTER_DURATION_S = 0.5;

// ---------------------------------------------------------------------------
// per-finger landmark chains: [MCP, PIP, DIP, TIP]
type FingerName = "thumb" | "index" | "middle" | "ring" | "pinky";
const FINGER_CHAINS: Record<FingerName, readonly [number, number, number, number]> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

interface FingerCurls {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

function computeFingerCurls(s: HandSkeleton): FingerCurls {
  const out: FingerCurls = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 };
  for (const name of Object.keys(FINGER_CHAINS) as FingerName[]) {
    const [a, b, c, d] = FINGER_CHAINS[name];
    const segments =
      s.joint(a).distanceTo(s.joint(b)) +
      s.joint(b).distanceTo(s.joint(c)) +
      s.joint(c).distanceTo(s.joint(d));
    if (segments < 1e-5) {
      out[name] = 0;
      continue;
    }
    const straight = s.joint(a).distanceTo(s.joint(d));
    const ratio = straight / segments;          // ~1 extended, ~0.4 curled
    const fingerCurl = 1 - ratio;               // 0 extended, ~0.6 curled
    out[name] = THREE.MathUtils.clamp((fingerCurl - 0.05) / 0.5, 0, 1);
  }
  return out;
}

export class GestureDetector {
  private state: GestureState = { kind: "idle" };
  private smoothedForward = new THREE.Vector3(0, 0, -1);
  private dirHistory: { dir: THREE.Vector3; t: number }[] = [];
  private label = "握拳并伸出食指开始蓄力";

  update(
    skeleton: HandSkeleton,
    dt: number,
    hasHand: boolean,
    nowSec: number,
  ): GestureSnapshot {
    const curls = hasHand ? computeFingerCurls(skeleton) : null;
    const isPointing = !!curls &&
      curls.index < POINT_INDEX_MAX_CURL &&
      curls.middle > POINT_OTHER_MIN_CURL &&
      curls.ring > POINT_OTHER_MIN_CURL &&
      curls.pinky > POINT_OTHER_MIN_CURL;

    // current and smoothed index-finger direction (MCP 5 → TIP 8)
    let currentForward: THREE.Vector3 | null = null;
    if (hasHand) {
      currentForward = new THREE.Vector3()
        .subVectors(skeleton.joint(8), skeleton.joint(5))
        .normalize();
      const alpha = 1 - Math.exp(-dt / FORWARD_SMOOTH_S);
      this.smoothedForward.lerp(currentForward, alpha).normalize();
    }

    // angular speed: max over sliding window
    let angularSpeed = 0;
    if (currentForward) {
      this.dirHistory.push({ dir: currentForward.clone(), t: nowSec });
      while (this.dirHistory.length && nowSec - this.dirHistory[0].t > DIR_WINDOW_S) {
        this.dirHistory.shift();
      }
      let maxRate = 0;
      for (let i = 1; i < this.dirHistory.length; i++) {
        const a = this.dirHistory[i - 1];
        const b = this.dirHistory[i];
        const dot = THREE.MathUtils.clamp(a.dir.dot(b.dir), -1, 1);
        const angle = Math.acos(dot);
        const ddt = b.t - a.t;
        if (ddt > 0) {
          const rate = angle / ddt;
          if (rate > maxRate) maxRate = rate;
        }
      }
      angularSpeed = maxRate;
    } else {
      this.dirHistory.length = 0;
    }

    const tipAnchor = hasHand ? skeleton.joint(8).clone() : new THREE.Vector3();

    // === state transitions =================================================
    switch (this.state.kind) {
      case "idle":
        if (!hasHand) {
          this.label = "请把手放进画面";
        } else if (isPointing) {
          this.state = { kind: "aiming", level: 0 };
          this.label = "汇聚能量中…";
        } else {
          this.label = "握拳并伸出食指开始蓄力";
        }
        break;

      case "aiming": {
        if (!hasHand) {
          this.state = { kind: "scattered", t: 0 };
          this.label = "手丢了，能量散开";
          break;
        }
        if (!isPointing) {
          this.state = { kind: "paused", level: this.state.level, t: 0 };
          this.label = "姿势保持住…";
          break;
        }
        const newLevel = Math.min(1, this.state.level + dt / CHARGE_TIME_S);
        if (newLevel >= 1) {
          this.state = { kind: "charged", level: 1, t: 0 };
          this.label = "能量满！甩食指发射";
        } else {
          this.state = { kind: "aiming", level: newLevel };
          this.label = `汇聚中 ${pct(newLevel)}`;
        }
        break;
      }

      case "paused": {
        if (!hasHand) {
          this.state = { kind: "scattered", t: 0 };
          this.label = "手丢了，能量散开";
          break;
        }
        if (isPointing) {
          this.state = { kind: "aiming", level: this.state.level };
          this.label = `汇聚中 ${pct(this.state.level)}`;
        } else if (this.state.t + dt > PAUSE_TOLERANCE_S) {
          this.state = { kind: "scattered", t: 0 };
          this.label = "姿势丢失，能量散开";
        } else {
          this.state = { kind: "paused", level: this.state.level, t: this.state.t + dt };
        }
        break;
      }

      case "charged": {
        if (!hasHand) {
          this.state = { kind: "scattered", t: 0 };
          this.label = "手丢了，能量散开";
          break;
        }
        if (!isPointing) {
          this.state = { kind: "scattered", t: 0 };
          this.label = "姿势丢失，能量散开";
          break;
        }
        if (angularSpeed > FIRE_RATE_THRESHOLD) {
          this.state = { kind: "fired" };
          this.label = `发射！(${angularSpeed.toFixed(1)} rad/s)`;
          break;
        }
        const newT = this.state.t + dt;
        let level = 1;
        if (newT > HOLD_FULL_S) {
          level = Math.max(0, 1 - (newT - HOLD_FULL_S) / DECAY_TO_ZERO_S);
        }
        if (level <= 0) {
          this.state = { kind: "scattered", t: 0 };
          this.label = "能量耗散";
        } else {
          this.state = { kind: "charged", level, t: newT };
          this.label =
            newT <= HOLD_FULL_S
              ? "能量满！甩食指发射"
              : `保持中 ${pct(level)} — 甩食指发射`;
        }
        break;
      }

      case "fired":
        this.state = { kind: "cooldown", t: 0 };
        break;

      case "cooldown":
        if (this.state.t + dt > COOLDOWN_S) {
          this.state = { kind: "idle" };
          this.label = "握拳并伸出食指开始蓄力";
        } else {
          this.state = { kind: "cooldown", t: this.state.t + dt };
          this.label = "冷却中…";
        }
        break;

      case "scattered":
        if (this.state.t + dt > SCATTER_DURATION_S) {
          this.state = { kind: "idle" };
          this.label = "握拳并伸出食指开始蓄力";
        } else {
          this.state = { kind: "scattered", t: this.state.t + dt };
        }
        break;
    }

    const level =
      this.state.kind === "aiming" ||
      this.state.kind === "paused" ||
      this.state.kind === "charged"
        ? this.state.level
        : 0;

    return {
      state: this.state,
      tipAnchor,
      forward: this.smoothedForward.clone(),
      level,
      isPointing,
      angularSpeed,
      label: this.label,
    };
  }
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}
