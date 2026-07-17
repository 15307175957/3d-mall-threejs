import * as THREE from 'three';
import { SceneManager } from './core/SceneManager.js';
import { createShopMesh, createOutlineMesh, SHOP_HEIGHT } from './builders/ShopBuilder.js';
import { createElevatorMesh, disposeElevator, ELEVATOR_HEIGHT } from './builders/ElevatorBuilder.js';
import { createMarkerMesh } from './builders/MarkerBuilder.js';
import { createFence } from './builders/FenceBuilder.js';
import { getBrandImagePath, DEFAULT_IMAGE } from './config/brandImages.js';
import { SHOP_CATEGORIES, CATEGORY_COLORS } from './config/categories.js';
import { parseSvgOutline } from './utils/svgOutline.js';
import mallData from './data/mall.json';

// ============ 数据迁移：旧单层结构自动包成 floors 数组 ============
if (!Array.isArray(mallData.floors)) {
  const single = {
    floor: mallData.floor || { id: 1, name: '1F' },
    outline: mallData.outline || [],
    atrium: mallData.atrium || {},
    shops: mallData.shops || [],
    elevators: mallData.elevators || [],
    entries: mallData.entries || [],
    restrooms: mallData.restrooms || []
  };
  Object.keys(mallData).forEach((k) => delete mallData[k]);
  mallData.floors = [single];
}

// 楼层间距（≈电梯高度），堆叠后各层电梯块自然连成竖条（可调）
const FLOOR_GAP = 30;

const app = document.getElementById('app');
const sceneManager = new SceneManager(app);

let hoveredMesh = null;
// 记录 hover 前各材质原始颜色（支持 Group 多材质）
let hoveredOrigins = [];

// hover 高亮：仅将对象各材质明度提升（场地面积大，用更弱的增量避免突兀）
function brightenHovered(mesh) {
  const isFloor = mesh.userData && mesh.userData.type === 'floor';
  const delta = isFloor ? 0.035 : 0.1;
  hoveredOrigins = [];
  mesh.traverse((o) => {
    if (o.isMesh && o.material && o.material.color && !(o.userData && o.userData.isHighlight)) {
      hoveredOrigins.push({ material: o.material, hex: o.material.color.getHex() });
      const c = o.material.color.clone();
      c.offsetHSL(0, 0, delta);
      o.material.color.copy(c);
    }
  });
}

// ============ 多层架构：每层一个 Group，在 Y 轴堆叠 ============
const floorItem = { id: '__floor__', name: '场地' };
const floorObjs = [];      // { data, group, outlineMesh, fenceMesh, elevatorMeshes, shopMeshes, markerMeshes }
let currentFloorIndex = Math.max(0, mallData.floors.length - 1); // 默认聚焦顶层
let overviewMode = false;
let editMode = true; // true=编辑模式(默认), false=浏览模式(仅允许切换楼层/总览)
const cur = () => floorObjs[currentFloorIndex];

// 构建单层的所有网格（外轮廓/围栏/电梯/店铺/标识）
function buildFloor(f) {
  const d = f.data;
  if (d.outline && d.outline.length) {
    f.outlineMesh = createOutlineMesh(d.outline);
    f.outlineMesh.userData.item = floorItem;
    f.outlineMesh.userData.type = 'floor';
    f.outlineMesh.userData.source = 'outline';
    f.group.add(f.outlineMesh);
    f.fenceMesh = createFence(d.outline, SHOP_HEIGHT);
    f.group.add(f.fenceMesh);
  }
  (d.elevators || []).forEach((elevator) => {
    const mesh = createElevatorMesh(elevator);
    f.group.add(mesh);
    f.elevatorMeshes.push(mesh);
  });
  (d.shops || []).forEach((shop) => {
    const mesh = createShopMesh(shop);
    mesh.userData.item = shop;
    mesh.userData.source = 'shops';
    f.group.add(mesh);
    f.shopMeshes.push(mesh);
  });
  addMarkers(f, d.entries, 'entries', 'entry');
  addMarkers(f, d.restrooms, 'restrooms', 'restroom');
}

// 入口 / 卫生间等标识立方体（数据驱动，可点击/编辑/删除）
function addMarkers(f, list, source, kind) {
  (list || []).forEach((m) => {
    m.kind = kind;
    const mesh = createMarkerMesh(m);
    mesh.userData.source = source;
    f.group.add(mesh);
    f.markerMeshes.push(mesh);
  });
}

// 初始化所有楼层
mallData.floors.forEach((fd, i) => {
  const group = new THREE.Group();
  group.position.y = i * FLOOR_GAP;
  group.userData = { floorIndex: i };
  sceneManager.scene.add(group);
  const f = {
    data: fd, group,
    outlineMesh: null, fenceMesh: null,
    elevatorMeshes: [], shopMeshes: [], markerMeshes: []
  };
  buildFloor(f);
  floorObjs.push(f);
});

// 交互：射线检测
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('tooltip');

// 编辑面板元素
const editorPanel = document.getElementById('editor-panel');
const editorShopName = document.getElementById('editor-shop-name');
const editX = document.getElementById('edit-x');
const editY = document.getElementById('edit-y');
const editW = document.getElementById('edit-w');
const editH = document.getElementById('edit-h');
const editAdd = document.getElementById('edit-add');
const editApply = document.getElementById('edit-apply');
const editSave = document.getElementById('edit-save');
const editReset = document.getElementById('edit-reset');
const editDelete = document.getElementById('edit-delete');
const editorWarning = document.getElementById('editor-warning');
const editorStatus = document.getElementById('editor-status');
const editName = document.getElementById('edit-name');
const editCategory = document.getElementById('edit-category');
const editorRowXY = document.getElementById('editor-row-xy');
const editNameLabel = document.querySelector('.editor-name-label');
const editCategoryLabel = document.querySelector('.editor-category-label');
const editorBrand = document.getElementById('editor-brand');
const editorBrandImg = document.getElementById('editor-brand-img');
const editorBrandPath = document.getElementById('editor-brand-path');
const editorShowImage = document.getElementById('editor-show-image');
const editorBrandUpload = document.getElementById('editor-brand-upload');
const editorBrandFile = document.getElementById('editor-brand-file');
const editorFloor = document.getElementById('editor-floor');
const editUploadSvg = document.getElementById('edit-upload-svg');
const editorSvgFile = document.getElementById('editor-svg-file');
const editorShopSvg = document.getElementById('editor-shop-svg');
const editUploadShopSvg = document.getElementById('edit-upload-shop-svg');
const editorShopSvgFile = document.getElementById('editor-shop-svg-file');
const editorRowFloorSize = document.getElementById('editor-row-floor-size');
const editorRowGeoSize = document.getElementById('editor-row-geo-size');
const editLen = document.getElementById('edit-len');
const editWide = document.getElementById('edit-wide');
const editHigh = document.getElementById('edit-high');
const lockFloorRatio = document.getElementById('lock-floor-ratio');
const lockGeoRatio = document.getElementById('lock-geo-ratio');
const editExport = document.getElementById('edit-export');
const editImport = document.getElementById('edit-import');
const editorImportFile = document.getElementById('editor-import-file');

// 楼层面板元素
const floorLabel = document.getElementById('floor-label');
const editFloorId = document.getElementById('edit-floor-id');
const floorButtons = document.getElementById('floor-buttons');
const overviewToggle = document.getElementById('overview-toggle');
const floorAddBtn = document.getElementById('floor-add');
const floorDelBtn = document.getElementById('floor-del');

// 编辑 / 浏览 模式切换
const modeGroup = document.getElementById('mode-group');
const modeBtns = modeGroup ? Array.from(modeGroup.querySelectorAll('.mode-btn')) : [];

