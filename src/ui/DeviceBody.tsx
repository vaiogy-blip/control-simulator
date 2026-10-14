import type { DeviceInstance } from '../engine/types';
import { paramSummary, type HostState } from '../engine/host';
import { SOCKET } from './layout';

interface Props {
  d: DeviceInstance;
  w: number;
  h: number;
  act: (action: string, value?: unknown) => void;
  /** 有電但電壓不符 */
  mismatch?: boolean;
  /** 電源短路 */
  short?: boolean;
}

function SvgButton(props: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  active?: boolean;
  round?: boolean;
  onDown?: () => void;
  onUp?: () => void;
  onClick?: () => void;
}) {
  const { x, y, w, h, label, active, round } = props;
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  return (
    <g
      className={`svg-btn${active ? ' active' : ''}`}
      onPointerDown={(e) => {
        stop(e);
        try {
          (e.target as Element).setPointerCapture?.(e.pointerId);
        } catch {
          /* 合成事件沒有 pointer 可擷取 */
        }
        props.onDown?.();
      }}
      onPointerUp={(e) => {
        stop(e);
        props.onUp?.();
        props.onClick?.();
      }}
      onPointerCancel={() => props.onUp?.()}
    >
      {round ? <circle cx={x + w / 2} cy={y + h / 2} r={w / 2} /> : <rect x={x} y={y} width={w} height={h} rx={5} />}
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

const Frame = ({ w, h }: { w: number; h: number }) => <rect className="dev-body" width={w} height={h} rx={6} />;

/** 主機外框：依接線圖上的柵欄機主機外形（上方微外擴、下方大圓弧） */
function hostOutline(w: number, h: number) {
  const x1 = 24;
  const x2 = w - 24;
  const mid = h * 0.42;
  return [
    `M ${x1 + 14},6`,
    `H ${x2 - 14}`,
    `Q ${x2 + 2},6 ${x2},22`,
    `C ${x2 - 2},${mid * 0.6} ${x2 - 10},${mid * 0.8} ${x2 - 6},${mid}`,
    `C ${x2 + 16},${h * 0.62} ${x2 + 10},${h * 0.86} ${x2 - 40},${h - 8}`,
    `Q ${w / 2},${h + 6} ${x1 + 40},${h - 8}`,
    `C ${x1 - 10},${h * 0.86} ${x1 - 16},${h * 0.62} ${x1 + 6},${mid}`,
    `C ${x1 + 10},${mid * 0.8} ${x1 + 2},${mid * 0.6} ${x1},22`,
    `Q ${x1 - 2},6 ${x1 + 14},6`,
    'Z',
  ].join(' ');
}

function HostDiagram({ d, w, h }: { d: DeviceInstance; w: number; h: number }) {
  const hs = d.state as HostState;
  const p = d.params;
  const bodyH = h - 60;
  const cx = w / 2;
  const params = paramSummary(p);
  const shown = params.slice(0, 12);
  const timer =
    hs.autoCloseT !== null
      ? `自動關門倒數 ${Math.ceil(hs.autoCloseT)} 秒`
      : hs.stage2T !== null
        ? `二段關門 ${hs.stage2T.toFixed(1)} 秒`
        : hs.irResume
          ? '等待紅外線解除'
          : hs.holdOpen
            ? '分段定時保持開門'
            : `${p.motorSwitch === 'electronic' ? '電' : '机'}・行程 ${p.travel8}s・自動降 ${p.autoClose7}s`;
  const leds = [
    { on: !hs.cut, c: '#e03131', t: '電源' },
    { on: hs.motion === 'up', c: '#2f9e44', t: '上' },
    { on: hs.motion === 'down', c: '#2f9e44', t: '下' },
    { on: hs.out.RELAY, c: '#f08c00', t: 'RELAY' },
    { on: hs.keypad.buf !== '' || !!hs.keypad.session, c: '#fab005', t: '設定中' },
  ];
  return (
    <>
      <path d={hostOutline(w, bodyH)} className="diagram-shape" />
      <rect x={70} y={26} width={w - 140} height={78} rx={14} className="diagram-shape" />
      <text x={cx} y={56} textAnchor="middle" className="diagram-text" style={{ fontSize: 20 }}>
        全功能主機
      </text>
      <text x={cx} y={80} textAnchor="middle" className="diagram-text" style={{ fontSize: 14, fontFamily: 'ui-monospace, Consolas, monospace' }}>
        {hs.status}
        {hs.keypad.buf ? ` ${hs.keypad.buf.replace(/\*/g, '米')}` : ''}
      </text>
      <text x={cx} y={97} textAnchor="middle" className="diagram-muted">
        {timer}
      </text>
      {leds.map((l, i) => (
        <g key={i}>
          <circle cx={cx - 64 + i * 32} cy={122} r={6} fill={l.on ? l.c : 'none'} stroke="currentColor" className="diagram-led" />
          <text x={cx - 64 + i * 32} y={140} textAnchor="middle" className="diagram-muted" style={{ fontSize: 9 }}>
            {l.t}
          </text>
        </g>
      ))}
      <rect x={78} y={152} width={w - 156} height={bodyH - 200} rx={14} className="diagram-shape" />
      {shown.length === 0 && (
        <text x={cx} y={180} textAnchor="middle" className="diagram-muted">
          出廠預設
        </text>
      )}
      {shown.map((c, i) => (
        <text
          key={i}
          x={shown.length > 6 ? (i < Math.ceil(shown.length / 2) ? 100 : cx + 8) : cx - 40}
          y={176 + (shown.length > 6 ? i % Math.ceil(shown.length / 2) : i) * 17}
          className="diagram-text"
          style={{ fontSize: 13, fontFamily: 'ui-monospace, Consolas, monospace' }}
        >
          {c}
        </text>
      ))}
      {params.length > shown.length && (
        <text x={cx} y={bodyH - 54} textAnchor="middle" className="diagram-muted">
          …另 {params.length - shown.length} 項
        </text>
      )}
    </>
  );
}

function HostPhoto({ d, w, h }: { d: DeviceInstance; w: number; h: number }) {
  // 外觀依照片：黑色機殼、藍色面板，下半部收成大圓弧底
  const hs = d.state as HostState;
  const p = d.params;
  const bw = 164;
  const ox = (w - bw) / 2;
  const oy = 4;
  const bh = h - 68;
  const r = bw / 2;
  const shell = [
    `M ${ox + 14},${oy}`,
    `H ${ox + bw - 14}`,
    `Q ${ox + bw - 4},${oy} ${ox + bw - 3},${oy + 10}`,
    `L ${ox + bw},${oy + 96}`,
    `C ${ox + bw},${oy + 108} ${ox + bw - 7},${oy + 110} ${ox + bw - 7},${oy + 122}`,
    `L ${ox + bw - 7},${oy + bh - r + 14}`,
    `A ${r - 7},${r - 14} 0 0 1 ${ox + 7},${oy + bh - r + 14}`,
    `L ${ox + 7},${oy + 122}`,
    `C ${ox + 7},${oy + 110} ${ox},${oy + 108} ${ox},${oy + 96}`,
    `L ${ox + 3},${oy + 10}`,
    `Q ${ox + 4},${oy} ${ox + 14},${oy}`,
    'Z',
  ].join(' ');
  const leds = [
    { on: !hs.cut, c: '#ff4d4d' },
    { on: hs.motion === 'up', c: '#4dff88' },
    { on: hs.motion === 'down', c: '#4dff88' },
    { on: hs.keypad.buf !== '' || !!hs.keypad.session, c: '#ffd84d' },
  ];
  const cx = ox + bw / 2;
  const timer =
    hs.autoCloseT !== null
      ? `自動關門 ${Math.ceil(hs.autoCloseT)}s`
      : hs.stage2T !== null
        ? `二段關門 ${hs.stage2T.toFixed(1)}s`
        : `${p.motorSwitch === 'electronic' ? '電' : '机'}・行程 ${p.travel8}s`;
  return (
    <>
      <path d={shell} fill="#1c1c1e" stroke="#000" />
      <rect x={ox + 18} y={oy + 12} width={bw - 36} height={40} rx={6} fill="#1d2f9e" stroke="#c9d2ff" />
      <text x={cx} y={oy + 38} textAnchor="middle" fill="#fff" style={{ fontSize: 15, fontWeight: 800, fontStyle: 'italic' }}>
        全功能主機
      </text>
      {leds.map((l, i) => (
        <circle key={i} cx={ox + 34 + i * 32} cy={oy + 72} r={4.5} fill={l.on ? l.c : '#0b0b0c'} stroke="#555" />
      ))}
      <rect x={ox + 16} y={oy + 92} width={bw - 32} height={88} rx={8} fill="#1d2f9e" />
      <text x={cx} y={oy + 117} textAnchor="middle" fill="#fff" style={{ fontSize: 15, fontWeight: 800 }}>
        全功能無線
      </text>
      <text x={cx} y={oy + 135} textAnchor="middle" fill="#ffd400" style={{ fontSize: 10, fontWeight: 700 }}>
        車道門禁管制系統
      </text>
      <rect x={ox + 19} y={oy + 150} width={bw - 38} height={18} rx={2} fill="#ffd400" />
      <text x={cx} y={oy + 162.5} textAnchor="middle" fill="#111" style={{ fontSize: 7.5, fontWeight: 700 }}>
        緊急求救 防盜保全 自動控制 門禁連線
      </text>
      <text x={cx} y={oy + 200} textAnchor="middle" fill="#7dffa6" style={{ fontSize: 12, fontFamily: 'monospace' }}>
        {hs.status}
        {hs.keypad.buf ? ` ${hs.keypad.buf.replace(/\*/g, '米')}` : ''}
      </text>
      <text x={cx} y={oy + 216} textAnchor="middle" fill="#9aa3b2" style={{ fontSize: 9, fontFamily: 'monospace' }}>
        {timer}
      </text>
    </>
  );
}

/** 繼電器座：黑色底座、中間白色標籤（名稱與線圈電壓） */
function Socket({ d, w, h, mismatch }: { d: DeviceInstance; w: number; h: number; mismatch?: boolean }) {
  const p = d.params;
  const s = d.state;
  const coilOn = d.type === 'relay' ? s.d.out : s.coil;
  const contactOn = d.type === 'relay' ? s.d.out : s.out;
  const coil = p.coil === 'any' ? '' : String(p.coil).replace(/^(DC|AC)/, '$1 ') + 'V';
  // 標籤只寫名稱最後一段（例如「繼電器 R1」寫 R1）
  const name = (d.name.trim().split(/\s+/).pop() ?? '').slice(0, 5);
  return (
    <>
      <rect width={w} height={h} rx={3} className="socket" />
      {[1, 2, 3].map((i) => (
        <line key={i} x1={3 + i * SOCKET.cell} x2={3 + i * SOCKET.cell} y1={2} y2={SOCKET.labelTop - 4} className="socket-line" />
      ))}
      <rect x={8} y={SOCKET.labelTop} width={w - 16} height={SOCKET.labelBottom - SOCKET.labelTop} className={`socket-label${coilOn ? ' on' : ''}`} />
      <text x={w / 2} y={d.type === 'timer' ? 86 : 100} textAnchor="middle" className="socket-name" style={{ fontSize: name.length > 2 ? 16 : 26 }}>
        {d.type === 'timer' ? 'TDR' : name}
      </text>
      {d.type === 'timer' && (
        <>
          <text x={w / 2} y={106} textAnchor="middle" className="socket-small">
            {p.kind} {p.preset}s
          </text>
          <text x={w / 2} y={120} textAnchor="middle" className="socket-small">
            {Math.min(s.acc, p.preset).toFixed(1)}s
          </text>
        </>
      )}
      <text x={w - 10} y={SOCKET.labelBottom - 4} textAnchor="end" className="socket-small" style={mismatch ? { fill: '#e03131', fontWeight: 700 } : undefined}>
        {mismatch ? '電壓不符' : coil}
      </text>
      <text x={12} y={SOCKET.labelTop + 12} className="socket-small">
        {contactOn ? '吸合' : ''}
      </text>
    </>
  );
}

export function DeviceBody({ d, w, h, act, mismatch, short }: Props) {
  const s = d.state;
  const p = d.params;
  const cx = w / 2;
  switch (d.type) {
    case 'pushButton':
      return (
        <>
          <Frame w={w} h={h} />
          <SvgButton
            x={cx - 20}
            y={24}
            w={40}
            h={40}
            round
            label={p.label}
            active={s.pressed}
            onDown={() => act('press')}
            onUp={() => act('release')}
          />
        </>
      );
    case 'toggleSwitch':
      return (
        <>
          <Frame w={w} h={h} />
          <g
            className="svg-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              act('toggle');
            }}
          >
            <rect x={cx - 26} y={30} width={52} height={26} rx={13} className={s.on ? 'toggle on' : 'toggle'} />
            <circle cx={s.on ? cx + 13 : cx - 13} cy={43} r={10} className="toggle-knob" />
          </g>
          <text className="svg-muted" x={cx} y={h - 6} textAnchor="middle">
            {p.label} {s.on ? 'ON' : 'OFF'}
          </text>
        </>
      );
    case 'loopDetector':
    case 'irSensor':
      return (
        <>
          <Frame w={w} h={h} />
          <SvgButton x={12} y={28} w={58} h={26} label={d.type === 'irSensor' ? '遮斷' : '有車'} active={s.present} onClick={() => act('toggle')} />
          <SvgButton x={76} y={28} w={52} h={26} label="通過" onClick={() => act('pass')} />
          <text className="svg-muted" x={12} y={h - 10}>
            {s.passT > 0 ? `通過中 ${s.passT.toFixed(1)}s` : s.d.out ? '偵測中' : '無'}
          </text>
        </>
      );
    case 'cardReader':
      return (
        <>
          <Frame w={w} h={h} />
          <SvgButton x={cx - 36} y={28} w={72} h={28} label="刷有效卡" active={s.t > 0} onClick={() => act('swipe')} />
          <text className="svg-muted" x={cx} y={h - 6} textAnchor="middle">
            RELAY 吸持 {p.hold}s
          </text>
        </>
      );
    case 'remote': {
      // 直立式：深藍外殼、銀色邊框；左側由上而下 ▲■▼F，右側單獨 S 鍵，鑰匙圈在下方
      const bx = (w - 104) / 2;
      const by = 4;
      const bh = h - 28;
      const left = ['▲', '■', '▼', 'F'];
      return (
        <>
          <circle cx={w / 2} cy={by + bh + 10} r={9} fill="none" stroke="#b9bec6" strokeWidth={3} />
          <rect x={bx} y={by} width={104} height={bh} rx={20} fill="#c3c8cf" />
          <rect x={bx + 5} y={by + 5} width={94} height={bh - 10} rx={16} fill="#1f2d6b" />
          <rect x={bx + 12} y={by + 14} width={36} height={bh - 28} rx={6} fill="#18245a" />
          {left.map((l, i) => (
            <SvgButton
              key={i}
              x={bx + 16}
              y={by + 20 + i * 38}
              w={28}
              h={28}
              label={l}
              active={s.held.includes(i + 1)}
              onDown={() => act('keyDown', i + 1)}
              onUp={() => act('keyUp', i + 1)}
            />
          ))}
          <rect x={bx + 58} y={by + 14} width={32} height={74} rx={6} fill="#d7dbe0" />
          <SvgButton x={bx + 60} y={by + 20} w={28} h={28} label="S" active={s.held.includes(5)} onDown={() => act('keyDown', 5)} onUp={() => act('keyUp', 5)} />
          <ellipse cx={bx + 74} cy={by + bh - 40} rx={12} ry={20} fill="#26357c" />
        </>
      );
    }
    case 'power': {
      const label = `${p.kind} ${p.volts}V`;
      return (
        <>
          <defs>
            <pattern id={`mesh-${d.id}`} width={9} height={8} patternUnits="userSpaceOnUse">
              <circle cx={4.5} cy={4} r={3} className="mesh" />
            </pattern>
          </defs>
          <rect width={w} height={h} rx={3} className="psu" />
          <rect x={6} y={6} width={w - 12} height={h - 40} fill={`url(#mesh-${d.id})`} />
          <rect x={0} y={h - 28} width={w} height={28} className="psu-strip" />
          <text x={10} y={h - 9} className="psu-strip-text">
            {label}
          </text>
          <g
            className="svg-btn"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              act('toggle');
            }}
          >
            <rect x={w - 52} y={12} width={40} height={20} rx={10} className={s.on ? 'toggle on' : 'toggle'} />
            <circle cx={s.on ? w - 22 : w - 42} cy={22} r={8} className="toggle-knob" />
          </g>
          {short && (
            <text x={w / 2} y={h / 2} textAnchor="middle" className="warn-text">
              短路！
            </text>
          )}
        </>
      );
    }
    case 'gate': {
      const pivotX = 46;
      const pivotY = h - 46;
      const len = w - 80;
      const ang = -s.pos * 80;
      return (
        <>
          <Frame w={w} h={h} />
          <clipPath id={`clip-${d.id}`}>
            <rect x={2} y={2} width={w - 4} height={h - 30} />
          </clipPath>
          <g clipPath={`url(#clip-${d.id})`}>
            <g transform={`rotate(${ang} ${pivotX} ${pivotY})`}>
              <rect x={pivotX} y={pivotY - 4} width={len} height={8} rx={3} fill="#e74c3c" />
              {[0.2, 0.5, 0.8].map((f) => (
                <rect key={f} x={pivotX + len * f} y={pivotY - 4} width={len * 0.12} height={8} fill="#fff" />
              ))}
            </g>
          </g>
          <rect x={pivotX - 16} y={pivotY - 10} width={28} height={30} rx={3} fill="var(--muted)" />
          <text className="svg-muted" x={w - 10} y={20} textAnchor="end">
            {p.mode === 'pulse' ? '控制板（脈衝）' : '馬達直驅'}・開度 {Math.round(s.pos * 100)}% {s.motion === 'up' ? '上升' : s.motion === 'down' ? '下降' : ''}
          </text>
          <line x1={4} x2={w - 4} y1={h - 26} y2={h - 26} className="socket-line" />
        </>
      );
    }
    case 'lamp':
      return (
        <>
          <path d={`M ${cx - 24},52 v -14 a 24 24 0 0 1 48 0 v 14 z`} fill={s.on ? p.color : 'var(--panel-2)'} stroke="var(--border)" />
          {s.on && <circle cx={cx} cy={36} r={32} fill={p.color} opacity={0.2} />}
          <rect x={cx - 24} y={52} width={48} height={22} fill="#e9e6d6" stroke="var(--border)" />
          <text className="svg-muted" x={cx} y={67} textAnchor="middle" style={{ fill: '#555' }}>
            {mismatch ? '電壓不符' : p.label}
          </text>
        </>
      );
    case 'trafficLight':
      return (
        <>
          <rect x={cx - 20} y={4} width={40} height={78} rx={8} fill="#222" />
          <circle cx={cx} cy={24} r={13} fill={s.r ? '#ff3b30' : '#4a1d1b'} />
          <circle cx={cx} cy={62} r={13} fill={s.g ? '#2ecc71' : '#173a26'} />
          {mismatch && (
            <text x={cx} y={98} textAnchor="middle" className="warn-text" style={{ fontSize: 11 }}>
              電壓不符
            </text>
          )}
        </>
      );
    case 'buzzer':
      return (
        <>
          <Frame w={w} h={h - 26} />
          <text className="svg-text" x={cx} y={36} textAnchor="middle" style={{ fontSize: 20 }}>
            {s.on ? '🔊' : '🔈'}
          </text>
          <text className="svg-muted" x={cx} y={52} textAnchor="middle">
            {mismatch ? '電壓不符' : s.on ? '鳴' : ''}
          </text>
        </>
      );
    case 'relay':
    case 'timer':
      return <Socket d={d} w={w} h={h} mismatch={mismatch} />;
    case 'cvia92':
      return p.look === 'photo' ? <HostPhoto d={d} w={w} h={h} /> : <HostDiagram d={d} w={w} h={h} />;
  }
  return null;
}
