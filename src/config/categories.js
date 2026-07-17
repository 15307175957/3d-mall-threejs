// 店铺可选颜色（默认色 + 多种色相，直接用颜色命名）
export const SHOP_CATEGORIES = [
  { value: 'default', label: '默认', color: '#4B8BBE' },
  { value: 'yellow', label: '黄色', color: '#F9A825' },
  { value: 'blue', label: '蓝色', color: '#1565C0' },
  { value: 'purple', label: '紫色', color: '#6A1B9A' },
  { value: 'green', label: '绿色', color: '#2E7D32' },
  { value: 'red', label: '红色', color: '#C62828' },
  { value: 'orange', label: '橙色', color: '#EF6C00' },
  { value: 'pink', label: '粉色', color: '#AD1457' },
  { value: 'cyan', label: '青色', color: '#00838F' },
  { value: 'brown', label: '棕色', color: '#6D4C41' },
  { value: 'skyblue', label: '天蓝', color: '#5fa0c8' }
];

// 类型 -> 颜色 映射
export const CATEGORY_COLORS = SHOP_CATEGORIES.reduce((m, c) => {
  m[c.value] = c.color;
  return m;
}, {});

// 类型 -> 中文标签
export const CATEGORY_LABELS = SHOP_CATEGORIES.reduce((m, c) => {
  m[c.value] = c.label;
  return m;
}, {});