// 切换编辑/浏览模式：浏览模式仅允许切换楼层与总览，禁用一切新增/删除/编辑
function setMode(edit) {
  editMode = edit;
  modeBtns.forEach((b) => b.classList.toggle('active', (b.dataset.mode === 'edit') === edit));

  // 编辑面板：浏览模式隐藏
  if (editorPanel) editorPanel.classList.toggle('hidden', !edit);

  // 楼层增删按钮：预览模式下直接隐藏（不再仅置灰禁用）
  if (floorAddBtn) floorAddBtn.style.display = edit ? '' : 'none';
  if (floorDelBtn) floorDelBtn.style.display = edit ? '' : 'none';

  // 编辑面板内所有操作按钮
  [editAdd, editApply, editSave, editReset, editDelete, editExport, editImport,
   editorBrandUpload, editUploadSvg, editUploadShopSvg].forEach((b) => {
    if (b) b.disabled = !edit;
  });

  // 输入框 / 下拉 / 开关
  [editName, editX, editY, editW, editH, editLen, editWide, editHigh,
   editorBrandPath, editCategory, editorShowImage, editFloorId].forEach((el) => {
    if (el) el.disabled = !edit;
  });

  if (!edit) {
    // 浏览模式：清除选中（不重新激活场地编辑），退出拖拽
    if (selectedMesh) clearSelectionHighlight();
    selectedMesh = null;
    selectedShop = null;
    floorEditActive = false;
    isDragging = false;
    if (sceneManager.controls) sceneManager.controls.enabled = true;
    if (editorShopName) editorShopName.textContent = '—';
    clearEditorFields();
    updateFloorPanel();
  } else {
    activateFloorEditor();
  }
}

// 室内几何体默认挤出高度（Y 方向），未配置 tall 时回退
function defaultTall(type) {
  if (type === 'elevator') return SHOP_HEIGHT * 2;
  if (type === 'marker') return 3;
  return SHOP_HEIGHT;
}

// 类型下拉：选择「电梯」即将几何体切换为 3F 电梯样式；选择颜色则为商铺并上色
function onCategoryChange() {
  if (!selectedShop) return;
  const val = editCategory.value;
  if (val === 'elevator') {
    convertSelectedToType('elevator');
    return;
  }
  // 颜色选项：若当前是电梯则先转回商铺
  if (selectedType === 'elevator') {
    convertSelectedToType('shop');
  }
  selectedShop.category = val || undefined;
  if (val && CATEGORY_COLORS[val]) selectedShop.color = CATEGORY_COLORS[val];
  if (hoveredMesh === selectedMesh) restoreHovered();
  rebuildSelectedMesh();
}

// 显示图片开关：开=立方体顶部显示图片，关=显示名称文本（实时重建）
function onShowImageChange() {
  if (!selectedShop) return;
  selectedShop.showImage = editorShowImage.checked;
  editorBrandImg.style.display = editorShowImage.checked ? '' : 'none';
  if (hoveredMesh === selectedMesh) restoreHovered();
  rebuildSelectedMesh();
}

// 品牌图路径输入：实时预览并更新数据
function onBrandPathInput() {
  if (!selectedShop) return;
  const v = editorBrandPath.value.trim();
  selectedShop.img = v; // 空字符串会回退到品牌配置/默认图
  editorBrandImg.src = v || DEFAULT_IMAGE;
  editorBrandImg.style.display = editorShowImage.checked ? '' : 'none';
}

// 上传图片：保存到 src/images/ 并写入相对路径（不转 base64），自动开启显示
function onBrandFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file || !selectedShop) return;
  editorBrandUpload.disabled = true;
  editorBrandUpload.textContent = '上传中…';
  fetch('/api/upload-image?name=' + encodeURIComponent(file.name), {
    method: 'POST',
    body: file
  })
    .then((r) => r.json())
    .then((json) => {
      if (!json || !json.ok) throw new Error((json && json.error) || '上传失败');
      const rel = json.path;
      selectedShop.img = rel;
      editorBrandPath.value = rel;
      editorBrandImg.src = rel;
      if (editorShowImage) {
        editorShowImage.checked = true;
        selectedShop.showImage = true;
      }
      editorBrandImg.style.display = '';
      if (hoveredMesh === selectedMesh) restoreHovered();
      rebuildSelectedMesh();
      showStatus('已上传图片：' + rel, true);
    })
    .catch((err) => {
      showStatus('上传失败：' + err.message, false);
    })
    .finally(() => {
      editorBrandUpload.disabled = false;
      editorBrandUpload.textContent = '上传图片';
      editorBrandFile.value = ''; // 允许重复选择同一文件
    });
}

let selectedMesh = null;
let selectedShop = null;      // 当前选中的数据对象（店铺/电梯/标识）
let selectedType = 'shop';    // 'shop' | 'elevator' | 'marker' | 'floor'
let selectedSource = 'shops'; // 数据来源数组名

// 楼层编辑激活状态：由右上角楼层按钮触发（显示绿色圆点 + 场地编辑参数）
// 选中商铺/电梯/标识或点击空白/场地时退出，绿色圆点隐藏
let floorEditActive = false;
let activeFloorIndex = -1;

// 拖拽状态：仅在平面内（世界 X/Z，对应数据 X/Y）移动，锁定垂直方向（Z 轴高度不变）
let isDragging = false;
let dragDidMove = false;
const dragPlane = new THREE.Plane();
const dragStartWorld = new THREE.Vector3();
const dragOrigData = { x: 0, y: 0 };
const dragOrigMeshPos = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();

// 所有可选中对象（当前层：店铺 + 电梯 + 标识；总览：全部楼层）
// 注意：场地底板（outlineMesh）不参与射线检测——场地交互仅通过右上角楼层按钮激活，
// 因此鼠标滑过场地不会变色，也无法点选场地。
function selectableMeshes() {
  if (overviewMode) {
    const arr = [];
    floorObjs.forEach((f) => {
      arr.push(...f.shopMeshes, ...f.elevatorMeshes, ...f.markerMeshes);
    });
    return arr;
  }
  const f = cur();
  return f.shopMeshes.concat(f.elevatorMeshes, f.markerMeshes);
}

// 射线拾取：跳过标记为 skipOcclusion 的半透明对象（如电梯箱体），
// 以便透过它选中其后方的实体对象；若射线仅命中此类对象则仍选中它（电梯本身）
function pickIntersection(intersects) {
  const solid = intersects.find((it) => !(it.object.userData && it.object.userData.skipOcclusion));
  return solid || intersects[0];
}

// 启动时深拷贝一份原始布局，用于「重置」回退到已保存状态
let originalMall = JSON.parse(JSON.stringify(mallData));

