/**
 * 直角佈線：在 10px 格點上用 A* 找路，避開設備（含名稱），少轉彎，
 * 不同節點的線盡量不重疊；同一節點的線可以共用路徑，分岔處畫節點圓點。
 */
import type { Side } from './layout';

export const G = 10;

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export interface End {
  x: number;
  y: number;
  side: Side;
  /** 端子所屬設備的範圍，用來決定引出線長度 */
  box: Rect;
}
export interface RouteReq {
  id: string;
  net: string;
  a: End;
  b: End;
  /** 手動轉折點：有的話照這些點走直角線，不自動找路 */
  manual?: { x: number; y: number }[];
}
export interface Route {
  id: string;
  net: string;
  points: { x: number; y: number }[];
  /** 格點路徑（含頭尾），用來計算分岔節點 */
  cells: number[];
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];
const sideDir: Record<Side, number> = { right: 0, bottom: 1, left: 2, top: 3, none: -1 };

class Heap {
  k: number[] = [];
  v: number[] = [];
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= k.length) break;
        if (c + 1 < k.length && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
  get size() {
    return this.k.length;
  }
}

/** 端子往外引出到設備外的第一個格點 */
function escape(e: End): { x: number; y: number; dir: number } {
  const m = 10;
  const snap = (v: number) => Math.round(v / G) * G;
  switch (e.side) {
    case 'top':
      return { x: snap(e.x), y: Math.floor((Math.min(e.y, e.box.y1) - m) / G) * G, dir: 3 };
    case 'bottom':
      return { x: snap(e.x), y: Math.ceil((Math.max(e.y, e.box.y2) + m) / G) * G, dir: 1 };
    case 'left':
      return { x: Math.floor((Math.min(e.x, e.box.x1) - m) / G) * G, y: snap(e.y), dir: 2 };
    case 'right':
      return { x: Math.ceil((Math.max(e.x, e.box.x2) + m) / G) * G, y: snap(e.y), dir: 0 };
    default:
      return { x: snap(e.x), y: snap(e.y), dir: -1 };
  }
}

