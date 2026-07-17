import { MallViewer } from './MallViewer.js';
import mallData from './data/mall.json';

// 演示入口：把 3D 商场查看器挂载到 #app 容器。
// 工程方接入时只需：new MallViewer({ container, data, onSave, onUploadImage })
const viewer = new MallViewer({
  container: document.getElementById('app'),
  data: mallData,
  editable: true, // 演示页显式开启编辑；库默认 editable=false（仅预览）
  // 保存回调：自行对接后端 / 写回文件；不传则回退到开发期 /api/save-mall
  // onSave: (data) => api.post('/mall', data),
  // 图片上传回调：返回可访问的图片路径；不传则回退到 /api/upload-image
  // onUploadImage: (file) => uploadImage(file),
});

// 方便在控制台调试
window.__mallViewer = viewer;
