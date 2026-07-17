import * as THREE from 'three';

// 环形中庭（甜甜圈），平躺于 XZ 平面
export function createAtrium(atrium) {
  const radius = atrium?.radius ?? 32;
  const tube = atrium?.tube ?? 7;

  const geo = new THREE.TorusGeometry(radius, tube, 24, 96);
  geo.rotateX(-Math.PI / 2); // 平躺

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1E3A5F'),
    emissive: new THREE.Color('#0d223d'),
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.85,
    roughness: 0.5,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.3;
  mesh.userData = { type: 'atrium' };
  return mesh;
}
