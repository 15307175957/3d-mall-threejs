import * as THREE from 'three';
import { getLogoTexture } from '../utils/LogoTexture.js';

export const SHOP_HEIGHT = 12; // 门店立体建筑高度

// 由 x/y/width/height（或 polygon）得到矩形四角 [x, y]
function getRect(shop) {
  if (shop.polygon) {
    const xs = shop.polygon.map((p) => p[0]);
    const ys = shop.polygon.map((p) => p[1]);
    const minx = Math.min(...xs), miny = Math.min(...ys);
    return { x: minx, y: miny, w: Math.max(...xs) - minx, h: Math.max(...ys) - miny };
  }
  return { x: shop.x, y: shop.y, w: shop.width, h: shop.height };
}

function getPolygonCenter(rect) {
  return { x: rect.x + rect.w / 2, z: rect.y + rect.h / 2 };
}

// 立体挤出门店区块（高度取 shop.tall，未配置则用默认 SHOP_HEIGHT）
export function createShopMesh(shop, height = shop.tall || SHOP_HEIGHT) {
  const rect = getRect(shop);
  const { x, y, w, h } = rect;
  const shape = new THREE.Shape();
  // 若上传了 SVG 外形（相对商铺中心的轮廓点），按自定义形状挤出；否则矩形
  if (shop.shape && shop.shape.length >= 3) {
    const cx = x + w / 2;
    const cz = y + h / 2;
    shop.shape.forEach(([dx, dy], i) => {
      const X = cx + dx;
      const Z = cz + dy;
      if (i === 0) shape.moveTo(X, -Z);
      else shape.lineTo(X, -Z);
    });
    shape.closePath();
  } else {
    shape.moveTo(x, -y);
    shape.lineTo(x + w, -y);
    shape.lineTo(x + w, -(y + h));
    shape.lineTo(x, -(y + h));
    shape.closePath();
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false
  });
  geo.rotateX(-Math.PI / 2); // 挤出方向变为 +Y（高度）

  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(shop.color || '#4B8BBE'),
    emissive: new THREE.Color('#1a3a5c'),
    emissiveIntensity: 0.25,
    roughness: 0.45,
    metalness: 0.05,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData = { type: 'shop', shop };

  // 顶部 Logo 贴片（平铺于建筑顶面，中心对齐）
  const tex = getLogoTexture(shop);
  const lw = Math.min(26, Math.max(10, rect.w * 0.7));
  const lh = lw * 0.6;
  const logoGeo = new THREE.PlaneGeometry(lw, lh);
  const logoMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const logo = new THREE.Mesh(logoGeo, logoMat);
  logo.rotation.x = -Math.PI / 2;
  const c = getPolygonCenter(rect);
  logo.position.set(c.x, height + 0.6, c.z);
  // 品牌图按原始宽高比居中显示（不拉伸）：图片加载完成后适配店铺尺寸
  const fitLogo = () => {
    const aspect = tex.userData && tex.userData.aspect;
    if (!aspect) return;
    const maxW = Math.min(26, Math.max(10, rect.w * 0.9));
    const maxH = Math.max(6, rect.h * 0.5);
    let pw = maxW;
    let ph = maxW / aspect;
    if (ph > maxH) { ph = maxH; pw = maxH * aspect; }
    logo.scale.set(pw / lw, ph / lh, 1);
  };
  if (tex.userData && tex.userData.aspect) fitLogo();
  else tex.addEventListener('logoloaded', fitLogo);
  logo.raycast = () => {}; // 顶部 logo 不参与射线检测，避免遮挡门店选中
  logo.userData.noHighlight = true; // 选中描边时跳过顶部 logo
  mesh.add(logo);

  return mesh;
}

// 外轮廓底板（楼层地面）
export function createOutlineMesh(outline) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], -outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    shape.lineTo(outline[i][0], -outline[i][1]);
  }
  shape.closePath();

  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x0e2a4a,
    roughness: 0.7,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.2;
  mesh.receiveShadow = true;
  return mesh;
}
