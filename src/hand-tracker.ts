import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

export interface TrackedHand {
  landmarks: HandLandmarkerResult["landmarks"][number];
  handedness: "Left" | "Right";
}

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracker {
  private landmarker: HandLandmarker | null = null;
  private video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private lastVideoTime = -1;
  private latest: TrackedHand | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
  }

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  }

  async startCamera(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await new Promise<void>((resolve) => {
      this.video.onloadedmetadata = () => resolve();
    });
    await this.video.play();
  }

  /** Run detection on the current frame; returns the latest tracked hand or null. */
  detect(): TrackedHand | null {
    if (!this.landmarker || this.video.readyState < 2) return this.latest;
    const t = this.video.currentTime;
    if (t === this.lastVideoTime) return this.latest;
    this.lastVideoTime = t;

    const result = this.landmarker.detectForVideo(this.video, performance.now());
    if (result.landmarks.length === 0) {
      this.latest = null;
      return null;
    }
    const idx = 0;
    const hand: TrackedHand = {
      landmarks: result.landmarks[idx],
      handedness:
        (result.handedness?.[idx]?.[0]?.categoryName as "Left" | "Right") ??
        "Right",
    };
    this.latest = hand;
    return hand;
  }

  dispose(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.landmarker?.close();
    this.landmarker = null;
  }
}
