import * as THREE from 'three';

export function createFloorMesh(outline, y, thickness, color = 0x2a5a7a) {
  const shape = new THREE.Shape();
  if (!outline || outline.length === 0) return null;

  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    shape.lineTo(outline[i][0], outline[i][1]);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.2,
    bevelSegments: 1
  });

  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y, 0);

  const material = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.05,
    roughness: 0.35,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// 沿楼层轮廓生成一圈围栏墙
export function createFence(outline, y, thickness, fenceHeight) {
  const group = new THREE.Group();
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x3a6a8a,
    metalness: 0.2,
    roughness: 0.5,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide
  });
  const wall = 0.8;

  for (let i = 0; i < outline.length; i++) {
    const p1 = outline[i];
    const p2 = outline[(i + 1) % outline.length];
    const dx = p2[0] - p1[0];
    const dz = p2[1] - p1[1];
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);

    const geo = new THREE.BoxGeometry(len, fenceHeight, wall);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (p1[0] + p2[0]) / 2,
      y + thickness + fenceHeight / 2,
      (p1[1] + p2[1]) / 2
    );
    mesh.rotation.y = -angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
