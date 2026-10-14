import type { DeviceInstance } from '../engine/types';
import type { HostState } from '../engine/host';
import { GATE_IMG, gateGeom, HOST_IMG, SOCKET } from './layout';
import hostImg from './assets/host.webp';
import gateImg from './assets/gate.webp';

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

/** 全功能主機：使用者提供的主機圖，顯示窗寫主機目前的狀態，四顆燈依狀態亮起 */
function HostImage({ d }: { d: DeviceInstance }) {
  const hs = d.state as HostState;
  const p = d.params;
  const { w, h, win, ledX, ledY, ledR } = HOST_IMG;
  const cx = (win.x1 + win.x2) / 2;
  const timer =
    hs.trafficT > 0
      ? `紅綠燈${hs.motion === 'down' ? '下' : '上'} 剩 ${Math.ceil(hs.trafficT)} 秒`
      : hs.autoCloseT !== null
      ? `自動關門倒數 ${Math.ceil(hs.autoCloseT)} 秒`
      : hs.stage2T !== null
        ? `二段關門 ${hs.stage2T.toFixed(1)} 秒`
        : hs.irResume
          ? '等待紅外線解除'
          : hs.holdOpen
            ? '分段定時保持開門'
            : `${p.motorSwitch === 'electronic' ? '電' : '机'}・行程 ${p.travel8}s・自動降 ${p.autoClose7}s`;
  const leds = [
    { on: !hs.cut, c: '#ff4d4d', t: '電源' },
    { on: hs.motion === 'up', c: '#4dff88', t: '上' },
    { on: hs.motion === 'down', c: '#4dff88', t: '下' },
    { on: hs.out.RELAY, c: '#ffb347', t: 'RELAY' },
  ];
  const typing = hs.keypad.buf !== '' || !!hs.keypad.session;
  return (
    <>
      <image href={hostImg} width={w} height={h} preserveAspectRatio="none" />
      <text x={cx} y={win.y1 + 40} textAnchor="middle" className="host-lcd" style={{ fontSize: 28, fontWeight: 700 }}>
        {hs.status}
      </text>
      <text x={cx} y={win.y1 + 64} textAnchor="middle" className="host-lcd" style={{ fontSize: 15 }}>
        {typing ? `設定 ${hs.keypad.buf.replace(/\*/g, '米')}` : timer}
      </text>
      {leds.map((l, i) => (
        <circle key={i} cx={ledX[i]} cy={ledY} r={ledR} fill={l.on ? l.c : '#c8cacb'}>
          <title>{l.t}</title>
        </circle>
      ))}
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
      // 柵欄桿：軸心在機箱上方的圓圈，畫在機箱後面；關（0%）水平向右，開（100%）垂直向上
      const { armW, pivotX, imgW, imgH } = GATE_IMG;
      const { arm, top, pivotY } = gateGeom(p.armLength);
      const ang = -s.pos * 90;
      return (
        <>
          <g transform={`rotate(${ang} ${pivotX} ${pivotY})`}>
            <rect x={pivotX} y={pivotY - armW / 2} width={arm} height={armW} rx={2} fill="#fff" stroke="#c8cacb" />
            {[0.25, 0.5, 0.75].map((f) => (
              <rect key={f} x={pivotX + arm * f - arm * 0.07} y={pivotY - armW / 2} width={arm * 0.14} height={armW} fill="#e5222b" />
            ))}
          </g>
          <image href={gateImg} x={0} y={top} width={imgW} height={imgH} preserveAspectRatio="none" />
          <text className="svg-muted" x={imgW + 6} y={pivotY + 30}>
            {p.mode === 'pulse' ? '控制板（脈衝）' : '馬達直驅'}
          </text>
          <text className="svg-muted" x={imgW + 6} y={pivotY + 44}>
            開度 {Math.round(s.pos * 100)}% {s.motion === 'up' ? '上升' : s.motion === 'down' ? '下降' : ''}
          </text>
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
      return <HostImage d={d} />;
  }
  return null;
}
