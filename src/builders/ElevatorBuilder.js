import * as THREE from 'three';
import { SHOP_HEIGHT } from './ShopBuilder.js';

// 电梯高度为周围商铺的 2 倍
export const ELEVATOR_HEIGHT = SHOP_HEIGHT * 2;

// 由 x/y/width/height（左下角 + 尺寸，场景 X=x、场景 Z=y）构建一部电梯
// 返回一个 Group：半透明箱体 + 正面底部两扇门
export function createElevatorMesh(elevator) {
  const { x, y, width, height } = elevator;
  const tall = elevator.tall || ELEVATOR_HEIGHT;
  const centerX = x + width / 2;
  const centerZ = y + height / 2;

  const group = new THREE.Group();
  group.userData = { type: 'elevator', item: elevator };

  // 半透明箱体
  const boxGeo = new THREE.BoxGeometry(width, tall, height);
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x66ccff,
    transparent: true,
    opacity: 0.35,
    emissive: 0x114466,
    emissiveIntensity: 0.4,
    roughness: 0.2,
    metalness: 0.1
  });
  const box = new THREE.Mesh(boxGeo, boxMat);
  box.position.set(centerX, tall / 2, centerZ);
  // 半透明箱体不应阻挡其后方实体对象的拾取（允许“看穿”选中后方对象）
  box.userData.skipOcclusion = true;
  group.add(box);

  // 电梯门：正面（+Z 侧）底部两扇竖直门（左右对开），门底贴地
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x9fd4ff,
    emissive: 0x224466,
    emissiveIntensity: 0.5,
    roughness: 0.3,
    metalness: 0.3,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  const doorGeo = new THREE.PlaneGeometry(2.5, 8);
  const doorZ = centerZ + height / 2 + 0.1;
  [-1.27, 1.27].forEach((dx) => {
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(centerX + dx, 4, doorZ);
    group.add(door);
  });

  return group;
}

// 释放 Group 内所有子网格的几何体与材质
export function disposeElevator(group) {
  group.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      obj.material.dispose();
    }
  });
}
