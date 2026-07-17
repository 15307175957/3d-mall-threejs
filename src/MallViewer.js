import * as THREE from 'three';
import { SceneManager } from './core/SceneManager.js';
import { createShopMesh, createOutlineMesh, SHOP_HEIGHT } from './builders/ShopBuilder.js';
import { createElevatorMesh } from './builders/ElevatorBuilder.js';
import { createMarkerMesh } from './builders/MarkerBuilder.js';
import { createFence } from './builders/FenceBuilder.js';
import { getBrandImagePath, DEFAULT_IMAGE } from './config/brandImages.js';
import { SHOP_CATEGORIES, CATEGORY_COLORS } from './config/categories.js';
import { parseSvgOutline } from './utils/svgOutline.js';
import styleCss from './style.css?inline';

// 楼层间距（≈电梯高度），堆叠后各层电梯块自然连成竖条（可调）
const FLOOR_GAP = 30;
const HIGHLIGHT_COLOR = 0x6ecbff;

// 场地（外轮廓底板）对应的数据占位对象
const floorItem = { id: '__floor__', name: '场地' };

// 组件内部 UI 结构（与旧 index.html 中的 #app 内容一致），由类注入 Shadow DOM
const APP_HTML = `
  <div id="app">
    <div id="mode-switch">
      <span class="mode-label">模式</span>
      <div class="checkbox-button-group" id="mode-group">
        <button type="button" class="mode-btn active" data-mode="edit">编辑</button>
        <button type="button" class="mode-btn" data-mode="browse">预览</button>
      </div>
    </div>
    <div id="floor-panel">
      <span id="floor-label">当前聚焦楼层: 3F</span>
      <div id="floor-buttons"></div>
      <div class="floor-actions">
        <button id="overview-toggle" type="button">总览</button>
        <button id="floor-add" type="button">＋ 楼层</button>
        <button id="floor-del" type="button">－ 删除</button>
      </div>
    </div>
    <div id="editor-panel">
      <div class="editor-title">参数详情</div>
      <div class="editor-head">
        <span class="editor-head-label">编辑对象：</span>
        <span id="editor-shop-name">—</span>
      </div>
      <label class="editor-name-label">名称
        <input type="text" id="edit-name" placeholder="对象名称">
      </label>
      <label class="editor-category-label">类型
        <select id="edit-category"></select>
      </label>
      <div id="editor-brand" class="editor-brand hidden">
        <div class="brand-head">
          <svg class="brand-icon" viewBox="0 0 1024 1024" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M896 128H128a64 64 0 0 0-64 64v640a64 64 0 0 0 64 64h768a64 64 0 0 0 64-64V192a64 64 0 0 0-64-64z m0 704H128V192h768v640zM352 448a64 64 0 1 0 0-128 64 64 0 0 0 0 128z m448 256H224l160-192 112 128 176-224 128 288z"/>
          </svg>
          <span>品牌图</span>
        </div>
        <img id="editor-brand-img" src="" alt="品牌图">
        <label class="brand-path-label">图片路径
          <input type="text" id="editor-brand-path" placeholder="如 /src/images/xxx.png">
        </label>
        <div class="brand-upload">
          <button type="button" id="editor-brand-upload">上传图片</button>
          <input type="file" id="editor-brand-file" accept="image/*" hidden>
        </div>
        <label class="brand-toggle-label">
          <span>显示图片（关闭则显示名称）</span>
          <span class="switch">
            <input type="checkbox" id="editor-show-image">
            <span class="slider"></span>
          </span>
        </label>
      </div>
      <div id="editor-floor" class="editor-floor hidden">
        <label class="floor-id-label">楼层编号
          <input type="number" id="edit-floor-id" step="1" min="1">
        </label>
        <div class="floor-head">
          <svg class="floor-icon" viewBox="0 0 1024 1024" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M128 128h768v768H128z m64 64v640h640V192H192z m96 96h192v192H288v-192z m256 0h192v448H544V288z m-256 256h192v192H288v-192z"/>
          </svg>
          <span>场地外边框</span>
        </div>
        <div class="floor-upload">
          <button type="button" id="edit-upload-svg">上传 SVG</button>
          <input type="file" id="editor-svg-file" accept=".svg,image/svg+xml" hidden>
        </div>
      </div>
      <div id="editor-shop-svg" class="editor-floor hidden">
        <div class="floor-head">
          <svg class="floor-icon" viewBox="0 0 1024 1024" width="14" height="14" aria-hidden="true">
            <path fill="currentColor" d="M128 128h768v768H128z m64 64v640h640V192H192z m96 96h192v192H288v-192z m256 0h192v448H544V288z m-256 256h192v192H288v-192z"/>
          </svg>
          <span>商铺外观</span>
        </div>
        <div class="floor-upload">
          <button type="button" id="edit-upload-shop-svg">上传 SVG</button>
          <input type="file" id="editor-shop-svg-file" accept=".svg,image/svg+xml" hidden>
        </div>
      </div>
      <div class="editor-row" id="editor-row-xy">
        <label>X 坐标<input type="number" id="edit-x" step="1"></label>
        <label>Y 坐标<input type="number" id="edit-y" step="1"></label>
      </div>
      <div class="editor-row" id="editor-row-floor-size">
        <label>宽<input type="number" id="edit-w" step="1" min="1"></label>
        <label>高<input type="number" id="edit-h" step="1" min="1"></label>
        <button type="button" id="lock-floor-ratio" class="ratio-lock" title="锁定长宽比" aria-pressed="false" aria-label="锁定长宽比">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path class="lock-shackle" d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"></rect>
          </svg>
        </button>
      </div>
      <div class="editor-row" id="editor-row-geo-size">
        <label>长<input type="number" id="edit-len" step="1" min="1"></label>
        <label>宽<input type="number" id="edit-wide" step="1" min="1"></label>
        <label>高<input type="number" id="edit-high" step="1" min="1"></label>
        <button type="button" id="lock-geo-ratio" class="ratio-lock" title="锁定长宽比" aria-pressed="false" aria-label="锁定长宽比">
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <path class="lock-shackle" d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path>
            <rect x="5" y="10" width="14" height="10" rx="2" fill="currentColor"></rect>
          </svg>
        </button>
      </div>
      <div id="editor-warning" class="editor-warning hidden"></div>
      <div id="editor-status" class="editor-status hidden"></div>
      <div class="editor-actions">
        <button id="edit-add">新增</button>
        <button id="edit-apply">应用</button>
        <button id="edit-save">保存</button>
        <button id="edit-reset">重置</button>
        <button id="edit-delete">删除</button>
        <button id="edit-export">导出</button>
        <button id="edit-import">导入</button>
        <input type="file" id="editor-import-file" accept=".json,application/json" hidden>
      </div>
    </div>
    <div id="tooltip"></div>
  </div>
`;

export class MallViewer {
  /**
   * @param {Object} opts
   * @param {HTMLElement} opts.container   挂载容器（会在此创建 Shadow DOM）
   * @param {Object} [opts.data]           布局数据（含 floors 数组），缺省为空商场
   * @param {boolean} [opts.editable=true] 是否启用编辑能力（false 仅浏览）
   * @param {Function} [opts.onSave]       保存回调 (data) => void | Promise；缺省回退到 /api/save-mall
   * @param {Function} [opts.onUploadImage] 图片上传回调 (file) => Promise<string 路径>
   * @param {string} [opts.saveUrl]         dev 兼容：保存接口地址
   * @param {string} [opts.uploadUrl]       dev 兼容：上传接口地址
   */
  constructor(opts = {}) {
    const { container, data, editable = true, onSave, onUploadImage, saveUrl, uploadUrl } = opts;
    if (!container) throw new Error('MallViewer: container 参数必填');

    this.container = container;
    this.editable = editable;
    this.onSave = onSave;
    this.onUploadImage = onUploadImage;
    this.saveUrl = saveUrl || '/api/save-mall';
    this.uploadUrl = uploadUrl || '/api/upload-image';

    // 数据（深拷贝，避免外部引用被内部修改）
    this.mallData = this.normalizeData(data || { floors: [] });
    this.originalMall = JSON.parse(JSON.stringify(this.mallData));

    // 状态
    this.hoveredMesh = null;
    this.hoveredOrigins = [];
    this.floorObjs = [];
    this.currentFloorIndex = Math.max(0, this.mallData.floors.length - 1);
    this.overviewMode = false;
    this.editMode = this.editable;
    this.selectedMesh = null;
    this.selectedShop = null;
    this.selectedType = 'shop';
    this.selectedSource = 'shops';
    this.floorEditActive = false;
    this.activeFloorIndex = -1;
    this.isDragging = false;
    this.dragDidMove = false;
    this.dragPlane = new THREE.Plane();
    this.dragStartWorld = new THREE.Vector3();
    this.dragOrigData = { x: 0, y: 0 };
    this.dragOrigMeshPos = new THREE.Vector3();
    this._tmpVec = new THREE.Vector3();
    this.ratioLock = { floor: { on: false, ratio: 1 }, geo: { on: false, ratio: 1 } };
    this.ratioSyncing = false;
    this.addSeq = 0;
    this._raf = null;

    this._buildShadow();
    this._buildUI();
    this._initScene();
    this._bindEvents();
    this._init();
    this._startAnimation();
  }