// 由外轮廓计算围栏边界 [minX, maxX, minY, maxY]（作用域：当前层）
function getFenceBounds() {
  const o = cur().data.outline;
  if (!o || !o.length) return null;
  const xs = o.map((p) => p[0]);
  const ys = o.map((p) => p[1]);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

// 碰撞/越界检测：返回警告文本数组（空数组表示无问题）
function checkCollisions(shop, x, y, w, h) {
  const warns = [];
  const r1 = { x1: x, x2: x + w, y1: y, y2: y + h };

  // 1) 与围栏越界对比
  const b = getFenceBounds();
  if (b) {
    if (r1.x1 < b.minX || r1.x2 > b.maxX || r1.y1 < b.minY || r1.y2 > b.maxY) {
      warns.push('超出围墙范围');
    }
  }

  // 2) 与其它店铺 / 电梯重叠对比（AABB 相交，且排除自身，仅当前层）
  const others = (cur().data.shops || []).concat(cur().data.elevators || []);
  others.forEach((s) => {
    if (s === shop) return;
    const r2 = { x1: s.x, x2: s.x + s.width, y1: s.y, y2: s.y + s.height };
    const overlap = r1.x1 < r2.x2 && r1.x2 > r2.x1 && r1.y1 < r2.y2 && r1.y2 > r2.y1;
    if (overlap) warns.push(`与「${s.name}」重叠`);
  });

  return warns;
}

// 根据当前输入框值更新碰撞提示
function updateCollisionWarning() {
  if (!selectedShop) return;
  if (selectedType === 'floor') { editorWarning.classList.add('hidden'); return; }
  const x = parseFloat(editX.value);
  const y = parseFloat(editY.value);
  const w = parseFloat(editLen.value);
  const h = parseFloat(editWide.value);
  if (![x, y, w, h].every((v) => Number.isFinite(v)) || w <= 0 || h <= 0) {
    editorWarning.classList.add('hidden');
    return;
  }
  const warns = checkCollisions(selectedShop, x, y, w, h);
  if (warns.length) {
    editorWarning.textContent = '⚠ ' + warns.join('；');
    editorWarning.classList.remove('hidden');
  } else {
    editorWarning.classList.add('hidden');
  }
}

function showStatus(msg, ok) {
  editorStatus.textContent = msg;
  editorStatus.classList.toggle('error', !ok);
  editorStatus.classList.remove('hidden');
}

function onPointerMove(event) {
  if (!editMode) {
    restoreHovered();
    tooltip.classList.remove('visible');
    document.body.style.cursor = 'default';
    return;
  }
  if (isDragging) { handleDragMove(event); return; }
  const rect = app.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, sceneManager.camera);
  const intersects = raycaster.intersectObjects(selectableMeshes(), true);

  if (intersects.length > 0) {
    let obj = pickIntersection(intersects).object;
    while (obj && !(obj.userData && obj.userData.item)) obj = obj.parent;
    if (!obj) {
      restoreHovered();
      tooltip.classList.remove('visible');
      document.body.style.cursor = 'default';
      return;
    }
    const mesh = obj;
    if (hoveredMesh !== mesh) {
      restoreHovered();
      hoveredMesh = mesh;
      brightenHovered(mesh);
      document.body.style.cursor = 'pointer';
    }
    tooltip.textContent = mesh.userData.item.name;
    tooltip.classList.add('visible');
    tooltip.style.left = event.clientX + 12 + 'px';
    tooltip.style.top = event.clientY + 12 + 'px';
  } else {
    restoreHovered();
    tooltip.classList.remove('visible');
    document.body.style.cursor = 'default';
  }
}

// 拖拽对象（仅在 X/Z 平面移动，锁定垂直方向）：按下选中并进入拖拽
function onPointerDown(event) {
  dragDidMove = false; // 每次按下重置，避免上次拖拽残留导致误抑制 click
  if (!editMode) return; // 浏览模式：禁止选中与拖拽
  if (event.button !== 0) return;
  const rect = app.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, sceneManager.camera);
  const intersects = raycaster.intersectObjects(selectableMeshes(), true);
  if (intersects.length === 0) return;
  let obj = pickIntersection(intersects).object;
  while (obj && !(obj.userData && obj.userData.item)) obj = obj.parent;
  if (!obj || obj.userData.type === 'floor') return;

  // 选中该对象并退出楼层编辑（隐藏绿色圆点）
  floorEditActive = false;
  updateFloorPanel();
  selectShop(obj, obj.userData.item, obj.userData.type || 'shop', obj.userData.source || 'shops');

  // 以对象当前世界高度的水平面作为拖拽基准面
  obj.getWorldPosition(_tmpVec);
  dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), _tmpVec);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
  dragStartWorld.copy(hit);
  dragOrigData.x = selectedShop.x;
  dragOrigData.y = selectedShop.y;
  dragOrigMeshPos.copy(selectedMesh.position);
  isDragging = true;
  dragDidMove = false;
  document.body.style.cursor = 'move';
  // 拖拽对象时禁用相机轨道控制，避免同时旋转视角
  if (sceneManager.controls) sceneManager.controls.enabled = false;
}

// 拖拽过程中：将鼠标在水平面的位移映射到对象位置与数据坐标，并同步输入框
function handleDragMove(event) {
  const rect = app.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, sceneManager.camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
  const dx = hit.x - dragStartWorld.x;
  const dz = hit.z - dragStartWorld.z;
  if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) dragDidMove = true;

  // 锁定垂直方向：仅平移 X / Z（世界），对应数据 X / Y 平面
  selectedMesh.position.x = dragOrigMeshPos.x + dx;
  selectedMesh.position.z = dragOrigMeshPos.z + dz;

  // 同步数据坐标：所有类型场景 X=数据x、场景 Z=数据y（正向），故均 +dx / +dz
  selectedShop.x = Math.round(dragOrigData.x + dx);
  selectedShop.y = Math.round(dragOrigData.y + dz);

  // 坐标参数同步更新
  if (editX) editX.value = selectedShop.x;
  if (editY) editY.value = selectedShop.y;
  updateCollisionWarning();
}

// 拖拽结束：将最新数据烘焙进网格（重建）
function onPointerUp() {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = 'default';
  // 恢复相机轨道控制
  if (sceneManager.controls) sceneManager.controls.enabled = true;
  if (dragDidMove) {
    rebuildSelectedMesh();
    updateCollisionWarning();
  }
}

function restoreHovered() {
  if (hoveredMesh) {
    hoveredOrigins.forEach(({ material, hex }) => {
      if (material) material.color.setHex(hex);
    });
  }
  hoveredMesh = null;
  hoveredOrigins = [];
}

// 找到某 mesh 所属楼层的索引（向上回溯到带 floorIndex 的 Group）
function getFloorIndexOfMesh(mesh) {
  let p = mesh;
  while (p && !(p.userData && p.userData.floorIndex !== undefined)) p = p.parent;
  return p ? p.userData.floorIndex : currentFloorIndex;
}

// 取消选中：清空高亮与编辑面板，并退出楼层编辑模式（隐藏绿色圆点）
function deselectAll() {
  if (selectedMesh) clearSelectionHighlight();
  selectedMesh = null;
  selectedShop = null;
  // 编辑面板取消自动隐藏：保持可见，回到当前楼层参数视图（场地为默认上下文）
  activateFloorEditor();
}

function onPointerClick(event) {
  // 浏览模式：禁止点选对象（仅楼层按钮/总览可交互）
  if (!editMode) return;
  // 拖拽结束后抑制本次 click，避免重复选中/取消
  if (dragDidMove) { dragDidMove = false; return; }
  const rect = app.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, sceneManager.camera);
  const intersects = raycaster.intersectObjects(selectableMeshes(), true);

  if (intersects.length > 0) {
    let obj = pickIntersection(intersects).object;
    while (obj && !(obj.userData && obj.userData.item)) obj = obj.parent;
    if (!obj) { deselectAll(); return; }
    // 点击场地（外轮廓底板）不再激活楼层编辑，仅作取消选中处理
    if (obj.userData.type === 'floor') {
      deselectAll();
      return;
    }
    const fi = getFloorIndexOfMesh(obj);
    // 总览下点中其它层 → 退出总览并聚焦该层；聚焦下点中其它层 → 切换
    if (overviewMode || fi !== currentFloorIndex) {
      overviewMode = false;
      switchFloor(fi);
    }
    // 选中商铺/电梯/标识 → 退出楼层编辑模式（隐藏绿色圆点），展示对象参数
    floorEditActive = false;
    updateFloorPanel();
    selectShop(obj, obj.userData.item, obj.userData.type || 'shop', obj.userData.source || 'shops');
  }
  // 注意：空白处单击不再切换回场地，改为双击（见 onPointerDblClick）
}

// 双击空白处：取消选中并切换回场地（楼层参数视图）
function onPointerDblClick(event) {
  if (!editMode) return;
  const rect = app.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, sceneManager.camera);
  const intersects = raycaster.intersectObjects(selectableMeshes(), true);
  // 仅当点击空白处（未命中任何可选对象）时切换回场地
  if (intersects.length === 0) deselectAll();
}