export function routeAll(reqs: RouteReq[], obstacles: Rect[], W: number, H: number): Route[] {
  const cols = Math.ceil(W / G) + 1;
  const rows = Math.ceil(H / G) + 1;
  const N = cols * rows;
  const blocked = new Uint8Array(N);
  for (const r of obstacles) {
    const c1 = Math.max(0, Math.floor((r.x1 - 6) / G));
    const c2 = Math.min(cols - 1, Math.ceil((r.x2 + 6) / G));
    const r1 = Math.max(0, Math.floor((r.y1 - 6) / G));
    const r2 = Math.min(rows - 1, Math.ceil((r.y2 + 6) / G));
    for (let y = r1; y <= r2; y++) for (let x = c1; x <= c2; x++) blocked[y * cols + x] = 1;
  }
  // 已佈線：每個格點記下水平／垂直經過的節點
  const usedH = new Map<number, Set<string>>();
  const usedV = new Map<number, Set<string>>();
  const mark = (m: Map<number, Set<string>>, c: number, net: string) => {
    let s = m.get(c);
    if (!s) m.set(c, (s = new Set()));
    s.add(net);
  };
  const others = (m: Map<number, Set<string>>, c: number, net: string) => {
    const s = m.get(c);
    if (!s) return 0;
    return s.has(net) ? s.size - 1 : s.size;
  };

  const gScore = new Float64Array(N * 4);
  const from = new Int32Array(N * 4);
  const out: Route[] = [];

  // 手動走線先放上去，自動走線會盡量避開它們
  for (const req of reqs) {
    if (!req.manual) continue;
    const points = manualPath(req);
    const cells = rasterize(points, cols, rows);
    for (let i = 0; i < cells.length; i++) {
      const h = (o: number | undefined) => o !== undefined && ((o / cols) | 0) === ((cells[i] / cols) | 0);
      if (h(cells[i - 1]) || h(cells[i + 1])) mark(usedH, cells[i], req.net);
      else mark(usedV, cells[i], req.net);
    }
    out.push({ id: req.id, net: req.net, points, cells });
  }

  // 長的線先佈，短的線比較容易繞
  const order = reqs.filter((r) => !r.manual).sort((p, q) => Math.abs(q.a.x - q.b.x) + Math.abs(q.a.y - q.b.y) - (Math.abs(p.a.x - p.b.x) + Math.abs(p.a.y - p.b.y)));

  for (const req of order) {
    const ea = escape(req.a);
    const eb = escape(req.b);
    const clampC = (v: number, max: number) => Math.max(0, Math.min(max - 1, Math.round(v / G)));
    const sc = clampC(ea.x, cols) + clampC(ea.y, rows) * cols;
    const tc = clampC(eb.x, cols) + clampC(eb.y, rows) * cols;
    const tx = tc % cols;
    const ty = (tc / cols) | 0;
    const want = eb.dir < 0 ? -1 : (eb.dir + 2) % 4; // 抵達終點時的行進方向

    gScore.fill(Infinity);
    from.fill(-1);
    const heap = new Heap();
    const startDirs = ea.dir < 0 ? [0, 1, 2, 3] : [ea.dir];
    for (const d of startDirs) {
      gScore[sc * 4 + d] = 0;
      heap.push(0, sc * 4 + d);
    }
    let goal = -1;
    let steps = 0;
    while (heap.size && steps < 400000) {
      steps++;
      const st = heap.pop();
      const c = st >> 2;
      const d = st & 3;
      const gs = gScore[st];
      if (c === tc) {
        goal = st;
        break;
      }
      const cx = c % cols;
      const cy = (c / cols) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const nx = cx + DIRS[nd][0];
        const ny = cy + DIRS[nd][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (blocked[n] && n !== tc && n !== sc) continue;
        let cost = 1 + (nd !== d ? 5 : 0);
        const horiz = nd % 2 === 0;
        cost += 8 * others(horiz ? usedH : usedV, n, req.net) + 1 * others(horiz ? usedV : usedH, n, req.net);
        if (n === tc && want >= 0 && nd !== want) cost += 5;
        const ng = gs + cost;
        const ns = n * 4 + nd;
        if (ng < gScore[ns]) {
          gScore[ns] = ng;
          from[ns] = st;
          heap.push(ng + Math.abs(nx - tx) + Math.abs(ny - ty), ns);
        }
      }
    }

    let cells: number[] = [];
    if (goal >= 0) {
      for (let st = goal; st >= 0; st = from[st]) cells.push(st >> 2);
      cells.reverse();
      cells = cells.filter((c, i) => i === 0 || c !== cells[i - 1]);
    } else {
      // 找不到路時用 L 形直角線
      const sx = sc % cols;
      const sy = (sc / cols) | 0;
      for (let x = sx; x !== tx; x += Math.sign(tx - sx)) cells.push(sy * cols + x);
      for (let y = sy; y !== ty; y += Math.sign(ty - sy)) cells.push(y * cols + tx);
      cells.push(tc);
    }
    for (let i = 0; i < cells.length; i++) {
      const prev = cells[i - 1];
      const next = cells[i + 1];
      const h = (o: number | undefined) => o !== undefined && ((o / cols) | 0) === ((cells[i] / cols) | 0);
      if (h(prev) || h(next)) mark(usedH, cells[i], req.net);
      if ((prev !== undefined && !h(prev)) || (next !== undefined && !h(next))) mark(usedV, cells[i], req.net);
    }

    const pt = (c: number) => ({ x: (c % cols) * G, y: ((c / cols) | 0) * G });
    const raw = [
      { x: req.a.x, y: req.a.y },
      ...(req.a.side === 'top' || req.a.side === 'bottom' ? [{ x: req.a.x, y: ea.y }] : req.a.side === 'none' ? [] : [{ x: ea.x, y: req.a.y }]),
      ...cells.map(pt),
      ...(req.b.side === 'top' || req.b.side === 'bottom' ? [{ x: req.b.x, y: eb.y }] : req.b.side === 'none' ? [] : [{ x: eb.x, y: req.b.y }]),
      { x: req.b.x, y: req.b.y },
    ];
    out.push({ id: req.id, net: req.net, points: simplify(raw), cells });
  }
  return out;
}

type Pt = { x: number; y: number };

