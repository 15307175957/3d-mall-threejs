import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// 开发期中间件：接收前端保存请求，将布局写回 src/data/mall.json
function saveMallPlugin() {
  return {
    name: 'save-mall',
    configureServer(server) {
      server.middlewares.use('/api/save-mall', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const file = path.resolve(process.cwd(), 'src/data/mall.json');
            fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch (e) {
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String(e) }));
          }
        });
      });

      // 开发期中间件：接收上传图片，写入 src/images/ 并返回相对路径
      server.middlewares.use('/api/upload-image', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        // 从查询参数取文件名，仅保留 basename 防目录穿越
        const qIndex = req.url.indexOf('?');
        const params = new URLSearchParams(qIndex >= 0 ? req.url.slice(qIndex + 1) : '');
        let name = params.get('name') || 'upload.png';
        name = path.basename(name);
        const dir = path.resolve(process.cwd(), 'src/images');
        let target = path.join(dir, name);
        // 重名则追加时间戳避免覆盖
        if (fs.existsSync(target)) {
          const ext = path.extname(name);
          const base = name.slice(0, name.length - ext.length);
          target = path.join(dir, `${base}_${Date.now()}${ext}`);
        }
        const out = fs.createWriteStream(target);
        req.pipe(out);
        out.on('finish', () => {
          const rel = '/src/images/' + path.basename(target);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true, path: rel }));
        });
        out.on('error', (e) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        });
        req.on('error', (e) => {
          res.statusCode = 500;
          res.end(JSON.stringify({ ok: false, error: String(e) }));
        });
      });
    }
  };
}

export default defineConfig({
  plugins: [saveMallPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  // 演示页构建输出到独立目录，避免覆盖库构建产物 dist/mall-viewer.js
  build: {
    outDir: 'dist-demo'
  }
});
