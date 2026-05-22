import * as THREE from "three";

/** Drifting background starfield matching the screenshot's vibe. */
export function createStarfield(count = 600): THREE.Points {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const cyan = new THREE.Color(0x6ee7ff);
  const purple = new THREE.Color(0xc084fc);

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 5;

    const c = Math.random() < 0.7 ? cyan : purple;
    const t = 0.4 + Math.random() * 0.6;
    colors[i * 3 + 0] = c.r * t;
    colors[i * 3 + 1] = c.g * t;
    colors[i * 3 + 2] = c.b * t;
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return new THREE.Points(geom, mat);
}
