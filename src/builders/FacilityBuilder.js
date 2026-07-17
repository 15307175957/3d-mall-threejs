import * as THREE from 'three';

export function createFacilityGroup(facility, y, shopHeight) {
  const group = new THREE.Group();
  group.userData = { type: 'facility', facility };

  if (facility.type === 'elevator') {
    // 半透明长方体电梯井
    const w = facility.radius * 2;
    const h = shopHeight + 2;
    const geo = new THREE.BoxGeometry(w, h, w);
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xaaddff,
      metalness: 0.05,
      roughness: 0.1,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(facility.x, y + h / 2, facility.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // 内部光柱
    const coreGeo = new THREE.BoxGeometry(w * 0.55, h, w * 0.55);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.22
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.copy(mesh.position);
    group.add(core);
  }

  if (facility.type === 'escalator') {
    const len = 14;
    const geo = new THREE.BoxGeometry(4, 1.2, len);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x88aabb,
      metalness: 0.4,
      roughness: 0.4
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(facility.x, y + 0.6, facility.z);
    mesh.rotation.y = facility.rotation || 0;
    mesh.castShadow = true;
    group.add(mesh);

    // 箭头标识
    const arrowGeo = new THREE.PlaneGeometry(2, 4);
    const arrowCanvas = document.createElement('canvas');
    arrowCanvas.width = 64;
    arrowCanvas.height = 128;
    const ctx = arrowCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(22, 10, 20, 90);
    ctx.beginPath();
    ctx.moveTo(32, 115);
    ctx.lineTo(12, 85);
    ctx.lineTo(52, 85);
    ctx.closePath();
    ctx.fill();
    const arrowTex = new THREE.CanvasTexture(arrowCanvas);
    const arrowMat = new THREE.MeshBasicMaterial({ map: arrowTex, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = facility.rotation || 0;
    arrow.position.set(facility.x, y + 1.3, facility.z);
    group.add(arrow);
  }

  if (facility.type === 'restroom') {
    const geo = new THREE.BoxGeometry(facility.width, 0.4, facility.depth);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.65
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(facility.x, y + 0.2, facility.z);
    group.add(mesh);

    const iconGeo = new THREE.PlaneGeometry(4, 4);
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = 128;
    iconCanvas.height = 128;
    const ctx = iconCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px Microsoft YaHei';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('WC', 64, 64);
    const iconTex = new THREE.CanvasTexture(iconCanvas);
    const iconMat = new THREE.MeshBasicMaterial({ map: iconTex, transparent: true, side: THREE.DoubleSide });
    const icon = new THREE.Mesh(iconGeo, iconMat);
    icon.rotation.x = -Math.PI / 2;
    icon.position.set(facility.x, y + 0.45, facility.z);
    group.add(icon);
  }

  return group;
}
