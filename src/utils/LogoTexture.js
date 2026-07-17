import * as THREE from 'three';
import { BRAND_IMAGES } from '../config/brandImages.js';

const placeholderMap = {
  pizza: { text: 'Pizza Hut', bg: '#e4002b' },
  sunmerry: { text: 'SunMerry', bg: '#e86a9c' },
  days: { text: 'Days Inn', bg: '#ffd200' },
  jack: { text: 'Jack in the Box', bg: '#1a1a1a' },
  jazz: { text: 'Jazz', bg: '#ffc72c' },
  rbt: { text: 'rbt', bg: '#8b6f3a' },
  generic: { text: 'SHOP', bg: '#4b8bbe' },
  br: { text: 'BR', bg: '#2e8bd0' },
  chuan: { text: '川辣汇', bg: '#ff7a1a' },
  yogen: { text: 'yogen früz', bg: '#7ec8e3' },
  sunmerry2: { text: 'SunMerry', bg: '#e86a9c' }
};

const cache = new Map();
const loader = new THREE.TextureLoader();

// 缓存键：纳入 img/logo/name/showImage/color，任一改变都会重新生成贴图
function cacheKey(shop) {
  return [shop.id || '', shop.img || '', shop.logo || '', shop.name || '', shop.showImage, shop.color || ''].join('|');
}

// 根据 shop 生成 Logo 贴图：showImage 为 true 且有图片路径时显示图片，否则显示 name 文字
export function getLogoTexture(shop) {
  const key = cacheKey(shop);
  if (cache.has(key)) return cache.get(key);

  // 清理同一对象的旧缓存（如修改路径/名称/开关后），释放旧贴图避免内存泄漏
  const idPrefix = (shop.id || '') + '|';
  for (const k of Array.from(cache.keys())) {
    if (k.startsWith(idPrefix)) {
      const old = cache.get(k);
      if (old && old.dispose) old.dispose();
      cache.delete(k);
    }
  }

  let tex;
  const imgPath = shop.img || BRAND_IMAGES[shop.logo];
  const showImage = shop.showImage === true && !!imgPath; // 默认关（默认显示名称）

  if (showImage) {
    // 有图片路径：加载 PNG 并按原始宽高比绘制到 canvas（透明背景，居中，不拉伸）
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    tex = loader.load(imgPath, (t) => {
      const iw = t.image.width;
      const ih = t.image.height;
      const LONG = 512; // 画布长边像素，等比缩放保持清晰
      const scale = LONG / Math.max(iw, ih);
      const dw = Math.max(1, Math.round(iw * scale));
      const dh = Math.max(1, Math.round(ih * scale));
      canvas.width = dw;
      canvas.height = dh;
      ctx.clearRect(0, 0, dw, dh);
      ctx.drawImage(t.image, 0, 0, dw, dh);
      t.image = canvas; // 用绘制好的 canvas 替换原图，保留原始宽高比
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      tex.userData = tex.userData || {};
      tex.userData.aspect = dw / dh; // 原图宽高比，供 ShopBuilder 居中适配
      tex.dispatchEvent({ type: 'logoloaded' });
    });
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
  } else {
    // 无图片路径：显示名称文字贴图
    const w = 256;
    const h = 160;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    const info = placeholderMap[shop.logo] || { text: 'SHOP', bg: '#4b8bbe' };
    const text = shop.name || info.text;
    // 文字标识背景与边框同步几何体颜色（类型/颜色改变即跟随）
    const baseColor = shop.color || info.bg;
    const borderColor = lighten(baseColor, 0.22);
    ctx.fillStyle = baseColor;
    roundRect(ctx, 24, 36, w - 48, h - 72, 18);
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    // 文字颜色按背景明度自适应，保证可读性
    const c = new THREE.Color(baseColor);
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    ctx.fillStyle = lum > 0.6 ? '#1a1a1a' : '#ffffff';
    // 名称过长时自动缩小字号以适应贴图宽度
    let fontSize = 42;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    do {
      ctx.font = `bold ${fontSize}px Arial`;
      if (ctx.measureText(text).width <= w - 60) break;
      fontSize -= 3;
    } while (fontSize > 14);
    ctx.fillText(text, w / 2, h / 2);

    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
  }

  cache.set(key, tex);
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 将颜色提亮 amt（HSL 明度增量），返回 #rrggbb
function lighten(hex, amt) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, 0, amt);
  return '#' + c.getHexString();
}
