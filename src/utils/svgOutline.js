// 解析 SVG 文件，提取其首个图形元素的外轮廓，返回 [x, y] 点数组（SVG 用户坐标系，y 向下）。
// 支持 path（含曲线采样）、polygon、polyline、rect、circle、ellipse。

function reflect(p, c) {
  return [2 * c[0] - p[0], 2 * c[1] - p[1]];
}

function sampleBezier(p0, p1, p2, p3, push) {
  const steps = 16;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    push([x, y]);
  }
}

function sampleQuad(p0, p1, p2, push) {
  const steps = 12;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps, u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    push([x, y]);
  }
}

// 椭圆弧端点参数化 → 中心点参数化，按角度均匀采样
function sampleArc(p0, rx, ry, xAxisRot, largeArc, sweep, p3, push) {
  const phi = (xAxisRot * Math.PI) / 180;
  const cosPhi = Math.cos(phi), sinPhi = Math.sin(phi);
  const dx = (p0[0] - p3[0]) / 2;
  const dy = (p0[1] - p3[1]) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  rx = Math.abs(rx); ry = Math.abs(ry);
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
  const sign = largeArc === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let co = 0;
  if (den > 0) co = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = co * ((rx * y1p) / ry);
  const cyp = co * ((-ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (p0[0] + p3[0]) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (p0[1] + p3[1]) / 2;

  const angle = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1;
    let a = Math.acos(Math.max(-1, Math.min(1, dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };

  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dtheta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep && dtheta < 0) dtheta += 2 * Math.PI;
  const steps = Math.max(8, Math.ceil(Math.abs(dtheta) / (Math.PI / 16)));
  for (let s = 1; s <= steps; s++) {
    const t = theta1 + dtheta * (s / steps);
    const ex = cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi;
    const ey = cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi;
    push([ex, ey]);
  }
}

function tokenizePath(d) {
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push({ cmd: m[1] });
    else tokens.push({ num: parseFloat(m[2]) });
  }
  return tokens;
}

function parsePathD(d) {
  const tokens = tokenizePath(d);
  let i = 0;
  let cmd = null;
  let cur = [0, 0];
  let start = [0, 0];
  let prevCtrl = null;
  const out = [];
  const push = (p) => {
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  };
  while (i < tokens.length) {
    if (tokens[i].cmd) { cmd = tokens[i].cmd; i++; }
    else if (cmd === null) { i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'M') {
      const x = tokens[i].num, y = tokens[i + 1].num; i += 2;
      const p = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      cur = p; start = p; push(p);
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      const x = tokens[i].num, y = tokens[i + 1].num; i += 2;
      cur = rel ? [cur[0] + x, cur[1] + y] : [x, y]; push(cur);
    } else if (C === 'H') {
      const x = tokens[i].num; i += 1;
      cur = [rel ? cur[0] + x : x, cur[1]]; push(cur);
    } else if (C === 'V') {
      const y = tokens[i].num; i += 1;
      cur = [cur[0], rel ? cur[1] + y : y]; push(cur);
    } else if (C === 'C') {
      const x1 = tokens[i].num, y1 = tokens[i + 1].num, x2 = tokens[i + 2].num, y2 = tokens[i + 3].num, x = tokens[i + 4].num, y = tokens[i + 5].num; i += 6;
      const p0 = cur;
      const p1 = rel ? [cur[0] + x1, cur[1] + y1] : [x1, y1];
      const p2 = rel ? [cur[0] + x2, cur[1] + y2] : [x2, y2];
      const p3 = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      sampleBezier(p0, p1, p2, p3, push);
      cur = p3; prevCtrl = p2;
    } else if (C === 'S') {
      const x2 = tokens[i].num, y2 = tokens[i + 1].num, x = tokens[i + 2].num, y = tokens[i + 3].num; i += 4;
      const p0 = cur;
      const p1 = prevCtrl ? reflect(p0, prevCtrl) : p0;
      const p2 = rel ? [cur[0] + x2, cur[1] + y2] : [x2, y2];
      const p3 = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      sampleBezier(p0, p1, p2, p3, push);
      cur = p3; prevCtrl = p2;
    } else if (C === 'Q') {
      const x1 = tokens[i].num, y1 = tokens[i + 1].num, x = tokens[i + 2].num, y = tokens[i + 3].num; i += 4;
      const p0 = cur;
      const p1 = rel ? [cur[0] + x1, cur[1] + y1] : [x1, y1];
      const p2 = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      sampleQuad(p0, p1, p2, push);
      cur = p2; prevCtrl = p1;
    } else if (C === 'T') {
      const x = tokens[i].num, y = tokens[i + 1].num; i += 2;
      const p0 = cur;
      const p1 = prevCtrl ? reflect(p0, prevCtrl) : p0;
      const p2 = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      sampleQuad(p0, p1, p2, push);
      cur = p2; prevCtrl = p1;
    } else if (C === 'A') {
      const rx = tokens[i].num, ry = tokens[i + 1].num, xAxisRot = tokens[i + 2].num, largeArc = tokens[i + 3].num, sweep = tokens[i + 4].num, x = tokens[i + 5].num, y = tokens[i + 6].num; i += 7;
      const p0 = cur;
      const p3 = rel ? [cur[0] + x, cur[1] + y] : [x, y];
      sampleArc(p0, rx, ry, xAxisRot, largeArc, sweep, p3, push);
      cur = p3; prevCtrl = null;
    } else if (C === 'Z') {
      if (out.length) push(start);
      cur = start; i++;
    } else {
      i++;
    }
  }
  return out;
}

function parsePointsAttr(str) {
  if (!str) return [];
  const nums = str.trim().split(/[\s,]+/).map(Number).filter((n) => !isNaN(n));
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  return pts;
}

function closeLoop(pts) {
  if (pts.length && (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1])) {
    pts.push([pts[0][0], pts[0][1]]);
  }
  return pts;
}

function sampleEllipse(cx, cy, rx, ry) {
  const pts = [];
  const steps = 64;
  for (let s = 0; s < steps; s++) {
    const t = (s / steps) * 2 * Math.PI;
    pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
  }
  return pts;
}

export function parseSvgOutline(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return null;
  const svg = doc.querySelector('svg');
  if (!svg) return null;

  let points = null;
  const path = svg.querySelector('path');
  if (path && path.getAttribute('d')) {
    points = parsePathD(path.getAttribute('d'));
  } else {
    const poly = svg.querySelector('polygon, polyline');
    if (poly) {
      points = parsePointsAttr(poly.getAttribute('points'));
      if (poly.tagName.toLowerCase() === 'polyline') points = closeLoop(points);
    } else {
      const rect = svg.querySelector('rect');
      if (rect) {
        const x = parseFloat(rect.getAttribute('x') || 0);
        const y = parseFloat(rect.getAttribute('y') || 0);
        const w = parseFloat(rect.getAttribute('width') || 0);
        const h = parseFloat(rect.getAttribute('height') || 0);
        points = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      } else {
        const circle = svg.querySelector('circle');
        if (circle) {
          const cx = parseFloat(circle.getAttribute('cx') || 0);
          const cy = parseFloat(circle.getAttribute('cy') || 0);
          const r = parseFloat(circle.getAttribute('r') || 0);
          points = sampleEllipse(cx, cy, r, r);
        } else {
          const ellipse = svg.querySelector('ellipse');
          if (ellipse) {
            const cx = parseFloat(ellipse.getAttribute('cx') || 0);
            const cy = parseFloat(ellipse.getAttribute('cy') || 0);
            const rx = parseFloat(ellipse.getAttribute('rx') || 0);
            const ry = parseFloat(ellipse.getAttribute('ry') || 0);
            points = sampleEllipse(cx, cy, rx, ry);
          }
        }
      }
    }
  }

  if (!points || points.length < 3) return null;
  return points;
}
