import * as THREE from "three";

const FORWARD = new THREE.Vector3(0, 0, -1);
const TRAIL_LENGTH = 24;

/**
 * Energy ball that hovers in front of the palm while charging, then is
 * launched along –Z. On launch it stretches into a beam and leaves a
 * fading trail behind it.
 */
export class EnergyBall {
  readonly group = new THREE.Group();

  private core: THREE.Mesh;
  private halo: THREE.Mesh;
  private beam: THREE.Mesh;

  // Trail: a ribbon of ghost-spheres left along the flight path.
  private trail: THREE.Mesh[] = [];
  private trailIndex = 0;

  private state: "idle" | "charging" | "flying" = "idle";
  private flyVelocity = new THREE.Vector3();
  private flyAge = 0;

  constructor() {
    // Inner bright core
    const coreGeom = new THREE.SphereGeometry(0.07, 20, 20);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xeefcff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.core = new THREE.Mesh(coreGeom, coreMat);

    // Cyan halo
    const haloGeom = new THREE.SphereGeometry(0.16, 20, 20);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x6ee7ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.halo = new THREE.Mesh(haloGeom, haloMat);

    // Beam (only visible while flying) — a stretched ellipsoid oriented along velocity
    const beamGeom = new THREE.SphereGeometry(0.09, 16, 16);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xa0f0ff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.beam = new THREE.Mesh(beamGeom, beamMat);

    this.group.add(this.core);
    this.group.add(this.halo);
    this.group.add(this.beam);

    // Pre-allocate trail ghosts (lives in scene root, not in group, so they
    // stay where they were spawned).
    const ghostGeom = new THREE.SphereGeometry(0.08, 12, 12);
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const ghostMat = new THREE.MeshBasicMaterial({
        color: 0x6ee7ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.trail.push(new THREE.Mesh(ghostGeom, ghostMat));
    }
  }

  /** Attach trail meshes to the same parent as the ball group. */
  attachTo(parent: THREE.Object3D): void {
    parent.add(this.group);
    for (const g of this.trail) parent.add(g);
  }

  /** Anchor at world position; level 0..1 controls size and brightness. */
  charge(position: THREE.Vector3, level: number): void {
    this.state = "charging";
    this.group.position.lerp(position, 0.35);

    const scale = 0.35 + level * 0.55; // max ≈ 0.9 (was 2.2)
    this.group.scale.setScalar(scale);

    (this.core.material as THREE.MeshBasicMaterial).opacity = 0.6 + level * 0.4;
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.15 + level * 0.25;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0;
    this.beam.scale.set(1, 1, 1);
  }

  /** Launch in –Z direction at strength 0..1. */
  launch(strength: number, direction?: THREE.Vector3): void {
    this.state = "flying";
    this.flyAge = 0;
    const dir = (direction ?? FORWARD).clone().normalize();
    this.flyVelocity.copy(dir).multiplyScalar(8 + strength * 10);
    // Orient the beam along velocity (beam is +Z elongated)
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      dir,
    );
    this.beam.quaternion.copy(q);
    this.beam.scale.set(1, 1, 1);
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  cancel(): void {
    this.state = "idle";
    (this.core.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.halo.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0;
    this.group.scale.setScalar(0);
  }

  /** Called every frame with delta seconds. */
  tick(dt: number): void {
    // Fade all trail ghosts each frame
    for (const g of this.trail) {
      const m = g.material as THREE.MeshBasicMaterial;
      if (m.opacity > 0) {
        m.opacity = Math.max(0, m.opacity - dt * 1.6);
        g.scale.multiplyScalar(1 - dt * 0.4);
      }
    }

    if (this.state === "flying") {
      this.flyAge += dt;
      this.group.position.addScaledVector(this.flyVelocity, dt);

      // Stretch the beam in its travel direction
      this.beam.scale.z = 1 + this.flyAge * 8;
      this.beam.scale.x = Math.max(0.3, 1 - this.flyAge * 0.5);
      this.beam.scale.y = this.beam.scale.x;

      // Spawn a ghost periodically
      this.trailIndex = (this.trailIndex + 1) % this.trail.length;
      const ghost = this.trail[this.trailIndex];
      ghost.position.copy(this.group.position);
      ghost.scale.copy(this.group.scale);
      (ghost.material as THREE.MeshBasicMaterial).opacity = 0.7;

      // Fade core/halo as it travels
      const fade = Math.max(0, 1 - this.flyAge * 0.7);
      (this.core.material as THREE.MeshBasicMaterial).opacity = fade;
      (this.halo.material as THREE.MeshBasicMaterial).opacity = fade * 0.4;
      (this.beam.material as THREE.MeshBasicMaterial).opacity = fade;
      this.group.scale.multiplyScalar(1 + dt * 0.6);

      if (fade <= 0.02) this.cancel();
    } else if (this.state === "idle") {
      const m1 = this.core.material as THREE.MeshBasicMaterial;
      const m2 = this.halo.material as THREE.MeshBasicMaterial;
      const m3 = this.beam.material as THREE.MeshBasicMaterial;
      if (m1.opacity > 0) m1.opacity = Math.max(0, m1.opacity - dt * 4);
      if (m2.opacity > 0) m2.opacity = Math.max(0, m2.opacity - dt * 4);
      if (m3.opacity > 0) m3.opacity = Math.max(0, m3.opacity - dt * 4);
    }
  }

  isFlying(): boolean {
    return this.state === "flying";
  }

  reset(): void {
    this.cancel();
    this.group.position.set(0, 0, 0);
    for (const g of this.trail) {
      (g.material as THREE.MeshBasicMaterial).opacity = 0;
    }
  }
}

/** Floor ring on the ground plane, like the screenshot. */
export function createFloorRing(): THREE.Line {
  const segments = 96;
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * 1.3, -1.4, Math.sin(a) * 0.4));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0x6ee7ff,
    transparent: true,
    opacity: 0.35,
  });
  return new THREE.Line(geom, mat);
}