// 选中对象（店铺/电梯/标识）：填充信息卡与编辑面板
function selectShop(mesh, item, type, source) {
  addSelectionHighlight(mesh);
  selectedMesh = mesh;
  selectedShop = item;
  selectedType = type || 'shop';
  selectedSource = source || 'shops';
  if (editorPanel) editorPanel.classList.remove('hidden');
  editorWarning.classList.add('hidden');
  editorStatus.classList.add('hidden');
  if (editorShopName) editorShopName.textContent = item.name;

  // 场地：仅显示名称与宽高（包围盒尺寸），隐藏坐标/类型/品牌
  if (selectedType === 'floor') {
    if (editName) editName.value = item.name || '场地';
    if (editNameLabel) editNameLabel.style.display = 'none';
    if (editCategoryLabel) editCategoryLabel.style.display = 'none';
    if (editorBrand) editorBrand.classList.add('hidden');
    if (editorRowXY) editorRowXY.style.display = 'none';
    if (editorRowGeoSize) editorRowGeoSize.style.display = 'none';
    if (editorRowFloorSize) editorRowFloorSize.style.display = '';
    if (editorFloor) editorFloor.classList.remove('hidden');
    if (editorShopSvg) editorShopSvg.classList.add('hidden');
    if (editFloorId) editFloorId.value = cur().data.floor.id;
    const b = getFenceBounds();
    if (b) {
      if (editW) editW.value = Math.round(b.maxX - b.minX);
      if (editH) editH.value = Math.round(b.maxY - b.minY);
    }
    return;
  }

  // 非场地：隐藏场地 SVG 上传区；仅商铺显示「商铺外观」SVG 上传区
  if (editorFloor) editorFloor.classList.add('hidden');
  if (editorShopSvg) editorShopSvg.classList.toggle('hidden', selectedType !== 'shop');

  if (editNameLabel) editNameLabel.style.display = '';
  if (editorRowXY) editorRowXY.style.display = '';
  if (editorRowFloorSize) editorRowFloorSize.style.display = 'none';
  if (editorRowGeoSize) editorRowGeoSize.style.display = '';
  if (editName) editName.value = item.name || '';
  if (editCategory) editCategory.value = selectedType === 'elevator' ? 'elevator' : (item.category || '');
  if (editCategoryLabel) editCategoryLabel.style.display = (selectedType === 'shop' || selectedType === 'elevator') ? '' : 'none';
  if (editX) editX.value = item.x;
  if (editY) editY.value = item.y;
  if (editLen) editLen.value = item.width;
  if (editWide) editWide.value = item.height;
  if (editHigh) editHigh.value = item.tall != null ? item.tall : defaultTall(selectedType);

  if (selectedType === 'shop' && editorBrand) {
    const configPath = selectedShop.img || getBrandImagePath(selectedShop.logo) || '';
    editorBrandImg.src = configPath || DEFAULT_IMAGE;
    editorBrandImg.style.display = selectedShop.showImage === true ? '' : 'none';
    editorBrandPath.value = configPath;
    if (editorShowImage) editorShowImage.checked = selectedShop.showImage === true;
    editorBrand.classList.remove('hidden');
  } else if (editorBrand) {
    editorBrand.classList.add('hidden');
  }
}

// 重建场地（外轮廓底板 + 围栏），并保持可选中（作用域：当前层）
function rebuildFloor() {
  const f = cur();
  if (f.outlineMesh) { f.group.remove(f.outlineMesh); disposeMesh(f.outlineMesh); }
  if (f.fenceMesh) { f.group.remove(f.fenceMesh); disposeMesh(f.fenceMesh); }
  f.outlineMesh = createOutlineMesh(f.data.outline);
  f.outlineMesh.userData.item = floorItem;
  f.outlineMesh.userData.type = 'floor';
  f.outlineMesh.userData.source = 'outline';
  f.group.add(f.outlineMesh);
  f.fenceMesh = createFence(f.data.outline, SHOP_HEIGHT);
  f.group.add(f.fenceMesh);
  if (selectedType === 'floor' && selectedMesh) {
    selectedMesh = f.outlineMesh;
    addSelectionHighlight(f.outlineMesh);
  }
}

// 按新宽高缩放场地外轮廓（绕包围盒中心等比映射到目标尺寸）
function applyFloorSize(newW, newH) {
  const o = cur().data.outline;
  if (!o || !o.length) return;
  const b = getFenceBounds();
  const curW = b.maxX - b.minX;
  const curH = b.maxY - b.minY;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const sx = curW ? newW / curW : 1;
  const sy = curH ? newH / curH : 1;
  o.forEach((p) => {
    p[0] = cx + (p[0] - cx) * sx;
    p[1] = cy + (p[1] - cy) * sy;
  });
  rebuildFloor();
}

// 按当前类型用对应构建器重建选中网格（释放旧资源）
function rebuildSelectedMesh() {
  if (selectedType === 'floor') { rebuildFloor(); return; }
  const f = cur();
  let newMesh;
  if (selectedType === 'shop') newMesh = createShopMesh(selectedShop);
  else if (selectedType === 'elevator') newMesh = createElevatorMesh(selectedShop);
  else newMesh = createMarkerMesh(selectedShop);

  const selArr = selectedType === 'shop' ? f.shopMeshes
    : selectedType === 'elevator' ? f.elevatorMeshes
    : f.markerMeshes;
  const idx = selArr.indexOf(selectedMesh);
  f.group.remove(selectedMesh);
  disposeMesh(selectedMesh);
  newMesh.userData.item = selectedShop;
  newMesh.userData.type = selectedType;
  newMesh.userData.source = selectedSource;
  f.group.add(newMesh);
  if (idx !== -1) selArr[idx] = newMesh;
  selectedMesh = newMesh;
  addSelectionHighlight(newMesh);
}

// 释放网格（及其子网格）的几何体与材质
function disposeMesh(mesh) {
  mesh.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else if (o.material) o.material.dispose();
    }
  });
}

// 选中高亮：在对象各子网格边缘叠加一层亮色描边线条
const HIGHLIGHT_COLOR = 0x6ecbff;

function clearSelectionHighlight() {
  const m = selectedMesh;
  if (!m || typeof m.traverse !== 'function') return;
  m.traverse((o) => {
    if (o.userData && o.userData.isHighlight) {
      if (o.parent) o.parent.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
  });
}

function addSelectionHighlight(mesh) {
  clearSelectionHighlight();
  mesh.traverse((o) => {
    if (o.isMesh && o.geometry && !(o.userData && (o.userData.isHighlight || o.userData.noHighlight))) {
      const edges = new THREE.EdgesGeometry(o.geometry, 1);
      const lineMat = new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR });
      const line = new THREE.LineSegments(edges, lineMat);
      line.userData.isHighlight = true;
      line.renderOrder = 999;
      o.add(line);
    }
  });
}

// 应用编辑：更新数据并重建网格（作用域：当前层）
function applyEdit() {
  if (!editMode) return;
  if (!selectedShop || !selectedMesh) return;

  if (selectedType === 'floor') {
    const fw = parseFloat(editW.value);
    const fh = parseFloat(editH.value);
    if (!Number.isFinite(fw) || !Number.isFinite(fh) || fw <= 0 || fh <= 0) return;
    applyFloorSize(fw, fh);
    showStatus('已调整场地尺寸（保存后生效）', true);
    return;
  }

  const x = parseFloat(editX.value);
  const y = parseFloat(editY.value);
  const len = parseFloat(editLen.value);
  const wide = parseFloat(editWide.value);
  const high = parseFloat(editHigh.value);
  if (![x, y, len, wide, high].every((v) => Number.isFinite(v)) || len <= 0 || wide <= 0 || high <= 0) return;

  selectedShop.x = x;
  selectedShop.y = y;
  selectedShop.width = len;
  selectedShop.height = wide;
  selectedShop.tall = high;
  if (editName) {
    const nm = editName.value.trim();
    if (nm) selectedShop.name = nm;
  }
  if (selectedType === 'shop' && editorBrandPath) {
    selectedShop.img = editorBrandPath.value.trim();
  }
  if (selectedType === 'shop' && editorShowImage) {
    selectedShop.showImage = editorShowImage.checked;
  }
  if (selectedType === 'shop' && editCategory) {
    const val = editCategory.value;
    selectedShop.category = val || undefined;
    if (val && CATEGORY_COLORS[val]) selectedShop.color = CATEGORY_COLORS[val];
  }

  if (editorShopName) editorShopName.textContent = selectedShop.name;

  if (hoveredMesh === selectedMesh) restoreHovered();
  rebuildSelectedMesh();
  updateCollisionWarning();
}

