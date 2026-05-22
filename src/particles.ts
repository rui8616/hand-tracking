import * as THREE from "three";

const PARTICLE_COUNT = 80;

export type ParticleMode = "idle" | "converge" | "hold" | "scatter" | "fire";

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  baseScale: number;
  jitterSeed: number;
}

/**
 * 80 small additive-blended spheres that swarm in from a shell around the
 * target, hold near it while charged, scatter on pose loss, or rocket along
 * the launch direction when fired.
 */
export class ChargeParticles {
  readonly group = new THREE.Group();

  private particles: Particle[] = [];
  private meshes: THREE.Mesh[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private mode: ParticleMode = "idle";

  constructor() {
    const geom = new THREE.SphereGeometry(1, 8, 8);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const baseScale = 0.014 + Math.random() * 0.022;
      const color = Math.random() < 0.25 ? 0xc084fc : 0x6ee7ff;
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.scale.setScalar(baseScale);
      mesh.visible = false;
      this.group.add(mesh);

      this.particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        baseScale,
        jitterSeed: Math.random() * Math.PI * 2,
      });
      this.meshes.push(mesh);
      this.mats.push(mat);
    }
  }

  mode_(): ParticleMode {
    return this.mode;
  }

  setMode(mode: ParticleMode): void {
    this.mode = mode;
  }

  /**
   * Give every particle an impulse along direction and switch to fire mode.
   * Call once on the fire-frame; subsequent frames just coast + fade.
   */
  fire(direction: THREE.Vector3, speed: number): void {
    this.mode = "fire";
    for (const p of this.particles) {
      p.velocity.copy(direction).multiplyScalar(speed);
      p.velocity.x += (Math.random() - 0.5) * 2;
      p.velocity.y += (Math.random() - 0.5) * 2;
      p.velocity.z += (Math.random() - 0.5) * 2;
    }
  }

  /**
   * Respawn all particles on a random spherical shell around target.
   * Call when entering aiming from idle/cooldown/scattered.
   */
  spawn(target: THREE.Vector3): void {
    this.mode = "converge";
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 1.8 + Math.random() * 1.4;
      p.position.set(
        target.x + r * Math.sin(phi) * Math.cos(theta),
        target.y + r * Math.sin(phi) * Math.sin(theta),
        target.z + r * Math.cos(phi),
      );
      p.velocity.set(0, 0, 0);
      this.mats[i].opacity = 0;
      this.meshes[i].visible = true;
      this.meshes[i].position.copy(p.position);
    }
  }

  /**
   * Advance the simulation one frame.
   *  - target: index fingertip in scene space (used by converge/hold/scatter)
   *  - level:  charge level 0..1 (affects converge pull strength & opacity)
   */
  update(
    dt: number,
    target: THREE.Vector3,
    level: number,
    nowSec = 0,
  ): void {
    if (this.mode === "idle") {
      // gentle fade-out, leave positions where they were
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const m = this.mats[i];
        if (m.opacity > 0) m.opacity = Math.max(0, m.opacity - dt * 3);
        this.meshes[i].visible = m.opacity > 0.01;
      }
      return;
    }

    const tmp = new THREE.Vector3();
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = this.particles[i];
      const mesh = this.meshes[i];
      const mat = this.mats[i];

      let targetOpacity = mat.opacity;

      switch (this.mode) {
        case "converge": {
          // accelerate toward target
          tmp.subVectors(target, p.position);
          const dist = tmp.length();
          if (dist > 1e-4) tmp.multiplyScalar(1 / dist);
          // pull stronger as level climbs
          const accel = 4 + level * 26;
          p.velocity.addScaledVector(tmp, accel * dt);
          // damping
          p.velocity.multiplyScalar(1 - dt * 1.4);
          // limit terminal speed so particles don't blow past target
          const maxSpeed = 2.5 + level * 4;
          const sp = p.velocity.length();
          if (sp > maxSpeed) p.velocity.multiplyScalar(maxSpeed / sp);
          targetOpacity = Math.min(0.95, 0.25 + level * 0.8);
          break;
        }

        case "hold": {
          // orbit / jitter around target
          tmp.subVectors(p.position, target);
          const r = tmp.length();
          // soft spring back to ring of radius 0.18
          const want = 0.18;
          const corr = (r - want) * 6;
          if (r > 1e-4) tmp.multiplyScalar(corr / r);
          p.velocity.addScaledVector(tmp, -dt);
          // jitter
          const j = 1.4;
          p.velocity.x += (Math.random() - 0.5) * j * dt;
          p.velocity.y += (Math.random() - 0.5) * j * dt;
          p.velocity.z += (Math.random() - 0.5) * j * dt;
          p.velocity.multiplyScalar(1 - dt * 2);
          targetOpacity = 0.9 + Math.sin(nowSec * 6 + p.jitterSeed) * 0.1;
          break;
        }

        case "scatter": {
          // explode outward and fade
          tmp.subVectors(p.position, target);
          if (tmp.lengthSq() < 1e-6) tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
          tmp.normalize();
          p.velocity.addScaledVector(tmp, 5 * dt);
          p.velocity.multiplyScalar(1 - dt * 0.6);
          targetOpacity = Math.max(0, mat.opacity - dt * 1.6);
          break;
        }

        case "fire": {
          // Coast on the impulse given by fire(); gently decelerate so they
          // don't shoot off forever, and fade out.
          p.velocity.multiplyScalar(1 - dt * 0.4);
          targetOpacity = Math.max(0, mat.opacity - dt * 1.2);
          break;
        }
      }

      p.position.addScaledVector(p.velocity, dt);
      mesh.position.copy(p.position);

      // ease opacity toward target
      const k = Math.min(1, dt * 6);
      mat.opacity += (targetOpacity - mat.opacity) * k;
      mesh.visible = mat.opacity > 0.01;
    }
  }
}
