# 三维商城布局图（3D Mall Layout）

基于 **Three.js** 的可视化三维商城布局编辑器。支持多层商场（楼层沿 Y 轴堆叠）、店铺/电梯/出入口/卫生间等要素的参数化编辑、SVG 外轮廓导入、品牌图上传，以及将布局数据保存回本地 JSON。

---

## 技术栈

| 类别 | 说明 |
| --- | --- |
| 渲染 | [Three.js](https://threejs.org/) `^0.160.0`（含 `OrbitControls`） |
| 构建/开发服务器 | [Vite](https://vitejs.dev/) `^5.0.0` |
| 语言 | 原生 ES Module（JavaScript），无框架 |
| 数据 | 单一 JSON 文件 `src/data/mall.json` |
| 运行环境 | Node.js（Windows，通过 `start.bat` 一键启动） |

---

## 目录结构

```
3D_Demo_threeJS/
├── index.html              # 页面骨架与参数编辑面板 UI
├── start.bat              # 一键启动脚本（安装依赖→杀旧进程→起 Vite→开浏览器）
├── vite.config.js         # Vite 配置 + 两个开发期中间件（保存/上传）
├── package.json
├── src/
│   ├── main.js            # 核心逻辑：场景装配、交互、编辑、保存
│   ├── style.css          # 全局样式（面板、按钮、锁图标等）
│   ├── core/
│   │   └── SceneManager.js        # 场景/相机/灯光/OrbitControls/渲染循环
│   ├── builders/          # 各类网格构造器
│   │   ├── FloorBuilder.js        # 楼层 Group 装配
│   │   ├── ShopBuilder.js         # 店铺网格（含轮廓、品牌贴图、SVG 外观）
│   │   ├── ElevatorBuilder.js     # 电梯
│   │   ├── FenceBuilder.js        # 场地围栏
│   │   ├── MarkerBuilder.js       # 出入口/卫生间标识
│   │   ├── AtriumBuilder.js       # 中庭
│   │   └── FacilityBuilder.js     # 设施
│   ├── config/
│   │   ├── categories.js          # 店铺分类与配色
│   │   └── brandImages.js         # 品牌图路径映射与默认图
│   ├── utils/
│   │   ├── svgOutline.js          # SVG 路径解析 → 顶点轮廓
│   │   └── LogoTexture.js         # 文字/Logo 纹理生成
│   ├── data/
│   │   └── mall.json              # 商城布局数据源（运行时被读写）
│   └── images/                    # 上传/内置图片资源
└── dist/                   # `npm run build` 产物
```

---

## 快速开始

### 方式一：双击 `start.bat`（推荐，Windows）

脚本会自动完成：

1. 若 `node_modules` 不存在则执行 `npm install`；
2. 杀掉占用 `5173` 端口的旧 Vite 进程；
3. 后台轮询等待 Vite 就绪，就绪后打印 `加载完成，正在打开浏览器...` 并自动打开 `http://localhost:5173`；
4. 在本窗口运行 `npm run dev`（关闭此窗口即停止服务）。

> 浏览器加载完成后建议按 `Ctrl + Shift + R` 硬刷新，避免旧模块缓存。

### 方式二：命令行

```bash
npm install      # 首次安装依赖
npm run dev      # 启动开发服务器（http://localhost:5173）
```

### 构建生产包

```bash
npm run build    # 输出到 dist/
npm run preview  # 预览构建产物
```

---

## 离线运行

本项目**支持完全离线运行**，前提是 `node_modules` 已安装（当前仓库已自带）。

### 为什么能离线

1. **依赖全部本地化**：所有 Three.js 引用均为本地模块导入（`import * as THREE from 'three'`），解析到本地 `node_modules/three/`，不走 CDN。
2. **`index.html` 无外链**：样式与脚本均为本地相对路径，无 `<script src="https://...">` 之类的 CDN 标签。
3. **保存/上传接口为本地中间件**：`vite.config.js` 中的 `/api/save-mall`、`/api/upload-image` 是 Vite 开发服务器的本地中间件，不请求外部网络。
4. **`http/https` 均非运行时联网**：`start.bat` 里的 `http://localhost:5173` 是本地回环地址；`README` 里的 `https://threejs.org/` 仅为文档说明；`package-lock.json` 里的 `https://registry.npmjs.org/...` 仅记录包来源，**仅在 `npm install` 时用到**，运行时不访问。

### 不同场景的联网需求

| 场景 | 是否需要联网 | 说明 |
| --- | --- | --- |
| 直接运行（已有 `node_modules`） | 不需要 | `start.bat` 或 `npm run dev` 启动开发服务器，纯本地 |
| 重新 `npm install` | 需要 | 仅当 `node_modules` 被删除、需重装依赖时才联网 |
| 部署 `dist/`（已存在） | 不需要 | 生产构建产物，可用任意静态服务器离线打开 |

### 最稳妥的离线方案（脱离 Node/网络）

若想完全脱离 Node 与网络环境，可直接使用已构建好的 `dist/`：

```bash
# dist/ 为打包后的静态资源，不依赖 node_modules、不依赖网络
npx serve dist          # 或 python -m http.server 指向 dist
```

将 `dist/` 目录拷到任意机器，用任意静态服务器打开即可运行。

---

## 核心功能

### 模式切换
- **编辑模式**（默认）：可点选对象、修改参数、增删楼层与要素。
- **预览模式**：仅允许切换楼层 / 总览，禁止编辑，用于查看最终效果。

### 楼层管理
- 顶部楼层栏列出各层，点击切换聚焦楼层（默认聚焦顶层）。
- **＋ 楼层**：新增一层，自动复制顶层（编号最大层）的围墙外轮廓与电梯数据。
- **－ 删除**：删除当前聚焦楼层。
- **总览**：切换多层堆叠总览视图；进入总览时清除选中高亮。

### 对象选择与编辑
- **单击**任意店铺/电梯/标识/场地 → 选中并在右侧「参数详情」面板显示其属性。
- **双击空白处** → 取消选中并切回场地（楼层参数）视图。
- 选中后可在面板修改：名称、类型（分类）、坐标（X/Y）、尺寸（场地：宽/高；商铺：长/宽/高）。
- **长宽比锁**：场地宽/高行、商铺长/宽行末尾的锁按钮，点亮后锁定长宽比，编辑一侧另一侧按比例联动。
- **碰撞检测**：编辑尺寸/坐标时实时检测与其他对象的重叠，并在面板给出警告。

### 场地与要素
- **场地外边框**：可上传 SVG 生成外轮廓，并自动生成围栏。
- **商铺**：支持上传品牌图（图片路径或本地上传）、上传 SVG 外观、按分类着色。
- **电梯 / 出入口 / 卫生间**：数据驱动，可点击、编辑、删除。

### 数据持久化
- **保存**：将当前布局写回 `src/data/mall.json`（通过 Vite 中间件 `POST /api/save-mall`）。
- **重置**：从 `mall.json` 重新加载初始数据。
- **导出 / 导入**：将布局以 JSON 文件导出或导入。

---

## 数据模型（`src/data/mall.json`）

顶层为 `floors` 数组，每个楼层结构如下：

```jsonc
{
  "floors": [
    {
      "floor":   { "id": 1, "name": "1F" },   // 楼层编号与名称
      "outline": [[x, y], ...],               // 场地外轮廓顶点（二维，单位与场景一致）
      "atrium":  {},                           // 中庭配置
      "shops":   [                             // 店铺列表
        {
          "id": "shop1",
          "name": "店铺A",
          "category": "餐饮",
          "x": 0, "y": 0,                      // 中心坐标
          "len": 20, "wide": 15, "high": 10,  // 长/宽/高
          "brandImage": "/src/images/xxx.png", // 可选品牌图
          "showImage": true,
          "svg": "..."                          // 可选 SVG 外观
        }
      ],
      "elevators": [ { "x": 0, "y": 0, "width": 8, "depth": 8 } ],
      "entries":   [ { "x": 0, "y": 40, "size": 6 } ],   // 出入口标识
      "restrooms": [ { "x": 30, "y": 0, "size": 6 } ]    // 卫生间标识
    }
  ]
}
```

> **兼容说明**：旧版单层结构（顶层直接是 `floor`/`outline`/`shops` 等）会在 `main.js` 启动时自动迁移为 `floors` 数组，无需手工转换。
> 注意原始楼层数据 `outline`/`elevators` 等字段直接挂在楼层对象顶层（无 `.data` 包裹），`.data` 仅用于运行时包装对象。

---

## 架构概览

- **场景装配**：`main.js` 读取 `mallData`，为每层创建一个 `THREE.Group`，沿 Y 轴以 `FLOOR_GAP = 30` 堆叠；每层内由 `buildFloor()` 装配外轮廓、围栏、电梯、店铺、标识。
- **渲染**：`SceneManager` 负责 `WebGLRenderer`（开启阴影、`ACESFilmicToneMapping`）、`PerspectiveCamera`、`OrbitControls`（带阻尼）、多光源（环境光 + 半球光 + 主方向光投射阴影 + 补光）与窗口自适应。
- **交互**：`Raycaster` 做鼠标拾取；`mousemove` 做 hover 高亮 + tooltip；`click` 选中；`dblclick` 空白处取消选中。
- **编辑**：面板输入实时回写选中对象并重建对应网格，同时做碰撞检测。

---

## 开发期 API（Vite 中间件）

`vite.config.js` 内置两个中间件，仅在 `npm run dev` 下生效：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/save-mall` | 接收布局 JSON，写回 `src/data/mall.json`。 |
| `POST` | `/api/upload-image?name=xxx.png` | 接收图片流，写入 `src/images/`（重名追加时间戳防覆盖），返回相对路径。 |

---

## 常见问题

- **点击「＋ 楼层」报错 `Cannot read properties of undefined (reading 'outline')`**：旧代码误用 `src.data.outline` 读取原始楼层数据，已修复为直接读取 `topFloor.outline`。确保使用最新代码并硬刷新。
- **浏览器控制台报 `reading 'traverse'` 之类旧错误**：多为旧模块缓存导致，请关闭标签页、`start.bat` 重启后 `Ctrl + Shift + R` 硬刷新。
- **端口被占用**：`start.bat` 会自动杀掉 `5173` 端口旧进程；手动排查可用 `netstat -ano | findstr 5173`。
- **修改未生效**：确认是通过 Vite 开发服务器（`start.bat` / `npm run dev`）访问，而非直接打开 `index.html` 静态文件（模块导入与中间件均依赖开发服务器）。

---

## 许可

内部项目，仅供数据治理相关演示与编辑使用。