// 保存到 mall.json（通过开发期中间件写回文件，整个 floors 结构一并保存）
async function saveMall() {
  if (!editMode) return;
  try {
    const res = await fetch('/api/save-mall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mallData)
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.ok) showStatus('已保存到 mall.json ✓', true);
    else showStatus('保存失败：' + (json.error || res.status), false);
  } catch (e) {
    showStatus('保存失败：' + e.message, false);
  }
}

// 重置：把当前选中对象回退到原始（已保存）布局（作用域：当前层）
function resetObject() {
  if (!editMode) return;
  if (!selectedShop) return;

  if (selectedType === 'floor') {
    const origFloor = originalMall.floors[currentFloorIndex];
    if (origFloor && origFloor.outline) {
      cur().data.outline = JSON.parse(JSON.stringify(origFloor.outline));
      rebuildFloor();
      const b = getFenceBounds();
      if (b) {
        if (editW) editW.value = Math.round(b.maxX - b.minX);
        if (editH) editH.value = Math.round(b.maxY - b.minY);
      }
    }
    editorWarning.classList.add('hidden');
    editorStatus.classList.add('hidden');
    return;
  }

  const origFloor = originalMall.floors[currentFloorIndex];
  const origArr = origFloor && origFloor[selectedSource];
  const orig = origArr && origArr.find((s) => s.id === selectedShop.id);
  if (!orig) return;
  selectedShop.x = orig.x;
  selectedShop.y = orig.y;
  selectedShop.width = orig.width;
  selectedShop.height = orig.height;
  selectedShop.tall = orig.tall != null ? orig.tall : defaultTall(selectedType);
  if (orig.shape) selectedShop.shape = orig.shape;
  else delete selectedShop.shape;
  selectedShop.name = orig.name;
  if (orig.img) selectedShop.img = orig.img;
  else delete selectedShop.img;
  selectedShop.showImage = orig.showImage;
  selectedShop.category = orig.category;
  if (orig.color) selectedShop.color = orig.color;
  else delete selectedShop.color;

  if (hoveredMesh === selectedMesh) restoreHovered();
  rebuildSelectedMesh();

  editX.value = orig.x;
  editY.value = orig.y;
  editLen.value = orig.width;
  editWide.value = orig.height;
  editHigh.value = selectedShop.tall;
  if (editName) editName.value = orig.name || '';
  if (editorShopName) editorShopName.textContent = orig.name;
  const origImg = orig.img || (selectedType === 'shop' ? getBrandImagePath(orig.logo) : null);
  if (editorBrandPath) editorBrandPath.value = origImg || '';
  if (editorShowImage) editorShowImage.checked = orig.showImage === true;
  if (editorBrandImg && selectedType === 'shop') {
    editorBrandImg.src = origImg || DEFAULT_IMAGE;
    editorBrandImg.style.display = orig.showImage === true ? '' : 'none';
  }
  editorWarning.classList.add('hidden');
  editorStatus.classList.add('hidden');
}

// 删除：从数据与场景中移除当前选中对象（作用域：当前层）
function deleteObject() {
  if (!editMode) return;
  if (!selectedShop || !selectedMesh) return;
  if (selectedType === 'floor') { showStatus('场地不可删除', false); return; }
  const f = cur();
  const arr = f.data[selectedSource];
  const i = arr ? arr.indexOf(selectedShop) : -1;
  if (i !== -1) arr.splice(i, 1);

  if (hoveredMesh === selectedMesh) restoreHovered();
  const selArr = selectedType === 'shop' ? f.shopMeshes
    : selectedType === 'elevator' ? f.elevatorMeshes
    : f.markerMeshes;
  const j = selArr.indexOf(selectedMesh);
  if (j !== -1) selArr.splice(j, 1);
  f.group.remove(selectedMesh);
  disposeMesh(selectedMesh);

  selectedMesh = null;
  selectedShop = null;
  if (editorShopName) editorShopName.textContent = '—';
  if (editName) editName.value = '';
  if (editX) editX.value = '';
  if (editY) editY.value = '';
  if (editW) editW.value = '';
  if (editH) editH.value = '';
  if (editLen) editLen.value = '';
  if (editWide) editWide.value = '';
  if (editHigh) editHigh.value = '';
  if (editorBrand) editorBrand.classList.add('hidden');
  showStatus('已删除对象（保存后生效）', true);
}

// 新增：在地图中心生成一个新的商铺对象，并选中以便编辑（作用域：当前层）
// 如需电梯，新增后于「类型」下拉选择「电梯」即可切换为 3F 电梯样式
let addSeq = 0;
function addObject() {
  if (!editMode) return;
  const f = cur();
  const b = getFenceBounds();
  const w = 20;
  const h = 15;
  const cx = b ? (b.minX + b.maxX) / 2 : 0;
  const cy = b ? (b.minY + b.maxY) / 2 : 0;
  addSeq += 1;
  const newShop = {
    id: 'new_' + Date.now() + '_' + addSeq,
    name: '新对象' + addSeq,
    x: Math.round(cx - w / 2),
    y: Math.round(cy - h / 2),
    width: w,
    height: h,
    tall: SHOP_HEIGHT,
    category: 'default',
    color: CATEGORY_COLORS['default'],
    showImage: false
  };
  f.data.shops = f.data.shops || [];
  f.data.shops.push(newShop);

  const mesh = createShopMesh(newShop);
  mesh.userData.item = newShop;
  mesh.userData.source = 'shops';
  f.group.add(mesh);
  f.shopMeshes.push(mesh);

  selectShop(mesh, newShop, 'shop', 'shops');
  floorEditActive = false; // 新增后进入商铺编辑，退出楼层编辑（隐藏绿色圆点）
  updateFloorPanel();
  updateCollisionWarning();
  showStatus('已新增对象（可拖动参数调整，保存后生效）', true);
}

// 将当前选中对象在 商铺 / 电梯 之间互转（数据数组、网格、类型统一切换）
function convertSelectedToType(newType) {
  if (selectedType === newType) return;
  const f = cur();

  // 从原数组移除
  const curMeshArr = selectedType === 'shop' ? f.shopMeshes : f.elevatorMeshes;
  const curDataArr = f.data[selectedSource];
  const mi = curMeshArr.indexOf(selectedMesh);
  if (mi !== -1) curMeshArr.splice(mi, 1);
  const di = curDataArr ? curDataArr.indexOf(selectedShop) : -1;
  if (di !== -1) curDataArr.splice(di, 1);
  f.group.remove(selectedMesh);
  disposeMesh(selectedMesh);

  // 切换类型
  selectedType = newType;
  selectedSource = newType === 'elevator' ? 'elevators' : 'shops';

  if (newType === 'elevator') {
    // 按 3F 电梯设计：12x12、高 30，并保持在原对象中心
    const cx = selectedShop.x + (selectedShop.width || 0) / 2;
    const cy = selectedShop.y + (selectedShop.height || 0) / 2;
    selectedShop.width = 12;
    selectedShop.height = 12;
    selectedShop.tall = 30;
    selectedShop.x = Math.round(cx - 6);
    selectedShop.y = Math.round(cy - 6);
    delete selectedShop.category;
    delete selectedShop.color;
    delete selectedShop.img;
    delete selectedShop.showImage;
  } else {
    // 转回商铺：按当前下拉颜色恢复（默认色兜底）
    const val = editCategory.value;
    const colorVal = (val && val !== 'elevator' && CATEGORY_COLORS[val]) ? val : 'default';
    selectedShop.category = colorVal;
    selectedShop.color = CATEGORY_COLORS[colorVal];
  }

  f.data[selectedSource] = f.data[selectedSource] || [];
  f.data[selectedSource].push(selectedShop);

  const newMesh = newType === 'elevator' ? createElevatorMesh(selectedShop) : createShopMesh(selectedShop);
  newMesh.userData.item = selectedShop;
  newMesh.userData.type = selectedType;
  newMesh.userData.source = selectedSource;
  f.group.add(newMesh);
  (newType === 'elevator' ? f.elevatorMeshes : f.shopMeshes).push(newMesh);
  selectedMesh = newMesh;
  addSelectionHighlight(newMesh);

  selectShop(newMesh, selectedShop, selectedType, selectedSource);
  floorEditActive = false;
  updateFloorPanel();
  updateCollisionWarning();
}

