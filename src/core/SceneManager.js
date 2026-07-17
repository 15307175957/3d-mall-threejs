import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class SceneManager {
  constructor(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = null; // 透明，露出 CSS 径向渐变背景
    this.scene.fog = new THREE.Fog(0x081830, 260, 1400);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 160, 180);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35; // 提高曝光，解决整体昏暗
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2.1;
    this.controls.minDistance = 50;
    this.controls.maxDistance = 900;
    this.controls.target.set(0, 0, 0);

    this._setupLights();
    this._handleResize();
  }

  _setupLights() {
    // 环境光：整体基础亮度
    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(ambient);

    // 半球光：天空蓝 + 地面暗色，模拟自然天空照明，显著提升通透感
    const hemi = new THREE.HemisphereLight(0x9fc8ff, 0x2a3a4a, 0.7);
    this.scene.add(hemi);

    // 主方向光：投射阴影
    const dir = new THREE.DirectionalLight(0xffffff, 1.6);
    dir.position.set(80, 360, 60);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 0.5;
    dir.shadow.camera.far = 900;
    dir.shadow.camera.left = -200;
    dir.shadow.camera.right = 200;
    dir.shadow.camera.top = 200;
    dir.shadow.camera.bottom = -200;
    this.scene.add(dir);

    // 补光：从另一侧打亮暗部
    const fill = new THREE.DirectionalLight(0x8cc8ff, 0.6);
    fill.position.set(-60, 80, -60);
    this.scene.add(fill);

    // 底部补光：减弱底部死黑
    const bottom = new THREE.DirectionalLight(0x335577, 0.4);
    bottom.position.set(0, -40, 0);
    this.scene.add(bottom);
  }

  _handleResize() {
    window.addEventListener('resize', () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    });
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
