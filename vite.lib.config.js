import { defineConfig } from 'vite';

// 库构建配置：将 MallViewer 打成 ESM，供其它工程 import 使用。
// 用法：npm run build:lib  ->  产物 dist/mall-viewer.js
// three 作为外部依赖（peerDependency），由使用方自行安装，避免重复打包。
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/MallViewer.js',
      name: 'MallViewer',
      formats: ['es'],
      fileName: 'mall-viewer'
    },
    rollupOptions: {
      // 将 three 及其子路径（如 examples/jsm 下的 OrbitControls）全部外部化，
      // 由使用方安装 three 提供，避免重复打包。
      external: [/^three/]
    }
  }
});