if (editAdd) editAdd.addEventListener('click', addObject);
if (editApply) editApply.addEventListener('click', applyEdit);
if (editSave) editSave.addEventListener('click', saveMall);
if (editReset) editReset.addEventListener('click', resetObject);
if (editDelete) editDelete.addEventListener('click', deleteObject);

// 清空编辑面板输入框
function clearEditorFields() {
  [editName, editX, editY, editW, editH, editLen, editWide, editHigh].forEach((el) => {
    if (el) el.value = '';
  });
  if (editorBrand) editorBrand.classList.add('hidden');
  editorWarning.classList.add('hidden');
  editorStatus.classList.add('hidden');
}

// ============ 楼层切换 / 总览 / 增删 ============

// 根据模式设置每层可见性与非当前层半透明
function dimFloor(f, dim) {
  f.group.traverse((o) => {
    if (!o.isMesh && !o.isLine) return;
    if (o.userData && o.userData.isHighlight) return; // 选中描边不调暗
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m) return;
      if (m.userData.origOpacity === undefined) {
        m.userData.origOpacity = m.opacity;
        m.userData.origTransparent = m.transparent;
      }
      if (dim) {
        m.transparent = true;
        m.opacity = Math.min(m.userData.origOpacity, 0.3);
      } else {
        m.opacity = m.userData.origOpacity;
        m.transparent = m.userData.origTransparent;
      }
      m.needsUpdate = true;
    });
  });
}

function applyVisibility() {
  floorObjs.forEach((f, i) => {
    if (overviewMode) {
      f.group.visible = true;
      dimFloor(f, false); // 总览模式：所有楼层均不透明，不做透明处理
    } else {
      f.group.visible = (i === currentFloorIndex);
      dimFloor(f, false);
    }
  });
}

// 相机对准当前层（聚焦模式）
function focusCameraOnCurrentFloor() {
  const y = currentFloorIndex * FLOOR_GAP;
  sceneManager.controls.target.set(0, y + 6, 0);
  sceneManager.camera.position.set(170, y + 170, 170);
  sceneManager.controls.update();
}

// 相机拉远俯瞰全部楼层（总览模式）
function overviewCamera() {
  const totalH = (floorObjs.length - 1) * FLOOR_GAP;
  const midY = totalH / 2;
  sceneManager.controls.target.set(0, midY, 0);
  sceneManager.camera.position.set(230, totalH + 230, 230);
  sceneManager.controls.update();
}

// 切换当前聚焦楼层
function switchFloor(i) {
  if (i < 0 || i >= floorObjs.length) return;
  currentFloorIndex = i;
  // 切换时清空选中，避免引用已切换层的网格
  selectedMesh = null;
  selectedShop = null;
  if (editorShopName) editorShopName.textContent = '—';
  clearEditorFields();
  applyVisibility();
  if (!overviewMode) focusCameraOnCurrentFloor();
  updateFloorPanel();
}

// 总览开关
function toggleOverview() {
  overviewMode = !overviewMode;
  // 进入总览时清空选中高亮与引用，避免指向被隐藏楼层的网格导致后续遍历报错
  if (overviewMode) {
    floorEditActive = false;
    clearSelectionHighlight();
    selectedMesh = null;
    selectedShop = null;
    if (editorShopName) editorShopName.textContent = '—';
  }
  applyVisibility();
  if (overviewMode) overviewCamera();
  else focusCameraOnCurrentFloor();
  updateFloorPanel();
}

// 刷新楼层面板（楼层按钮 + 标签 + 总览高亮 + 楼层编辑绿色圆点）
function updateFloorPanel() {
  if (floorLabel) {
    floorLabel.textContent = overviewMode
      ? '总览模式（全部楼层）'
      : `当前聚焦楼层: ${cur().data.floor.name}`;
  }
  if (floorButtons) {
    floorButtons.innerHTML = '';
    mallData.floors.forEach((fd, i) => {
      const b = document.createElement('button');
      b.textContent = fd.floor.name;
      if (!overviewMode && i === currentFloorIndex) b.classList.add('active');
      // 楼层编辑激活时，给当前激活楼层按钮加 floor-edit 类（由 CSS ::after 绘制右上角绿点）
      if (floorEditActive && i === activeFloorIndex) b.classList.add('floor-edit');
      b.addEventListener('click', () => onFloorButtonClick(i));
      floorButtons.appendChild(b);
    });
  }
  if (overviewToggle) overviewToggle.classList.toggle('active', overviewMode);
}

// 点击楼层按钮：聚焦该层（浏览模式下仅切换楼层，不激活场地编辑）
function onFloorButtonClick(i) {
  const fromOverview = overviewMode;
  overviewMode = false; // 点楼层即退出总览
  // 从总览退出时，即便点的是“当前层”也要重新应用可见性与相机，否则会停留在总览视图
  if (fromOverview || i !== currentFloorIndex) switchFloor(i);
  if (editMode) activateFloorEditor();
}

// 激活楼层编辑：高亮场地并填充编辑面板（名称/尺寸/上传 SVG），显示绿色圆点
function activateFloorEditor() {
  floorEditActive = true;
  activeFloorIndex = currentFloorIndex;
  const f = cur();
  if (f.outlineMesh) {
    selectShop(f.outlineMesh, floorItem, 'floor', 'outline');
  } else {
    // 无外轮廓时的兜底：仅填充编辑面板，不高亮
    selectedMesh = null;
    selectedShop = floorItem;
    selectedType = 'floor';
    selectedSource = 'outline';
    if (editorPanel) editorPanel.classList.remove('hidden');
    editorWarning.classList.add('hidden');
    editorStatus.classList.add('hidden');
    if (editorShopName) editorShopName.textContent = f.data.floor.name + '场地';
    if (editName) editName.value = floorItem.name || '场地';
    if (editNameLabel) editNameLabel.style.display = 'none';
    if (editCategoryLabel) editCategoryLabel.style.display = 'none';
    if (editorBrand) editorBrand.classList.add('hidden');
    if (editorRowXY) editorRowXY.style.display = 'none';
    if (editorRowGeoSize) editorRowGeoSize.style.display = 'none';
    if (editorRowFloorSize) editorRowFloorSize.style.display = '';
    if (editorFloor) editorFloor.classList.remove('hidden');
    if (editorShopSvg) editorShopSvg.classList.add('hidden');
    if (editFloorId) editFloorId.value = f.data.floor.id;
  }
  updateFloorPanel();
}

// 按楼层编号（floor.id）升序重排 floorObjs 与 mallData.floors，
// 使楼层编号与地图层位置一一对应（1F 在最底，编号越大越靠上）
function reorderFloorsByLevel() {
  const order = floorObjs
    .map((f, i) => i)
    .sort((a, b) => (floorObjs[a].data.floor.id || 0) - (floorObjs[b].data.floor.id || 0));
  const newFloorObjs = order.map((i) => floorObjs[i]);
  const newMallFloors = order.map((i) => mallData.floors[i]);
  floorObjs.length = 0;
  Array.prototype.push.apply(floorObjs, newFloorObjs);
  mallData.floors = newMallFloors;
  floorObjs.forEach((ff, i) => {
    ff.group.position.y = i * FLOOR_GAP;
    ff.group.userData.floorIndex = i;
  });
}

