// 品牌 Logo 图片路径配置
// 将 shop.logo 关键字映射到 src/images 文件夹中的品牌 PNG
// 在 LogoTexture 与编辑面板中按 logo 自动解析，无需每个店铺手写 img 路径
export const BRAND_IMAGES = {
  mcd: '/src/images/mdl.png',
  kfc: '/src/images/kfc.png',
  starbucks: '/src/images/starbucks.png'
};

// 默认占位图片路径（未配置品牌图时使用）
export const DEFAULT_IMAGE = '/src/images/暂无图片.svg';

// 取得某 logo 对应的品牌图片路径；无则返回 null
export function getBrandImagePath(logo) {
  return BRAND_IMAGES[logo] || null;
}
