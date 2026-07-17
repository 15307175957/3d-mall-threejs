import * as THREE from 'three';

// 沿外轮廓生成一圈围栏墙（外轮廓 - 内缩轮廓，挤出高度）
export function createFence(outline, height = 12, thickness = 2.5) {
  // 计算质心，用于内缩
  let cx = 0, cz = 0;
  outline.forEach(([x, z]) => { cx += x; cz += z; });
  cx /= outline.length;
  cz /= outline.length;

  const inner = outline.map(([x, z]) => {
    const dx = x - cx, dz = z - cz;
    const len = Math.hypot(dx, dz) || 1;
    return [x - (dx / len) * thickness, z - (dz / len) * thickness];
  });

  const outer = new THREE.Shape();
  outer.moveTo(outline[0][0], -outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    outer.lineTo(outline[i][0], -outline[i][1]);
  }
  outer.closePath();

  const hole = new THREE.Path();
  hole.moveTo(inner[0][0], -inner[0][1]);
  for (let i = 1; i < inner.length; i++) {
    hole.lineTo(inner[i][0], -inner[i][1]);
  }
  hole.closePath();
  outer.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: height,
    bevelEnabled: false
  });
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#2a6aa0'),
    emissive: new THREE.Color('#0d223d'),
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.55,
    roughness: 0.3,
    metalness: 0.1,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'fence' };
  return mesh;
}