// 新增楼层（复制当前层外轮廓为默认场地；编号自动填补最小空缺，避免删除 1F 后无法再建 1F）
function addFloor() {
  if (!editMode) return;
  const used = new Set(
    mallData.floors.map((f) => f.floor.id).filter((n) => typeof n === 'number')
  );
  let newId = 1;
  while (used.has(newId)) newId++;
  const newName = newId + 'F';
  // 复制顶层（编号最大的楼层）的围墙外轮廓与电梯信息作为默认值
  // 说明：mallData.floors[i] 为原始数据，outline/elevators 直接挂在顶层（无 .data）；
  //       运行时 floorObjs 包装对象才用 .data 包裹，故分别兼容两种来源
  const topFloor = mallData.floors.length
    ? mallData.floors.reduce(
        (a, b) => (b.floor.id > a.floor.id ? b : a),
        mallData.floors[0]
      )
    : null;
  let srcOutline = [], srcElevators = [];
  if (topFloor) {
    srcOutline = topFloor.outline && topFloor.outline.length
      ? JSON.parse(JSON.stringify(topFloor.outline)) : [];
    srcElevators = topFloor.elevators && topFloor.elevators.length
      ? JSON.parse(JSON.stringify(topFloor.elevators)) : [];
  } else {
    const c = cur();
    const cd = c && c.data ? c.data : null;
    srcOutline = cd && cd.outline && cd.outline.length
      ? JSON.parse(JSON.stringify(cd.outline)) : [];
    srcElevators = cd && cd.elevators && cd.elevators.length
      ? JSON.parse(JSON.stringify(cd.elevators)) : [];
  }
  const newFloor = {
    floor: { id: newId, name: newName },
    outline: srcOutline,
    atrium: {},
    shops: [], elevators: srcElevators, entries: [], restrooms: []
  };
  mallData.floors.push(newFloor);
  const group = new THREE.Group();
  sceneManager.scene.add(group);
  const f = {
    data: newFloor, group,
    outlineMesh: null, fenceMesh: null,
    elevatorMeshes: [], shopMeshes: [], markerMeshes: []
  };
  buildFloor(f);
  floorObjs.push(f);
  reorderFloorsByLevel();           // 按编号重排，使新层落到对应地图层位置
  currentFloorIndex = floorObjs.indexOf(f);
  overviewMode = false;
  applyVisibility();
  focusCameraOnCurrentFloor();
  activateFloorEditor(); // 新增后自动激活新楼层编辑（绿点 + 场地参数）
  showStatus('已新增楼层 ' + newName, true);
}

// 场地参数「楼层编号」变更：设置该层对应楼层，并按编号重排地图层位置
function onFloorIdChange() {
  if (selectedType !== 'floor') return;
  const n = parseInt(editFloorId.value, 10);
  if (!Number.isFinite(n) || n < 1) {
    editFloorId.value = cur().data.floor.id; // 非法输入还原
    showStatus('楼层编号需为正整数', false);
    return;
  }
  const f = cur();
  const dup = floorObjs.find((ff) => ff !== f && ff.data.floor.id === n);
  if (dup) {
    editFloorId.value = f.data.floor.id; // 编号冲突还原
    showStatus('楼层编号 ' + n + 'F 已被占用，请换一个', false);
    return;
  }
  f.data.floor.id = n;
  f.data.floor.name = n + 'F';
  reorderFloorsByLevel();
  currentFloorIndex = floorObjs.indexOf(f);
  if (editorShopName) editorShopName.textContent = f.data.floor.name + '场地';
  applyVisibility();
  updateFloorPanel();
  focusCameraOnCurrentFloor();
  showStatus('已设置楼层为 ' + f.data.floor.name, true);
}

// 删除当前楼层（至少保留一个）
function deleteFloor() {
  if (!editMode) return;
  if (mallData.floors.length <= 1) { showStatus('至少保留一个楼层', false); return; }
  const f = cur();
  sceneManager.scene.remove(f.group);
  disposeMesh(f.group);
  mallData.floors.splice(currentFloorIndex, 1);
  floorObjs.splice(currentFloorIndex, 1);
  reorderFloorsByLevel(); // 按编号重排，保证层位置与楼层编号对应
  if (currentFloorIndex >= floorObjs.length) currentFloorIndex = floorObjs.length - 1;
  selectedMesh = null;
  selectedShop = null;
  floorEditActive = false; // 删除当前层后退出楼层编辑模式

  if (editorShopName) editorShopName.textContent = '—';
  clearEditorFields();
  applyVisibility();
  if (!overviewMode) focusCameraOnCurrentFloor();
  updateFloorPanel();
  showStatus('已删除当前楼层', true);
}

if (overviewToggle) overviewToggle.addEventListener('click', toggleOverview);
if (floorAddBtn) floorAddBtn.addEventListener('click', addFloor);
if (floorDelBtn) floorDelBtn.addEventListener('click', deleteFloor);
if (editFloorId) editFloorId.addEventListener('change', onFloorIdChange);

// 模式切换开关（编辑 / 浏览）
if (modeGroup) {
  modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode === 'edit')));
}

// 全量重建场景：清空所有楼层后按当前 mallData 重新生成（用于导入）
function rebuildAllFloors() {
  floorObjs.forEach((f) => {
    sceneManager.scene.remove(f.group);
    disposeMesh(f.group);
  });
  floorObjs.length = 0;
  mallData.floors.forEach((fd, i) => {
    const group = new THREE.Group();
    group.position.y = i * FLOOR_GAP;
    group.userData = { floorIndex: i };
    sceneManager.scene.add(group);
    const f = {
      data: fd, group,
      outlineMesh: null, fenceMesh: null,
      elevatorMeshes: [], shopMeshes: [], markerMeshes: []
    };
    buildFloor(f);
    floorObjs.push(f);
  });
  reorderFloorsByLevel(); // 按编号重排，保证导入/重建后层位置与楼层编号对应
  if (currentFloorIndex >= floorObjs.length) currentFloorIndex = Math.max(0, floorObjs.length - 1);
  selectedMesh = null;
  selectedShop = null;
  if (editorShopName) editorShopName.textContent = '—';
  clearEditorFields();
}

// 计算对象矩形（长方体底面）的四个顶点（SVG 坐标）：左上、右上、右下、左下
function computeRectShape(item) {
  const x = item.x || 0;
  const y = item.y || 0;
  const w = item.width || 0;
  const h = item.height || 0;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ];
}