  // ============ 数据迁移：旧单层结构自动包成 floors 数组 ============
  normalizeData(d) {
    const data = JSON.parse(JSON.stringify(d || {}));
    if (!Array.isArray(data.floors)) {
      const single = {
        floor: data.floor || { id: 1, name: '1F' },
        outline: data.outline || [],
        atrium: data.atrium || {},
        shops: data.shops || [],
        elevators: data.elevators || [],
        entries: data.entries || [],
        restrooms: data.restrooms || []
      };
      Object.keys(data).forEach((k) => delete data[k]);
      data.floors = [single];
    }
    if (!data.floors.length) data.floors = [{ floor: { id: 1, name: '1F' }, outline: [], atrium: {}, shops: [], elevators: [], entries: [], restrooms: [] }];
    return data;
  }

  // ============ Shadow DOM + 内部 UI ============
  _buildShadow() {
    this.root = this.container.attachShadow({ mode: 'open' });
    // 剔除 .body-bg 规则：其引用的 bodyBg.png 会被 ?inline 以 base64 打进库 JS 造成体积膨胀；
    // 组件背景由下方 :host 渐变提供，不需要该图。
    const css = styleCss
      .replace(/\.body-bg\s*\{[^}]*\}/, '')
      .replace(/#app\s*\{[^}]*\}/, '#app { width:100%; height:100%; position:relative; }')
      .replace(
        /body\s*\{[^}]*\}/,
        ":host { display:block; width:100%; height:100%; font-family:'Microsoft YaHei','PingFang SC',sans-serif; color:#fff; background: radial-gradient(circle at 50% 45%, #0d2f55 0%, #061427 45%, #03060d 100%); overflow:hidden; }"
      );
    this.root.innerHTML = `<style>${css}</style>${APP_HTML}`;
    this.app = this.root.getElementById('app');
  }

  _buildUI() {
    const $ = (id) => this.root.getElementById(id);
    const q = (sel) => this.root.querySelector(sel);
    this.tooltip = $('tooltip');
    this.editorPanel = $('editor-panel');
    this.editorShopName = $('editor-shop-name');
    this.editX = $('edit-x');
    this.editY = $('edit-y');
    this.editW = $('edit-w');
    this.editH = $('edit-h');
    this.editAdd = $('edit-add');
    this.editApply = $('edit-apply');
    this.editSave = $('edit-save');
    this.editReset = $('edit-reset');
    this.editDelete = $('edit-delete');
    this.editorWarning = $('editor-warning');
    this.editorStatus = $('editor-status');
    this.editName = $('edit-name');
    this.editCategory = $('edit-category');
    this.editorRowXY = $('editor-row-xy');
    this.editNameLabel = q('.editor-name-label');
    this.editCategoryLabel = q('.editor-category-label');
    this.editorBrand = $('editor-brand');
    this.editorBrandImg = $('editor-brand-img');
    this.editorBrandPath = $('editor-brand-path');
    this.editorShowImage = $('editor-show-image');
    this.editorBrandUpload = $('editor-brand-upload');
    this.editorBrandFile = $('editor-brand-file');
    this.editorFloor = $('editor-floor');
    this.editUploadSvg = $('edit-upload-svg');
    this.editorSvgFile = $('editor-svg-file');
    this.editorShopSvg = $('editor-shop-svg');
    this.editUploadShopSvg = $('edit-upload-shop-svg');
    this.editorShopSvgFile = $('editor-shop-svg-file');
    this.editorRowFloorSize = $('editor-row-floor-size');
    this.editorRowGeoSize = $('editor-row-geo-size');
    this.editLen = $('edit-len');
    this.editWide = $('edit-wide');
    this.editHigh = $('edit-high');
    this.lockFloorRatio = $('lock-floor-ratio');
    this.lockGeoRatio = $('lock-geo-ratio');
    this.editExport = $('edit-export');
    this.editImport = $('edit-import');
    this.editorImportFile = $('editor-import-file');
    this.floorLabel = $('floor-label');
    this.editFloorId = $('edit-floor-id');
    this.floorButtons = $('floor-buttons');
    this.overviewToggle = $('overview-toggle');
    this.floorAddBtn = $('floor-add');
    this.floorDelBtn = $('floor-del');
    this.modeGroup = $('mode-group');
    this.modeBtns = this.modeGroup ? Array.from(this.modeGroup.querySelectorAll('.mode-btn')) : [];
    this.floorPanelEl = $('floor-panel');
  }

  _initScene() {
    this.sceneManager = new SceneManager(this.app);
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // 初始化所有楼层
    this.mallData.floors.forEach((fd, i) => {
      const group = new THREE.Group();
      group.position.y = i * FLOOR_GAP;
      group.userData = { floorIndex: i };
      this.sceneManager.scene.add(group);
      const f = {
        data: fd, group,
        outlineMesh: null, fenceMesh: null,
        elevatorMeshes: [], shopMeshes: [], markerMeshes: []
      };
      this.buildFloor(f);
      this.floorObjs.push(f);
    });
  }

  // ============ 场景构建 ============
  buildFloor(f) {
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
    this.addMarkers(f, d.entries, 'entries', 'entry');
    this.addMarkers(f, d.restrooms, 'restrooms', 'restroom');
  }

  addMarkers(f, list, source, kind) {
    (list || []).forEach((m) => {
      m.kind = kind;
      const mesh = createMarkerMesh(m);
      mesh.userData.source = source;
      f.group.add(mesh);
      f.markerMeshes.push(mesh);
    });
  }

  cur() {
    return this.floorObjs[this.currentFloorIndex];
  }

  // ============ 交互：射线检测 ============
  brightenHovered(mesh) {
    const isFloor = mesh.userData && mesh.userData.type === 'floor';
    const delta = isFloor ? 0.035 : 0.1;
    this.hoveredOrigins = [];
    mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.color && !(o.userData && o.userData.isHighlight)) {
        this.hoveredOrigins.push({ material: o.material, hex: o.material.color.getHex() });
        const c = o.material.color.clone();
        c.offsetHSL(0, 0, delta);
        o.material.color.copy(c);
      }
    });
  }

  restoreHovered() {
    if (this.hoveredMesh) {
      this.hoveredOrigins.forEach(({ material, hex }) => {
        if (material) material.color.setHex(hex);
      });
    }
    this.hoveredMesh = null;
    this.hoveredOrigins = [];
  }

  defaultTall(type) {
    if (type === 'elevator') return SHOP_HEIGHT * 2;
    if (type === 'marker') return 3;
    return SHOP_HEIGHT;
  }

  selectableMeshes() {
    if (this.overviewMode) {
      const arr = [];
      this.floorObjs.forEach((f) => {
        arr.push(...f.shopMeshes, ...f.elevatorMeshes, ...f.markerMeshes);
      });
      return arr;
    }
    const f = this.cur();
    return f.shopMeshes.concat(f.elevatorMeshes, f.markerMeshes);
  }

  pickIntersection(intersects) {
    const solid = intersects.find((it) => !(it.object.userData && it.object.userData.skipOcclusion));
    return solid || intersects[0];
  }

  getFenceBounds() {
    const o = this.cur().data.outline;
    if (!o || !o.length) return null;
    const xs = o.map((p) => p[0]);
    const ys = o.map((p) => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  }

  checkCollisions(shop, x, y, w, h) {
    const warns = [];
    const r1 = { x1: x, x2: x + w, y1: y, y2: y + h };
    const b = this.getFenceBounds();
    if (b) {
      if (r1.x1 < b.minX || r1.x2 > b.maxX || r1.y1 < b.minY || r1.y2 > b.maxY) {
        warns.push('超出围墙范围');
      }
    }
    const others = (this.cur().data.shops || []).concat(this.cur().data.elevators || []);
    others.forEach((s) => {
      if (s === shop) return;
      const r2 = { x1: s.x, x2: s.x + s.width, y1: s.y, y2: s.y + s.height };
      const overlap = r1.x1 < r2.x2 && r1.x2 > r2.x1 && r1.y1 < r2.y2 && r1.y2 > r2.y1;
      if (overlap) warns.push(`与「${s.name}」重叠`);
    });
    return warns;
  }

  updateCollisionWarning() {
    if (!this.selectedShop) return;
    if (this.selectedType === 'floor') { this.editorWarning.classList.add('hidden'); return; }
    const x = parseFloat(this.editX.value);
    const y = parseFloat(this.editY.value);
    const w = parseFloat(this.editLen.value);
    const h = parseFloat(this.editWide.value);
    if (![x, y, w, h].every((v) => Number.isFinite(v)) || w <= 0 || h <= 0) {
      this.editorWarning.classList.add('hidden');
      return;
    }
    const warns = this.checkCollisions(this.selectedShop, x, y, w, h);
    if (warns.length) {
      this.editorWarning.textContent = '⚠ ' + warns.join('；');
      this.editorWarning.classList.remove('hidden');
    } else {
      this.editorWarning.classList.add('hidden');
    }
  }

  showStatus(msg, ok) {
    this.editorStatus.textContent = msg;
    this.editorStatus.classList.toggle('error', !ok);
    this.editorStatus.classList.remove('hidden');
  }

  // ============ 指针事件 ============
  onPointerMove(event) {
    if (!this.editMode) {
      this.restoreHovered();
      this.tooltip.classList.remove('visible');
      this.app.style.cursor = 'default';
      return;
    }
    if (this.isDragging) { this.handleDragMove(event); return; }
    const rect = this.app.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(this.selectableMeshes(), true);

    if (intersects.length > 0) {
      let obj = this.pickIntersection(intersects).object;
      while (obj && !(obj.userData && obj.userData.item)) obj = obj.parent;
      if (!obj) {
        this.restoreHovered();
        this.tooltip.classList.remove('visible');
        this.app.style.cursor = 'default';
        return;
      }
      const mesh = obj;
      if (this.hoveredMesh !== mesh) {
        this.restoreHovered();
        this.hoveredMesh = mesh;
        this.brightenHovered(mesh);
        this.app.style.cursor = 'pointer';
      }
      this.tooltip.textContent = mesh.userData.item.name;
      this.tooltip.classList.add('visible');
      this.tooltip.style.left = event.clientX + 12 + 'px';
      this.tooltip.style.top = event.clientY + 12 + 'px';
    } else {
      this.restoreHovered();
      this.tooltip.classList.remove('visible');
      this.app.style.cursor = 'default';
    }
  }

  onPointerDown(event) {
    this.dragDidMove = false;
    if (!this.editMode) return;
    if (event.button !== 0) return;
    const rect = this.app.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(this.selectableMeshes(), true);
    if (intersects.length === 0) return;
    let obj = this.pickIntersection(intersects).object;
    while (obj && !(obj.userData && obj.userData.item)) obj = obj.parent;
    if (!obj || obj.userData.type === 'floor') return;

    this.floorEditActive = false;
    this.updateFloorPanel();
    this.selectShop(obj, obj.userData.item, obj.userData.type || 'shop', obj.userData.source || 'shops');

    obj.getWorldPosition(this._tmpVec);
    this.dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), this._tmpVec);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, hit)) return;
    this.dragStartWorld.copy(hit);
    this.dragOrigData.x = this.selectedShop.x;
    this.dragOrigData.y = this.selectedShop.y;
    this.dragOrigMeshPos.copy(this.selectedMesh.position);
    this.isDragging = true;
    this.dragDidMove = false;
    this.app.style.cursor = 'move';
    if (this.sceneManager.controls) this.sceneManager.controls.enabled = false;
  }

  handleDragMove(event) {
    const rect = this.app.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.dragPlane, hit)) return;
    const dx = hit.x - this.dragStartWorld.x;
    const dz = hit.z - this.dragStartWorld.z;
    if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) this.dragDidMove = true;

    this.selectedMesh.position.x = this.dragOrigMeshPos.x + dx;
    this.selectedMesh.position.z = this.dragOrigMeshPos.z + dz;

    this.selectedShop.x = Math.round(this.dragOrigData.x + dx);
    this.selectedShop.y = Math.round(this.dragOrigData.y + dz);

    if (this.editX) this.editX.value = this.selectedShop.x;
    if (this.editY) this.editY.value = this.selectedShop.y;
    this.updateCollisionWarning();
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.app.style.cursor = 'default';
    if (this.sceneManager.controls) this.sceneManager.controls.enabled = true;
    if (this.dragDidMove) {
      this.rebuildSelectedMesh();
      this.updateCollisionWarning();
    }
  }

  getFloorIndexOfMesh(mesh) {
    let p = mesh;
    while (p && !(p.userData && p.userData.floorIndex !== undefined)) p = p.parent;
    return p ? p.userData.floorIndex : this.currentFloorIndex;
  }

  deselectAll() {
    if (this.selectedMesh) this.clearSelectionHighlight();
    this.selectedMesh = null;
    this.selectedShop = null;
    this.activateFloorEditor();
  }

  onPointerClick(event) {
    if (!this.editMode) return;
    if (this.dragDidMove) { this.dragDidMove = false; return; }
    const rect = this.app.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(this.selectableMeshes(), true);

    if (intersects.length > 0) {
      let obj = this.pickIntersection(intersects).object;
      while (obj && !(obj.userData && obj.userData.item)) obj = obj.parent;
      if (!obj) { this.deselectAll(); return; }
      if (obj.userData.type === 'floor') {
        this.deselectAll();
        return;
      }
      const fi = this.getFloorIndexOfMesh(obj);
      if (this.overviewMode || fi !== this.currentFloorIndex) {
        this.overviewMode = false;
        this.switchFloor(fi);
      }
      this.floorEditActive = false;
      this.updateFloorPanel();
      this.selectShop(obj, obj.userData.item, obj.userData.type || 'shop', obj.userData.source || 'shops');
    }
  }

  onPointerDblClick(event) {
    if (!this.editMode) return;
    const rect = this.app.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(this.selectableMeshes(), true);
    if (intersects.length === 0) this.deselectAll();
  }

  // ============ 选中 / 编辑面板 ============
  selectShop(mesh, item, type, source) {
    this.addSelectionHighlight(mesh);
    this.selectedMesh = mesh;
    this.selectedShop = item;
    this.selectedType = type || 'shop';
    this.selectedSource = source || 'shops';
    if (this.editorPanel) this.editorPanel.classList.remove('hidden');
    this.editorWarning.classList.add('hidden');
    this.editorStatus.classList.add('hidden');
    if (this.editorShopName) this.editorShopName.textContent = item.name;

    if (this.selectedType === 'floor') {
      if (this.editName) this.editName.value = item.name || '场地';
      if (this.editNameLabel) this.editNameLabel.style.display = 'none';
      if (this.editCategoryLabel) this.editCategoryLabel.style.display = 'none';
      if (this.editorBrand) this.editorBrand.classList.add('hidden');
      if (this.editorRowXY) this.editorRowXY.style.display = 'none';
      if (this.editorRowGeoSize) this.editorRowGeoSize.style.display = 'none';
      if (this.editorRowFloorSize) this.editorRowFloorSize.style.display = '';
      if (this.editorFloor) this.editorFloor.classList.remove('hidden');
      if (this.editorShopSvg) this.editorShopSvg.classList.add('hidden');
      if (this.editFloorId) this.editFloorId.value = this.cur().data.floor.id;
      const b = this.getFenceBounds();
      if (b) {
        if (this.editW) this.editW.value = Math.round(b.maxX - b.minX);
        if (this.editH) this.editH.value = Math.round(b.maxY - b.minY);
      }
      return;
    }

    if (this.editorFloor) this.editorFloor.classList.add('hidden');
    if (this.editorShopSvg) this.editorShopSvg.classList.toggle('hidden', this.selectedType !== 'shop');

    if (this.editNameLabel) this.editNameLabel.style.display = '';
    if (this.editorRowXY) this.editorRowXY.style.display = '';
    if (this.editorRowFloorSize) this.editorRowFloorSize.style.display = 'none';
    if (this.editorRowGeoSize) this.editorRowGeoSize.style.display = '';
    if (this.editName) this.editName.value = item.name || '';
    if (this.editCategory) this.editCategory.value = this.selectedType === 'elevator' ? 'elevator' : (item.category || '');
    if (this.editCategoryLabel) this.editCategoryLabel.style.display = (this.selectedType === 'shop' || this.selectedType === 'elevator') ? '' : 'none';
    if (this.editX) this.editX.value = item.x;
    if (this.editY) this.editY.value = item.y;
    if (this.editLen) this.editLen.value = item.width;
    if (this.editWide) this.editWide.value = item.height;
    if (this.editHigh) this.editHigh.value = item.tall != null ? item.tall : this.defaultTall(this.selectedType);

    if (this.selectedType === 'shop' && this.editorBrand) {
      const configPath = this.selectedShop.img || getBrandImagePath(this.selectedShop.logo) || '';
      this.editorBrandImg.src = configPath || DEFAULT_IMAGE;
      this.editorBrandImg.style.display = this.selectedShop.showImage === true ? '' : 'none';
      this.editorBrandPath.value = configPath;
      if (this.editorShowImage) this.editorShowImage.checked = this.selectedShop.showImage === true;
      this.editorBrand.classList.remove('hidden');
    } else if (this.editorBrand) {
      this.editorBrand.classList.add('hidden');
    }
  }

  rebuildFloor() {
    const f = this.cur();
    if (f.outlineMesh) { f.group.remove(f.outlineMesh); this.disposeMesh(f.outlineMesh); }
    if (f.fenceMesh) { f.group.remove(f.fenceMesh); this.disposeMesh(f.fenceMesh); }
    f.outlineMesh = createOutlineMesh(f.data.outline);
    f.outlineMesh.userData.item = floorItem;
    f.outlineMesh.userData.type = 'floor';
    f.outlineMesh.userData.source = 'outline';
    f.group.add(f.outlineMesh);
    f.fenceMesh = createFence(f.data.outline, SHOP_HEIGHT);
    f.group.add(f.fenceMesh);
    if (this.selectedType === 'floor' && this.selectedMesh) {
      this.selectedMesh = f.outlineMesh;
      this.addSelectionHighlight(f.outlineMesh);
    }
  }

  applyFloorSize(newW, newH) {
    const o = this.cur().data.outline;
    if (!o || !o.length) return;
    const b = this.getFenceBounds();
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
    this.rebuildFloor();
  }

  rebuildSelectedMesh() {
    if (this.selectedType === 'floor') { this.rebuildFloor(); return; }
    const f = this.cur();
    let newMesh;
    if (this.selectedType === 'shop') newMesh = createShopMesh(this.selectedShop);
    else if (this.selectedType === 'elevator') newMesh = createElevatorMesh(this.selectedShop);
    else newMesh = createMarkerMesh(this.selectedShop);

    const selArr = this.selectedType === 'shop' ? f.shopMeshes
      : this.selectedType === 'elevator' ? f.elevatorMeshes
      : f.markerMeshes;
    const idx = selArr.indexOf(this.selectedMesh);
    f.group.remove(this.selectedMesh);
    this.disposeMesh(this.selectedMesh);
    newMesh.userData.item = this.selectedShop;
    newMesh.userData.type = this.selectedType;
    newMesh.userData.source = this.selectedSource;
    f.group.add(newMesh);
    if (idx !== -1) selArr[idx] = newMesh;
    this.selectedMesh = newMesh;
    this.addSelectionHighlight(newMesh);
  }

  disposeMesh(mesh) {
    mesh.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else if (o.material) o.material.dispose();
      }
    });
  }

  clearSelectionHighlight() {
    const m = this.selectedMesh;
    if (!m || typeof m.traverse !== 'function') return;
    m.traverse((o) => {
      if (o.userData && o.userData.isHighlight) {
        if (o.parent) o.parent.remove(o);
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      }
    });
  }

  addSelectionHighlight(mesh) {
    this.clearSelectionHighlight();
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

  applyEdit() {
    if (!this.editMode) return;
    if (!this.selectedShop || !this.selectedMesh) return;

    if (this.selectedType === 'floor') {
      const fw = parseFloat(this.editW.value);
      const fh = parseFloat(this.editH.value);
      if (!Number.isFinite(fw) || !Number.isFinite(fh) || fw <= 0 || fh <= 0) return;
      this.applyFloorSize(fw, fh);
      this.showStatus('已调整场地尺寸（保存后生效）', true);
      return;
    }

    const x = parseFloat(this.editX.value);
    const y = parseFloat(this.editY.value);
    const len = parseFloat(this.editLen.value);
    const wide = parseFloat(this.editWide.value);
    const high = parseFloat(this.editHigh.value);
    if (![x, y, len, wide, high].every((v) => Number.isFinite(v)) || len <= 0 || wide <= 0 || high <= 0) return;

    this.selectedShop.x = x;
    this.selectedShop.y = y;
    this.selectedShop.width = len;
    this.selectedShop.height = wide;
    this.selectedShop.tall = high;
    if (this.editName) {
      const nm = this.editName.value.trim();
      if (nm) this.selectedShop.name = nm;
    }
    if (this.selectedType === 'shop' && this.editorBrandPath) {
      this.selectedShop.img = this.editorBrandPath.value.trim();
    }
    if (this.selectedType === 'shop' && this.editorShowImage) {
      this.selectedShop.showImage = this.editorShowImage.checked;
    }
    if (this.selectedType === 'shop' && this.editCategory) {
      const val = this.editCategory.value;
      this.selectedShop.category = val || undefined;
      if (val && CATEGORY_COLORS[val]) this.selectedShop.color = CATEGORY_COLORS[val];
    }

    if (this.editorShopName) this.editorShopName.textContent = this.selectedShop.name;

    if (this.hoveredMesh === this.selectedMesh) this.restoreHovered();
    this.rebuildSelectedMesh();
    this.updateCollisionWarning();
  }

  // ============ 保存 / 重置 / 删除 / 新增 ============
  async saveMall() {
    if (!this.editMode) return;
    try {
      if (typeof this.onSave === 'function') {
        const res = await this.onSave(this.mallData);
        if (res && res.ok === false) {
          this.showStatus('保存失败：' + (res.error || '未知错误'), false);
        } else {
          this.showStatus('已保存 ✓', true);
        }
        return;
      }
      const res = await fetch(this.saveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.mallData)
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) this.showStatus('已保存到 mall.json ✓', true);
      else this.showStatus('保存失败：' + (json.error || res.status), false);
    } catch (e) {
      this.showStatus('保存失败：' + e.message, false);
    }
  }

  resetObject() {
    if (!this.editMode) return;
    if (!this.selectedShop) return;

    if (this.selectedType === 'floor') {
      const origFloor = this.originalMall.floors[this.currentFloorIndex];
      if (origFloor && origFloor.outline) {
        this.cur().data.outline = JSON.parse(JSON.stringify(origFloor.outline));
        this.rebuildFloor();
        const b = this.getFenceBounds();
        if (b) {
          if (this.editW) this.editW.value = Math.round(b.maxX - b.minX);
          if (this.editH) this.editH.value = Math.round(b.maxY - b.minY);
        }
      }
      this.editorWarning.classList.add('hidden');
      this.editorStatus.classList.add('hidden');
      return;
    }

    const origFloor = this.originalMall.floors[this.currentFloorIndex];
    const origArr = origFloor && origFloor[this.selectedSource];
    const orig = origArr && origArr.find((s) => s.id === this.selectedShop.id);
    if (!orig) return;
    this.selectedShop.x = orig.x;
    this.selectedShop.y = orig.y;
    this.selectedShop.width = orig.width;
    this.selectedShop.height = orig.height;
    this.selectedShop.tall = orig.tall != null ? orig.tall : this.defaultTall(this.selectedType);
    if (orig.shape) this.selectedShop.shape = orig.shape;
    else delete this.selectedShop.shape;
    this.selectedShop.name = orig.name;
    if (orig.img) this.selectedShop.img = orig.img;
    else delete this.selectedShop.img;
    this.selectedShop.showImage = orig.showImage;
    this.selectedShop.category = orig.category;
    if (orig.color) this.selectedShop.color = orig.color;
    else delete this.selectedShop.color;

    if (this.hoveredMesh === this.selectedMesh) this.restoreHovered();
    this.rebuildSelectedMesh();

    this.editX.value = orig.x;
    this.editY.value = orig.y;
    this.editLen.value = orig.width;
    this.editWide.value = orig.height;
    this.editHigh.value = this.selectedShop.tall;
    if (this.editName) this.editName.value = orig.name || '';
    if (this.editorShopName) this.editorShopName.textContent = orig.name;
    const origImg = orig.img || (this.selectedType === 'shop' ? getBrandImagePath(orig.logo) : null);
    if (this.editorBrandPath) this.editorBrandPath.value = origImg || '';
    if (this.editorShowImage) this.editorShowImage.checked = orig.showImage === true;
    if (this.editorBrandImg && this.selectedType === 'shop') {
      this.editorBrandImg.src = origImg || DEFAULT_IMAGE;
      this.editorBrandImg.style.display = orig.showImage === true ? '' : 'none';
    }
    this.editorWarning.classList.add('hidden');
    this.editorStatus.classList.add('hidden');
  }

  deleteObject() {
    if (!this.editMode) return;
    if (!this.selectedShop || !this.selectedMesh) return;
    if (this.selectedType === 'floor') { this.showStatus('场地不可删除', false); return; }
    const f = this.cur();
    const arr = f.data[this.selectedSource];
    const i = arr ? arr.indexOf(this.selectedShop) : -1;
    if (i !== -1) arr.splice(i, 1);

    if (this.hoveredMesh === this.selectedMesh) this.restoreHovered();
    const selArr = this.selectedType === 'shop' ? f.shopMeshes
      : this.selectedType === 'elevator' ? f.elevatorMeshes
      : f.markerMeshes;
    const j = selArr.indexOf(this.selectedMesh);
    if (j !== -1) selArr.splice(j, 1);
    f.group.remove(this.selectedMesh);
    this.disposeMesh(this.selectedMesh);

    this.selectedMesh = null;
    this.selectedShop = null;
    if (this.editorShopName) this.editorShopName.textContent = '—';
    if (this.editName) this.editName.value = '';
    if (this.editX) this.editX.value = '';
    if (this.editY) this.editY.value = '';
    if (this.editW) this.editW.value = '';
    if (this.editH) this.editH.value = '';
    if (this.editLen) this.editLen.value = '';
    if (this.editWide) this.editWide.value = '';
    if (this.editHigh) this.editHigh.value = '';
    if (this.editorBrand) this.editorBrand.classList.add('hidden');
    this.showStatus('已删除对象（保存后生效）', true);
  }

  addObject() {
    if (!this.editMode) return;
    const f = this.cur();
    const b = this.getFenceBounds();
    const w = 20;
    const h = 15;
    const cx = b ? (b.minX + b.maxX) / 2 : 0;
    const cy = b ? (b.minY + b.maxY) / 2 : 0;
    this.addSeq += 1;
    const newShop = {
      id: 'new_' + Date.now() + '_' + this.addSeq,
      name: '新对象' + this.addSeq,
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

    this.selectShop(mesh, newShop, 'shop', 'shops');
    this.floorEditActive = false;
    this.updateFloorPanel();
    this.updateCollisionWarning();
    this.showStatus('已新增对象（可拖动参数调整，保存后生效）', true);
  }

  convertSelectedToType(newType) {
    if (this.selectedType === newType) return;
    const f = this.cur();

    const curMeshArr = this.selectedType === 'shop' ? f.shopMeshes : f.elevatorMeshes;
    const curDataArr = f.data[this.selectedSource];
    const mi = curMeshArr.indexOf(this.selectedMesh);
    if (mi !== -1) curMeshArr.splice(mi, 1);
    const di = curDataArr ? curDataArr.indexOf(this.selectedShop) : -1;
    if (di !== -1) curDataArr.splice(di, 1);
    f.group.remove(this.selectedMesh);
    this.disposeMesh(this.selectedMesh);

    this.selectedType = newType;
    this.selectedSource = newType === 'elevator' ? 'elevators' : 'shops';

    if (newType === 'elevator') {
      const cx = this.selectedShop.x + (this.selectedShop.width || 0) / 2;
      const cy = this.selectedShop.y + (this.selectedShop.height || 0) / 2;
      this.selectedShop.width = 12;
      this.selectedShop.height = 12;
      this.selectedShop.tall = 30;
      this.selectedShop.x = Math.round(cx - 6);
      this.selectedShop.y = Math.round(cy - 6);
      delete this.selectedShop.category;
      delete this.selectedShop.color;
      delete this.selectedShop.img;
      delete this.selectedShop.showImage;
    } else {
      const val = this.editCategory.value;
      const colorVal = (val && val !== 'elevator' && CATEGORY_COLORS[val]) ? val : 'default';
      this.selectedShop.category = colorVal;
      this.selectedShop.color = CATEGORY_COLORS[colorVal];
    }

    f.data[this.selectedSource] = f.data[this.selectedSource] || [];
    f.data[this.selectedSource].push(this.selectedShop);

    const newMesh = newType === 'elevator' ? createElevatorMesh(this.selectedShop) : createShopMesh(this.selectedShop);
    newMesh.userData.item = this.selectedShop;
    newMesh.userData.type = this.selectedType;
    newMesh.userData.source = this.selectedSource;
    f.group.add(newMesh);
    (newType === 'elevator' ? f.elevatorMeshes : f.shopMeshes).push(newMesh);
    this.selectedMesh = newMesh;
    this.addSelectionHighlight(newMesh);

    this.selectShop(newMesh, this.selectedShop, this.selectedType, this.selectedSource);
    this.floorEditActive = false;
    this.updateFloorPanel();
    this.updateCollisionWarning();
  }

  onCategoryChange() {
    if (!this.selectedShop) return;
    const val = this.editCategory.value;
    if (val === 'elevator') {
      this.convertSelectedToType('elevator');
      return;
    }
    if (this.selectedType === 'elevator') {
      this.convertSelectedToType('shop');
    }
    this.selectedShop.category = val || undefined;
    if (val && CATEGORY_COLORS[val]) this.selectedShop.color = CATEGORY_COLORS[val];
    if (this.hoveredMesh === this.selectedMesh) this.restoreHovered();
    this.rebuildSelectedMesh();
  }

  onShowImageChange() {
    if (!this.selectedShop) return;
    this.selectedShop.showImage = this.editorShowImage.checked;
    this.editorBrandImg.style.display = this.editorShowImage.checked ? '' : 'none';
    if (this.hoveredMesh === this.selectedMesh) this.restoreHovered();
    this.rebuildSelectedMesh();
  }

  onBrandPathInput() {
    if (!this.selectedShop) return;
    const v = this.editorBrandPath.value.trim();
    this.selectedShop.img = v;
    this.editorBrandImg.src = v || DEFAULT_IMAGE;
    this.editorBrandImg.style.display = this.editorShowImage.checked ? '' : 'none';
  }

  async onBrandFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !this.selectedShop) return;
    this.editorBrandUpload.disabled = true;
    this.editorBrandUpload.textContent = '上传中…';
    try {
      let rel;
      if (typeof this.onUploadImage === 'function') {
        rel = await this.onUploadImage(file);
      } else {
        const r = await fetch(this.uploadUrl + '?name=' + encodeURIComponent(file.name), {
          method: 'POST',
          body: file
        });
        const json = await r.json();
        if (!json || !json.ok) throw new Error((json && json.error) || '上传失败');
        rel = json.path;
      }
      this.selectedShop.img = rel;
      this.editorBrandPath.value = rel;
      this.editorBrandImg.src = rel;
      if (this.editorShowImage) {
        this.editorShowImage.checked = true;
        this.selectedShop.showImage = true;
      }
      this.editorBrandImg.style.display = '';
      if (this.hoveredMesh === this.selectedMesh) this.restoreHovered();
      this.rebuildSelectedMesh();
      this.showStatus('已上传图片：' + rel, true);
    } catch (err) {
      this.showStatus('上传失败：' + err.message, false);
    } finally {
      this.editorBrandUpload.disabled = false;
      this.editorBrandUpload.textContent = '上传图片';
      this.editorBrandFile.value = '';
    }
  }

  // ============ 楼层切换 / 总览 / 增删 ============
  dimFloor(f, dim) {
    f.group.traverse((o) => {
      if (!o.isMesh && !o.isLine) return;
      if (o.userData && o.userData.isHighlight) return;
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

  applyVisibility() {
    this.floorObjs.forEach((f, i) => {
      if (this.overviewMode) {
        f.group.visible = true;
        this.dimFloor(f, false);
      } else {
        f.group.visible = (i === this.currentFloorIndex);
        this.dimFloor(f, false);
      }
    });
  }

  focusCameraOnCurrentFloor() {
    const y = this.currentFloorIndex * FLOOR_GAP;
    this.sceneManager.controls.target.set(0, y + 6, 0);
    this.sceneManager.camera.position.set(170, y + 170, 170);
    this.sceneManager.controls.update();
  }

  overviewCamera() {
    const totalH = (this.floorObjs.length - 1) * FLOOR_GAP;
    const midY = totalH / 2;
    this.sceneManager.controls.target.set(0, midY, 0);
    this.sceneManager.camera.position.set(230, totalH + 230, 230);
    this.sceneManager.controls.update();
  }

  switchFloor(i) {
    if (i < 0 || i >= this.floorObjs.length) return;
    this.currentFloorIndex = i;
    this.selectedMesh = null;
    this.selectedShop = null;
    if (this.editorShopName) this.editorShopName.textContent = '—';
    this.clearEditorFields();
    this.applyVisibility();
    if (!this.overviewMode) this.focusCameraOnCurrentFloor();
    this.updateFloorPanel();
  }

  toggleOverview() {
    this.overviewMode = !this.overviewMode;
    if (this.overviewMode) {
      this.floorEditActive = false;
      this.clearSelectionHighlight();
      this.selectedMesh = null;
      this.selectedShop = null;
      if (this.editorShopName) this.editorShopName.textContent = '—';
    }
    this.applyVisibility();
    if (this.overviewMode) this.overviewCamera();
    else this.focusCameraOnCurrentFloor();
    this.updateFloorPanel();
  }

  updateFloorPanel() {
    if (this.floorLabel) {
      this.floorLabel.textContent = this.overviewMode
        ? '总览模式（全部楼层）'
        : `当前聚焦楼层: ${this.cur().data.floor.name}`;
    }
    if (this.floorButtons) {
      this.floorButtons.innerHTML = '';
      this.mallData.floors.forEach((fd, i) => {
        const b = document.createElement('button');
        b.textContent = fd.floor.name;
        if (!this.overviewMode && i === this.currentFloorIndex) b.classList.add('active');
        if (this.floorEditActive && i === this.activeFloorIndex) b.classList.add('floor-edit');
        b.addEventListener('click', () => this.onFloorButtonClick(i));
        this.floorButtons.appendChild(b);
      });
    }
    if (this.overviewToggle) this.overviewToggle.classList.toggle('active', this.overviewMode);
  }

  onFloorButtonClick(i) {
    const fromOverview = this.overviewMode;
    this.overviewMode = false;
    if (fromOverview || i !== this.currentFloorIndex) this.switchFloor(i);
    if (this.editMode) this.activateFloorEditor();
  }

  activateFloorEditor() {
    this.floorEditActive = true;
    this.activeFloorIndex = this.currentFloorIndex;
    const f = this.cur();
    if (f.outlineMesh) {
      this.selectShop(f.outlineMesh, floorItem, 'floor', 'outline');
    } else {
      this.selectedMesh = null;
      this.selectedShop = floorItem;
      this.selectedType = 'floor';
      this.selectedSource = 'outline';
      if (this.editorPanel) this.editorPanel.classList.remove('hidden');
      this.editorWarning.classList.add('hidden');
      this.editorStatus.classList.add('hidden');
      if (this.editorShopName) this.editorShopName.textContent = f.data.floor.name + '场地';
      if (this.editName) this.editName.value = floorItem.name || '场地';
      if (this.editNameLabel) this.editNameLabel.style.display = 'none';
      if (this.editCategoryLabel) this.editCategoryLabel.style.display = 'none';
      if (this.editorBrand) this.editorBrand.classList.add('hidden');
      if (this.editorRowXY) this.editorRowXY.style.display = 'none';
      if (this.editorRowGeoSize) this.editorRowGeoSize.style.display = 'none';
      if (this.editorRowFloorSize) this.editorRowFloorSize.style.display = '';
      if (this.editorFloor) this.editorFloor.classList.remove('hidden');
      if (this.editorShopSvg) this.editorShopSvg.classList.add('hidden');
      if (this.editFloorId) this.editFloorId.value = f.data.floor.id;
    }
    this.updateFloorPanel();
  }

  reorderFloorsByLevel() {
    const order = this.floorObjs
      .map((f, i) => i)
      .sort((a, b) => (this.floorObjs[a].data.floor.id || 0) - (this.floorObjs[b].data.floor.id || 0));
    const newFloorObjs = order.map((i) => this.floorObjs[i]);
    const newMallFloors = order.map((i) => this.mallData.floors[i]);
    this.floorObjs.length = 0;
    Array.prototype.push.apply(this.floorObjs, newFloorObjs);
    this.mallData.floors = newMallFloors;
    this.floorObjs.forEach((ff, i) => {
      ff.group.position.y = i * FLOOR_GAP;
      ff.group.userData.floorIndex = i;
    });
  }

  addFloor() {
    if (!this.editMode) return;
    const used = new Set(
      this.mallData.floors.map((f) => f.floor.id).filter((n) => typeof n === 'number')
    );
    let newId = 1;
    while (used.has(newId)) newId++;
    const newName = newId + 'F';
    const topFloor = this.mallData.floors.length
      ? this.mallData.floors.reduce(
        (a, b) => (b.floor.id > a.floor.id ? b : a),
        this.mallData.floors[0]
      )
      : null;
    let srcOutline = [], srcElevators = [];
    if (topFloor) {
      srcOutline = topFloor.outline && topFloor.outline.length
        ? JSON.parse(JSON.stringify(topFloor.outline)) : [];
      srcElevators = topFloor.elevators && topFloor.elevators.length
        ? JSON.parse(JSON.stringify(topFloor.elevators)) : [];
    } else {
      const c = this.cur();
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
    this.mallData.floors.push(newFloor);
    const group = new THREE.Group();
    this.sceneManager.scene.add(group);
    const f = {
      data: newFloor, group,
      outlineMesh: null, fenceMesh: null,
      elevatorMeshes: [], shopMeshes: [], markerMeshes: []
    };
    this.buildFloor(f);
    this.floorObjs.push(f);
    this.reorderFloorsByLevel();
    this.currentFloorIndex = this.floorObjs.indexOf(f);
    this.overviewMode = false;
    this.applyVisibility();
    this.focusCameraOnCurrentFloor();
    this.activateFloorEditor();
    this.showStatus('已新增楼层 ' + newName, true);
  }

  onFloorIdChange() {
    if (this.selectedType !== 'floor') return;
    const n = parseInt(this.editFloorId.value, 10);
    if (!Number.isFinite(n) || n < 1) {
      this.editFloorId.value = this.cur().data.floor.id;
      this.showStatus('楼层编号需为正整数', false);
      return;
    }
    const f = this.cur();
    const dup = this.floorObjs.find((ff) => ff !== f && ff.data.floor.id === n);
    if (dup) {
      this.editFloorId.value = f.data.floor.id;
      this.showStatus('楼层编号 ' + n + 'F 已被占用，请换一个', false);
      return;
    }
    f.data.floor.id = n;
    f.data.floor.name = n + 'F';
    this.reorderFloorsByLevel();
    this.currentFloorIndex = this.floorObjs.indexOf(f);
    if (this.editorShopName) this.editorShopName.textContent = f.data.floor.name + '场地';
    this.applyVisibility();
    this.updateFloorPanel();
    this.focusCameraOnCurrentFloor();
    this.showStatus('已设置楼层为 ' + f.data.floor.name, true);
  }

  deleteFloor() {
    if (!this.editMode) return;
    if (this.mallData.floors.length <= 1) { this.showStatus('至少保留一个楼层', false); return; }
    const f = this.cur();
    this.sceneManager.scene.remove(f.group);
    this.disposeMesh(f.group);
    this.mallData.floors.splice(this.currentFloorIndex, 1);
    this.floorObjs.splice(this.currentFloorIndex, 1);
    this.reorderFloorsByLevel();
    if (this.currentFloorIndex >= this.floorObjs.length) this.currentFloorIndex = this.floorObjs.length - 1;
    this.selectedMesh = null;
    this.selectedShop = null;
    this.floorEditActive = false;

    if (this.editorShopName) this.editorShopName.textContent = '—';
    this.clearEditorFields();
    this.applyVisibility();
    if (!this.overviewMode) this.focusCameraOnCurrentFloor();
    this.updateFloorPanel();
    this.showStatus('已删除当前楼层', true);
  }

  clearEditorFields() {
    [this.editName, this.editX, this.editY, this.editW, this.editH, this.editLen, this.editWide, this.editHigh].forEach((el) => {
      if (el) el.value = '';
    });
    if (this.editorBrand) this.editorBrand.classList.add('hidden');
    this.editorWarning.classList.add('hidden');
    this.editorStatus.classList.add('hidden');
  }

  // ============ 模式切换 ============
  setMode(edit) {
    this.editMode = edit;
    this.modeBtns.forEach((b) => b.classList.toggle('active', (b.dataset.mode === 'edit') === edit));

    if (this.editorPanel) this.editorPanel.classList.toggle('hidden', !edit);

    if (this.floorAddBtn) this.floorAddBtn.style.display = edit ? '' : 'none';
    if (this.floorDelBtn) this.floorDelBtn.style.display = edit ? '' : 'none';

    [this.editAdd, this.editApply, this.editSave, this.editReset, this.editDelete, this.editExport, this.editImport,
      this.editorBrandUpload, this.editUploadSvg, this.editUploadShopSvg].forEach((b) => {
      if (b) b.disabled = !edit;
    });

    [this.editName, this.editX, this.editY, this.editW, this.editH, this.editLen, this.editWide, this.editHigh,
      this.editorBrandPath, this.editCategory, this.editorShowImage, this.editFloorId].forEach((el) => {
      if (el) el.disabled = !edit;
    });

    if (!edit) {
      if (this.selectedMesh) this.clearSelectionHighlight();
      this.selectedMesh = null;
      this.selectedShop = null;
      this.floorEditActive = false;
      this.isDragging = false;
      if (this.sceneManager.controls) this.sceneManager.controls.enabled = true;
      if (this.editorShopName) this.editorShopName.textContent = '—';
      this.clearEditorFields();
      this.updateFloorPanel();
    } else {
      this.activateFloorEditor();
    }
  }

  // ============ 全量重建 / 导入 / 导出 ============
  rebuildAllFloors() {
    this.floorObjs.forEach((f) => {
      this.sceneManager.scene.remove(f.group);
      this.disposeMesh(f.group);
    });
    this.floorObjs.length = 0;
    this.mallData.floors.forEach((fd, i) => {
      const group = new THREE.Group();
      group.position.y = i * FLOOR_GAP;
      group.userData = { floorIndex: i };
      this.sceneManager.scene.add(group);
      const f = {
        data: fd, group,
        outlineMesh: null, fenceMesh: null,
        elevatorMeshes: [], shopMeshes: [], markerMeshes: []
      };
      this.buildFloor(f);
      this.floorObjs.push(f);
    });
    this.reorderFloorsByLevel();
    if (this.currentFloorIndex >= this.floorObjs.length) this.currentFloorIndex = Math.max(0, this.floorObjs.length - 1);
    this.selectedMesh = null;
    this.selectedShop = null;
    if (this.editorShopName) this.editorShopName.textContent = '—';
    this.clearEditorFields();
  }

  computeRectShape(item) {
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

  _buildExportData() {
    const data = JSON.parse(JSON.stringify(this.mallData));
    (data.floors || []).forEach((fd) => {
      ['shops', 'elevators', 'entries', 'restrooms'].forEach((key) => {
        (fd[key] || []).forEach((item) => {
          item.shape = this.computeRectShape(item);
        });
      });
    });
    return data;
  }

  exportMall() {
    const data = this._buildExportData();
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
    this.showStatus('已导出全部楼层设置参数 JSON ✓', true);
  }

  importMall(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result);
        if (!json || typeof json !== 'object' || Array.isArray(json)) {
          throw new Error('文件内容不是有效的 JSON 对象');
        }
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
        Object.keys(this.mallData).forEach((k) => delete this.mallData[k]);
        Object.assign(this.mallData, json);
        this.rebuildAllFloors();
        this.originalMall = JSON.parse(JSON.stringify(this.mallData));
        this.currentFloorIndex = Math.max(0, this.mallData.floors.length - 1);
        this.overviewMode = false;
        this.applyVisibility();
        this.focusCameraOnCurrentFloor();
        this.updateFloorPanel();
        this.showStatus('已导入 JSON 配置并重建场景 ✓', true);
      } catch (e) {
        this.showStatus('导入失败：' + e.message, false);
      }
    };
    reader.onerror = () => this.showStatus('读取文件失败', false);
    reader.readAsText(file);
  }

  // ============ 长宽比锁定 ============
  toggleRatioLock(kind, btn) {
    const st = this.ratioLock[kind];
    st.on = !st.on;
    if (st.on) {
      const [a, b] = kind === 'floor'
        ? [parseFloat(this.editW.value), parseFloat(this.editH.value)]
        : [parseFloat(this.editLen.value), parseFloat(this.editWide.value)];
      st.ratio = (Number.isFinite(a) && Number.isFinite(b) && b > 0) ? a / b : 1;
    }
    btn.classList.toggle('active', st.on);
    btn.setAttribute('aria-pressed', st.on ? 'true' : 'false');
  }

  applyRatioSync(kind, primary) {
    const st = this.ratioLock[kind];
    if (!st.on || this.ratioSyncing) return;
    const [aEl, bEl] = kind === 'floor' ? [this.editW, this.editH] : [this.editLen, this.editWide];
    const va = parseFloat(aEl.value);
    const vb = parseFloat(bEl.value);
    this.ratioSyncing = true;
    if (primary === aEl) {
      if (Number.isFinite(va) && st.ratio > 0) bEl.value = Math.max(1, Math.round(va / st.ratio));
    } else {
      if (Number.isFinite(vb)) aEl.value = Math.max(1, Math.round(vb * st.ratio));
    }
    this.ratioSyncing = false;
    this.updateCollisionWarning();
  }

  onSvgFileChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = parseSvgOutline(reader.result);
      if (!raw || raw.length < 3) {
        this.showStatus('SVG 未解析出有效轮廓（支持 path/polygon/polyline/rect/circle/ellipse）', false);
        return;
      }
      const b = this.getFenceBounds();
      if (!b) { this.showStatus('当前场地无外轮廓', false); return; }
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
      this.cur().data.outline = out;
      this.rebuildFloor();
      if (this.selectedType === 'floor') {
        const nb = this.getFenceBounds();
        if (nb) {
          if (this.editW) this.editW.value = Math.round(nb.maxX - nb.minX);
          if (this.editH) this.editH.value = Math.round(nb.maxY - nb.minY);
        }
      }
      this.showStatus('已按 SVG 生成场地外边框', true);
    };
    reader.onerror = () => this.showStatus('读取 SVG 文件失败', false);
    reader.readAsText(file);
    e.target.value = '';
  }

  onShopSvgChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (!this.selectedShop || this.selectedType !== 'shop') return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = parseSvgOutline(reader.result);
      if (!raw || raw.length < 3) {
        this.showStatus('SVG 未解析出有效轮廓（支持 path/polygon/polyline/rect/circle/ellipse）', false);
        return;
      }
      const xs = raw.map((p) => p[0]);
      const ys = raw.map((p) => p[1]);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const w = maxX - minX || 1;
      const h = maxY - minY || 1;
      const scale = Math.min(this.selectedShop.width / w, this.selectedShop.height / h);
      const shape = raw.map(([px, py]) => {
        const nx = (px - (minX + maxX) / 2) * scale;
        const ny = -(py - (minY + maxY) / 2) * scale;
        return [Math.round(nx), Math.round(ny)];
      });
      this.selectedShop.shape = shape;
      if (this.hoveredMesh === this.selectedMesh) this.restoreHovered();
      this.rebuildSelectedMesh();
      this.showStatus('已按 SVG 改变商铺外观', true);
    };
    reader.onerror = () => this.showStatus('读取 SVG 文件失败', false);
    reader.readAsText(file);
    e.target.value = '';
  }

  // ============ 事件绑定 ============
  _bindEvents() {
    this._onPointerMove = (e) => this.onPointerMove(e);
    this._onPointerClick = (e) => this.onPointerClick(e);
    this._onPointerDblClick = (e) => this.onPointerDblClick(e);
    this._onPointerDown = (e) => this.onPointerDown(e);
    this._onPointerUp = () => this.onPointerUp();

    this.app.addEventListener('mousemove', this._onPointerMove);
    this.app.addEventListener('click', this._onPointerClick);
    this.app.addEventListener('dblclick', this._onPointerDblClick);
    this.app.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);

    if (this.editAdd) this.editAdd.addEventListener('click', () => this.addObject());
    if (this.editApply) this.editApply.addEventListener('click', () => this.applyEdit());
    if (this.editSave) this.editSave.addEventListener('click', () => this.saveMall());
    if (this.editReset) this.editReset.addEventListener('click', () => this.resetObject());
    if (this.editDelete) this.editDelete.addEventListener('click', () => this.deleteObject());

    if (this.overviewToggle) this.overviewToggle.addEventListener('click', () => this.toggleOverview());
    if (this.floorAddBtn) this.floorAddBtn.addEventListener('click', () => this.addFloor());
    if (this.floorDelBtn) this.floorDelBtn.addEventListener('click', () => this.deleteFloor());
    if (this.editFloorId) this.editFloorId.addEventListener('change', () => this.onFloorIdChange());

    if (this.modeGroup) {
      this.modeBtns.forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode === 'edit')));
    }

    if (this.editExport) this.editExport.addEventListener('click', () => this.exportMall());
    if (this.editImport) this.editImport.addEventListener('click', () => this.editorImportFile && this.editorImportFile.click());
    if (this.editorImportFile) this.editorImportFile.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) this.importMall(file);
      e.target.value = '';
    });

    [this.editX, this.editY, this.editW, this.editH, this.editLen, this.editWide, this.editHigh].forEach((el) => {
      if (el) el.addEventListener('input', () => this.updateCollisionWarning());
    });

    if (this.lockFloorRatio) this.lockFloorRatio.addEventListener('click', () => this.toggleRatioLock('floor', this.lockFloorRatio));
    if (this.lockGeoRatio) this.lockGeoRatio.addEventListener('click', () => this.toggleRatioLock('geo', this.lockGeoRatio));
    if (this.editW) this.editW.addEventListener('input', () => this.applyRatioSync('floor', this.editW));
    if (this.editH) this.editH.addEventListener('input', () => this.applyRatioSync('floor', this.editH));
    if (this.editLen) this.editLen.addEventListener('input', () => this.applyRatioSync('geo', this.editLen));
    if (this.editWide) this.editWide.addEventListener('input', () => this.applyRatioSync('geo', this.editWide));
    if (this.editorBrandPath) this.editorBrandPath.addEventListener('input', () => this.onBrandPathInput());
    if (this.editorShowImage) this.editorShowImage.addEventListener('change', () => this.onShowImageChange());
    if (this.editorBrandUpload) this.editorBrandUpload.addEventListener('click', () => this.editorBrandFile && this.editorBrandFile.click());
    if (this.editorBrandFile) this.editorBrandFile.addEventListener('change', (e) => this.onBrandFileChange(e));

    if (this.editUploadSvg) this.editUploadSvg.addEventListener('click', () => this.editorSvgFile && this.editorSvgFile.click());
    if (this.editorSvgFile) this.editorSvgFile.addEventListener('change', (e) => this.onSvgFileChange(e));

    if (this.editUploadShopSvg) this.editUploadShopSvg.addEventListener('click', () => this.editorShopSvgFile && this.editorShopSvgFile.click());
    if (this.editorShopSvgFile) this.editorShopSvgFile.addEventListener('change', (e) => this.onShopSvgChange(e));

    if (this.editCategory) {
      this.editCategory.innerHTML =
        '<option value="elevator">电梯</option>' +
        SHOP_CATEGORIES.map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
      this.editCategory.addEventListener('change', () => this.onCategoryChange());
    }

    if (this.editorPanel) {
      this.editorPanel.addEventListener('click', (e) => e.stopPropagation());
      this.editorPanel.addEventListener('mousemove', (e) => e.stopPropagation());
      this.editorPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    if (this.floorPanelEl) {
      this.floorPanelEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
  }

  _init() {
    this.applyVisibility();
    this.updateFloorPanel();
    this.focusCameraOnCurrentFloor();
    this.activateFloorEditor();
    if (!this.editable) this.setMode(false);
  }

  _startAnimation() {
    const animate = () => {
      this._raf = requestAnimationFrame(animate);
      this.sceneManager.render();
    };
    animate();
  }

  // ============ 公共 API ============
  /** 热替换布局数据并重建场景 */
  loadData(data) {
    this.mallData = this.normalizeData(data || { floors: [] });
    this.originalMall = JSON.parse(JSON.stringify(this.mallData));
    this.currentFloorIndex = Math.max(0, this.mallData.floors.length - 1);
    this.overviewMode = false;
    this.rebuildAllFloors();
    this.applyVisibility();
    this.focusCameraOnCurrentFloor();
    this.updateFloorPanel();
    this.activateFloorEditor();
  }

  /** 返回当前布局数据（深拷贝，外部修改不影响内部） */
  getData() {
    return JSON.parse(JSON.stringify(this.mallData));
  }

  /** 返回导出用的 JSON 字符串（含各对象 shape） */
  exportJSON() {
    return JSON.stringify(this._buildExportData(), null, 2);
  }

  /** 切换编辑(true)/浏览(false)模式 */
  setEditMode(edit) {
    this.setMode(edit);
  }

  /** 获取底层 SceneManager（高级用法） */
  getSceneManager() {
    return this.sceneManager;
  }

  /** 卸载：移除事件、释放 WebGL 资源、清空 DOM */
  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    window.removeEventListener('pointerup', this._onPointerUp);
    if (this.app) {
      this.app.removeEventListener('mousemove', this._onPointerMove);
      this.app.removeEventListener('click', this._onPointerClick);
      this.app.removeEventListener('dblclick', this._onPointerDblClick);
      this.app.removeEventListener('pointerdown', this._onPointerDown);
    }
    this.floorObjs.forEach((f) => {
      this.sceneManager.scene.remove(f.group);
      this.disposeMesh(f.group);
    });
    this.floorObjs.length = 0;
    if (this.sceneManager && this.sceneManager.renderer) {
      this.sceneManager.renderer.dispose();
      if (this.sceneManager.renderer.domElement && this.sceneManager.renderer.domElement.parentNode) {
        this.sceneManager.renderer.domElement.parentNode.removeChild(this.sceneManager.renderer.domElement);
      }
    }
    if (this.root) this.root.innerHTML = '';
  }
}
