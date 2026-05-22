import * as THREE from "three";

// MediaPipe Hand Landmarker connection topology (21 landmarks)
// https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                  // palm base
];

export const NUM_LANDMARKS = 21;

const FINGER_TIPS = new Set([4, 8, 12, 16, 20]);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * A 3D hand skeleton mesh group: 21 joint spheres + cylinder bones.
 * Joints kept small so individual landmarks are visible; bones are slim
 * cylinders rotated to span each connection.
 */
export class HandSkeleton {
  readonly group = new THREE.Group();

  private joints: THREE.Mesh[] = [];
  private bones: THREE.Mesh[] = [];

  private smoothed: THREE.Vector3[] = [];
  private hasData = false;

  constructor() {
    const jointMat = new THREE.MeshBasicMaterial({ color: 0x6ee7ff });
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xc084fc });
    const wristMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    const jointGeom = new THREE.SphereGeometry(0.022, 14, 14);

    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const mat = i === 0 ? wristMat : FINGER_TIPS.has(i) ? tipMat : jointMat;
      const mesh = new THREE.Mesh(jointGeom, mat);
      mesh.scale.setScalar(i === 0 ? 1.3 : FINGER_TIPS.has(i) ? 1.1 : 1.0);
      this.group.add(mesh);
      this.joints.push(mesh);
      this.smoothed.push(new THREE.Vector3());
    }

    // Cylinder bones — unit cylinder along +Y, origin at base, scaled along Y per frame.
    const boneGeom = new THREE.CylinderGeometry(0.01, 0.01, 1, 8, 1, false);
    boneGeom.translate(0, 0.5, 0);
    const boneMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7ff,
      transparent: true,
      opacity: 0.85,
    });
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const bone = new THREE.Mesh(boneGeom, boneMat);
      this.group.add(bone);
      this.bones.push(bone);
    }

    this.group.visible = false;
  }

  /**
   * landmarks: 21 points with x,y in [0,1] (image space) and z relative depth.
   * Mapped to centered scene space [-1,1] with X mirrored so the hand on
   * screen matches the user's view.
   */
  update(landmarks: ReadonlyArray<{ x: number; y: number; z: number }>): void {
    if (!landmarks || landmarks.length !== NUM_LANDMARKS) {
      this.group.visible = false;
      this.hasData = false;
      return;
    }

    const SMOOTH = this.hasData ? 0.4 : 1.0;
    this.hasData = true;

    for (let i = 0; i < NUM_LANDMARKS; i++) {
      const lm = landmarks[i];
      const x = (1 - lm.x) * 2 - 1;
      const y = -(lm.y * 2 - 1);
      const z = -lm.z * 2;
      this.smoothed[i].lerp({ x, y, z } as THREE.Vector3, SMOOTH);
      this.joints[i].position.copy(this.smoothed[i]);
    }

    // Orient each cylinder bone along its connection segment.
    const dir = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < HAND_CONNECTIONS.length; i++) {
      const [a, b] = HAND_CONNECTIONS[i];
      const pa = this.smoothed[a];
      const pb = this.smoothed[b];
      dir.subVectors(pb, pa);
      const len = dir.length();
      const bone = this.bones[i];
      bone.position.copy(pa);
      if (len > 1e-5) {
        q.setFromUnitVectors(Y_AXIS, dir.clone().multiplyScalar(1 / len));
        bone.quaternion.copy(q);
      }
      bone.scale.set(1, len, 1);
    }

    this.group.visible = true;
  }

  clear(): void {
    this.group.visible = false;
    this.hasData = false;
  }

  /** Position of palm centroid (landmark 9 = middle finger MCP). */
  palmCenter(): THREE.Vector3 {
    return this.smoothed[9].clone();
  }

  /** Average position of all five fingertips — useful for charge anchor. */
  fingertipCenter(): THREE.Vector3 {
    const tips = [4, 8, 12, 16, 20];
    const v = new THREE.Vector3();
    for (const i of tips) v.add(this.smoothed[i]);
    return v.multiplyScalar(1 / tips.length);
  }

  /** Direction from wrist toward middle MCP — "out of the palm". */
  palmForward(): THREE.Vector3 {
    return new THREE.Vector3()
      .subVectors(this.smoothed[9], this.smoothed[0])
      .normalize();
  }

  joint(i: number): THREE.Vector3 {
    return this.smoothed[i];
  }
}