// 导出：将当前所有设置参数序列化为 JSON 文件下载到本地（含全部楼层）
function exportMall() {
  const data = JSON.parse(JSON.stringify(mallData));
  (data.floors || []).forEach((fd) => {
    ['shops', 'elevators', 'entries', 'restrooms'].forEach((key) => {
      (fd[key] || []).forEach((item) => {
        item.shape = computeRectShape(item);
      });
    });
  });
  const dataStr = JSON.stringify(data, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.download = `mall-config-${ts}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showStatus('已导出全部楼层设置参数 JSON ✓', true);
}

// 导入：读取本地 JSON 文件，替换当前数据并全量重建场景（兼容旧单层结构）
function importMall(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const json = JSON.parse(reader.result);
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('文件内容不是有效的 JSON 对象');
      }
      // 兼容旧单层结构：自动包成 floors
      if (!Array.isArray(json.floors)) {
        json.floors = [{
          floor: json.floor || { id: 1, name: '1F' },
          outline: json.outline || [],
          atrium: json.atrium || {},
          shops: json.shops || [],
          elevators: json.elevators || [],
          entries: json.entries || [],
          restrooms: json.restrooms || []
        }];
      }
      Object.keys(mallData).forEach((k) => delete mallData[k]);
      Object.assign(mallData, json);
      rebuildAllFloors();
      originalMall = JSON.parse(JSON.stringify(mallData));
      currentFloorIndex = Math.max(0, mallData.floors.length - 1);
      overviewMode = false;
      applyVisibility();
      focusCameraOnCurrentFloor();
      updateFloorPanel();
      showStatus('已导入 JSON 配置并重建场景 ✓', true);
    } catch (e) {
      showStatus('导入失败：' + e.message, false);
    }
  };
  reader.onerror = () => showStatus('读取文件失败', false);
  reader.readAsText(file);
}

if (editExport) editExport.addEventListener('click', exportMall);
if (editImport) editImport.addEventListener('click', () => editorImportFile && editorImportFile.click());
if (editorImportFile) editorImportFile.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (file) importMall(file);
  e.target.value = '';
});
// 输入框实时检测碰撞
[editX, editY, editW, editH, editLen, editWide, editHigh].forEach((el) => {
  if (el) el.addEventListener('input', updateCollisionWarning);
});

// ===== 长宽比锁定 =====
// floorRatio: 场地 宽(editW) / 高(editH)；geoRatio: 商铺 长(editLen) / 宽(editWide)
const ratioLock = { floor: { on: false, ratio: 1 }, geo: { on: false, ratio: 1 } };
let ratioSyncing = false; // 防止联动更新时递归触发

function toggleRatioLock(kind, btn) {
  const st = ratioLock[kind];
  st.on = !st.on;
  if (st.on) {
    // 点亮时按当前输入值捕获比例
    const [a, b] = kind === 'floor'
      ? [parseFloat(editW.value), parseFloat(editH.value)]
      : [parseFloat(editLen.value), parseFloat(editWide.value)];
    st.ratio = (Number.isFinite(a) && Number.isFinite(b) && b > 0) ? a / b : 1;
  }
  btn.classList.toggle('active', st.on);
  btn.setAttribute('aria-pressed', st.on ? 'true' : 'false');
}

// 编辑其中一个尺寸时，按锁定比例联动另一个（primary 为被编辑框）
function applyRatioSync(kind, primary) {
  const st = ratioLock[kind];
  if (!st.on || ratioSyncing) return;
  const [aEl, bEl] = kind === 'floor' ? [editW, editH] : [editLen, editWide];
  const va = parseFloat(aEl.value);
  const vb = parseFloat(bEl.value);
  ratioSyncing = true;
  if (primary === aEl) {
    if (Number.isFinite(va) && st.ratio > 0) bEl.value = Math.max(1, Math.round(va / st.ratio));
  } else {
    if (Number.isFinite(vb)) aEl.value = Math.max(1, Math.round(vb * st.ratio));
  }
  ratioSyncing = false;
  updateCollisionWarning();
}

if (lockFloorRatio) lockFloorRatio.addEventListener('click', () => toggleRatioLock('floor', lockFloorRatio));
if (lockGeoRatio) lockGeoRatio.addEventListener('click', () => toggleRatioLock('geo', lockGeoRatio));
if (editW) editW.addEventListener('input', () => applyRatioSync('floor', editW));
if (editH) editH.addEventListener('input', () => applyRatioSync('floor', editH));
if (editLen) editLen.addEventListener('input', () => applyRatioSync('geo', editLen));
if (editWide) editWide.addEventListener('input', () => applyRatioSync('geo', editWide));
// 品牌图路径实时预览
if (editorBrandPath) editorBrandPath.addEventListener('input', onBrandPathInput);
// 显示图片开关实时切换立方体顶部贴图
if (editorShowImage) editorShowImage.addEventListener('change', onShowImageChange);
// 上传图片：点击触发文件选择，选择后写入路径
if (editorBrandUpload) editorBrandUpload.addEventListener('click', () => editorBrandFile && editorBrandFile.click());
if (editorBrandFile) editorBrandFile.addEventListener('change', onBrandFileChange);

// 上传 SVG：解析首个图形外轮廓，等比适配当前场地包围盒后替换场地形状（作用域：当前层）
function onSvgFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const raw = parseSvgOutline(reader.result);
    if (!raw || raw.length < 3) {
      showStatus('SVG 未解析出有效轮廓（支持 path/polygon/polyline/rect/circle/ellipse）', false);
      return;
    }
    const b = getFenceBounds();
    if (!b) { showStatus('当前场地无外轮廓', false); return; }
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const targetW = b.maxX - b.minX;
    const targetH = b.maxY - b.minY;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const scale = Math.min(targetW / w, targetH / h);
    const out = raw.map(([px, py]) => {
      const nx = (px - (minX + maxX) / 2) * scale;
      const ny = -(py - (minY + maxY) / 2) * scale;
      return [Math.round(cx + nx), Math.round(cy + ny)];
    });
    cur().data.outline = out;
    rebuildFloor();
    if (selectedType === 'floor') {
      const nb = getFenceBounds();
      if (nb) {
        if (editW) editW.value = Math.round(nb.maxX - nb.minX);
        if (editH) editH.value = Math.round(nb.maxY - nb.minY);
      }
    }
    showStatus('已按 SVG 生成场地外边框', true);
  };
  reader.onerror = () => showStatus('读取 SVG 文件失败', false);
  reader.readAsText(file);
  e.target.value = '';
}

if (editUploadSvg) editUploadSvg.addEventListener('click', () => editorSvgFile && editorSvgFile.click());
if (editorSvgFile) editorSvgFile.addEventListener('change', onSvgFileChange);

// 商铺上传 SVG：解析首个图形外轮廓，等比适配当前商铺尺寸后作为商铺外形（作用域：当前层）
function onShopSvgChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  if (!selectedShop || selectedType !== 'shop') return;
  const reader = new FileReader();
  reader.onload = () => {
    const raw = parseSvgOutline(reader.result);
    if (!raw || raw.length < 3) {
      showStatus('SVG 未解析出有效轮廓（支持 path/polygon/polyline/rect/circle/ellipse）', false);
      return;
    }
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const scale = Math.min(selectedShop.width / w, selectedShop.height / h);
    const shape = raw.map(([px, py]) => {
      const nx = (px - (minX + maxX) / 2) * scale;
      const ny = -(py - (minY + maxY) / 2) * scale;
      return [Math.round(nx), Math.round(ny)];
    });
    selectedShop.shape = shape;
    if (hoveredMesh === selectedMesh) restoreHovered();
    rebuildSelectedMesh();
    showStatus('已按 SVG 改变商铺外观', true);
  };
  reader.onerror = () => showStatus('读取 SVG 文件失败', false);
  reader.readAsText(file);
  e.target.value = '';
}

if (editUploadShopSvg) editUploadShopSvg.addEventListener('click', () => editorShopSvgFile && editorShopSvgFile.click());
if (editorShopSvgFile) editorShopSvgFile.addEventListener('change', onShopSvgChange);
// 类型下拉：填充选项（电梯 + 颜色）并绑定切换
if (editCategory) {
  editCategory.innerHTML =
    '<option value="elevator">电梯</option>' +
    SHOP_CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
  editCategory.addEventListener('change', onCategoryChange);
}
// 编辑面板上的交互不冒泡到画布，避免误触发选中/拖拽
if (editorPanel) {
  editorPanel.addEventListener('click', (e) => e.stopPropagation());
  editorPanel.addEventListener('mousemove', (e) => e.stopPropagation());
  editorPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
}
// 楼层面板（含楼层按钮）交互同样不冒泡，避免误触发拖拽
const floorPanelEl = document.getElementById('floor-panel');
if (floorPanelEl) {
  floorPanelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
}

app.addEventListener('mousemove', onPointerMove);
app.addEventListener('click', onPointerClick);
app.addEventListener('dblclick', onPointerDblClick);
app.addEventListener('pointerdown', onPointerDown);
window.addEventListener('pointerup', onPointerUp);

// 初始：编辑面板常驻显示，默认激活当前楼层参数（场地为默认上下文）

// 初始：应用可见性、刷新楼层面板、相机对准当前层、激活楼层编辑
applyVisibility();
updateFloorPanel();
focusCameraOnCurrentFloor();
activateFloorEditor();

// 动画循环
function animate() {
  requestAnimationFrame(animate);
  sceneManager.render();
}
animate();
