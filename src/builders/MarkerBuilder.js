import * as THREE from 'three';

// 标识立方体（入口/卫生间等）的视觉高度
const MARKER_HEIGHT = 3;

// 生成名称文字贴图（透明背景，居中显示名称，按背景明度自适应文字颜色）
function createNameTexture(text, bg) {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const baseColor = bg || '#2f6fb0';
  const c = new THREE.Color(baseColor);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  ctx.fillStyle = lum > 0.6 ? '#1a1a1a' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const name = text || '入口';
  let fontSize = 44;
  do {
    ctx.font = `bold ${fontSize}px Arial`;
    if (ctx.measureText(name).width <= w - 24) break;
    fontSize -= 3;
  } while (fontSize > 14);
  ctx.fillText(name, w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// 由 x/y/width/height（左下角 + 尺寸，场景 X=x、场景 Z=y）构建标识立方体
// kind: 'entry' | 'restroom'，决定颜色；顶面叠加名称文字贴片
export function createMarkerMesh(marker) {
  const { x, y, width, height, kind } = marker;
  const tall = marker.tall || MARKER_HEIGHT;
  const centerX = x + width / 2;
  const centerZ = y + height / 2;

  const color = kind === 'restroom' ? 0xffffff : 0x2f6fb0;
  const emissive = kind === 'restroom' ? 0x557799 : 0x1b4f8f;

  const geo = new THREE.BoxGeometry(width, tall, height);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.5,
    roughness: 0.5,
    metalness: 0.1
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(centerX, tall / 2, centerZ);
  mesh.userData = { type: 'marker', item: marker, kind };

  // 顶面名称文字贴片（平铺于立方体顶面，中心对齐；不参与射线检测/选中描边）
  const tex = createNameTexture(marker.name, kind === 'restroom' ? '#ffffff' : '#2f6fb0');
  const lw = Math.max(width * 1.5, 14);
  const lh = lw * 0.5;
  const labelGeo = new THREE.PlaneGeometry(lw, lh);
  const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const label = new THREE.Mesh(labelGeo, labelMat);
  label.rotation.x = -Math.PI / 2;
  label.position.set(0, tall / 2 + 0.6, 0); // 相对 mesh 中心，置于顶面之上
  label.raycast = () => {}; // 顶部文字不参与射线检测，避免遮挡选中
  label.userData.noHighlight = true; // 选中描边时跳过文字贴片
  mesh.add(label);

  return mesh;
}