/** 手動走線：端子 → 轉折點 → 端子，不在同一水平／垂直線上的兩點之間補一個直角 */
export function manualPath(req: RouteReq): Pt[] {
  const pts: Pt[] = [{ x: req.a.x, y: req.a.y }];
  const vertSide = (s: Side) => s === 'top' || s === 'bottom';
  const all: Pt[] = [...(req.manual ?? []), { x: req.b.x, y: req.b.y }];
  all.forEach((q, i) => {
    const p = pts[pts.length - 1];
    if (Math.abs(p.x - q.x) > 0.01 && Math.abs(p.y - q.y) > 0.01) {
      const first = i === 0;
      const last = i === all.length - 1;
      // 離開端子先順著端子方向走；進入端子最後一段也順著端子方向
      if (first) pts.push(vertSide(req.a.side) ? { x: p.x, y: q.y } : { x: q.x, y: p.y });
      else if (last) pts.push(vertSide(req.b.side) ? { x: q.x, y: p.y } : { x: p.x, y: q.y });
      else pts.push({ x: q.x, y: p.y });
    }
    pts.push(q);
  });
  return simplify(pts);
}

/** 把落在格點上的水平／垂直線段轉成格點序列（計算分岔節點用） */
function rasterize(pts: Pt[], cols: number, rows: number): number[] {
  const cells: number[] = [];
  const on = (v: number) => Math.abs(v / G - Math.round(v / G)) < 0.01;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!(on(a.x) && on(a.y) && on(b.x) && on(b.y))) continue;
    const ax = Math.round(a.x / G);
    const ay = Math.round(a.y / G);
    const bx = Math.round(b.x / G);
    const by = Math.round(b.y / G);
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) {
      const x = ax + Math.sign(bx - ax) * k;
      const y = ay + Math.sign(by - ay) * k;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const c = y * cols + x;
      if (cells[cells.length - 1] !== c) cells.push(c);
    }
  }
  return cells;
}

/** 去掉重複點與一直線上的中間點 */
function simplify(pts: { x: number; y: number }[]) {
  const a = pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > 0.01 || Math.abs(p.y - pts[i - 1].y) > 0.01);
  const res: { x: number; y: number }[] = [];
  for (const p of a) {
    while (res.length >= 2) {
      const q = res[res.length - 1];
      const r = res[res.length - 2];
      const col = (Math.abs(r.x - q.x) < 0.01 && Math.abs(q.x - p.x) < 0.01) || (Math.abs(r.y - q.y) < 0.01 && Math.abs(q.y - p.y) < 0.01);
      if (!col) break;
      res.pop();
    }
    res.push(p);
  }
  return res;
}

/** 同一節點的線在格點上分岔（3 條以上相接）的位置 */
export function junctions(routes: Route[], W: number): { x: number; y: number; net: string }[] {
  const cols = Math.ceil(W / G) + 1;
  const byNet = new Map<string, Route[]>();
  for (const r of routes) {
    const l = byNet.get(r.net) ?? [];
    l.push(r);
    byNet.set(r.net, l);
  }
  const res: { x: number; y: number; net: string }[] = [];
  for (const [net, rs] of byNet) {
    if (rs.length < 2) continue;
    const edges = new Set<string>();
    const stubs = new Map<number, number>();
    for (const r of rs) {
      for (let i = 1; i < r.cells.length; i++) {
        const a = Math.min(r.cells[i - 1], r.cells[i]);
        const b = Math.max(r.cells[i - 1], r.cells[i]);
        if (b - a !== 1 && b - a !== cols) continue; // 手動線段之間的跳接不算
        edges.add(`${a},${b}`);
      }
      // 路徑頭尾與端子引出線相接
      for (const c of [r.cells[0], r.cells[r.cells.length - 1]]) stubs.set(c, 1);
    }
    const deg = new Map<number, number>();
    for (const e of edges) {
      const [a, b] = e.split(',').map(Number);
      deg.set(a, (deg.get(a) ?? 0) + 1);
      deg.set(b, (deg.get(b) ?? 0) + 1);
    }
    for (const [c, n] of deg) {
      if (n + (stubs.get(c) ?? 0) >= 3) res.push({ x: (c % cols) * G, y: ((c / cols) | 0) * G, net });
    }
  }
  return res;
}
