import type { DeviceInstance, Wire } from '../engine/types';
import type { Simulator } from '../engine/sim';
import { HostPanel } from './HostPanel';
import { RATING_OPTIONS } from '../engine/devices';
import { WIRE_COLORS, wireColor } from './wires';

interface Props {
  sim: Simulator;
  device: DeviceInstance | null;
  wire: Wire | null;
  changed: () => void;
  relayout: () => void;
  sendKeys: (id: string, keys: string) => void;
}

type FieldDef = {
  key: string;
  label: string;
  kind: 'number' | 'text' | 'bool' | 'select' | 'color';
  options?: [string, string][];
  step?: number;
  /** 改了會影響端子或外框，要重新佈線 */
  layout?: boolean;
  numeric?: boolean;
};

const GROUPS: FieldDef = {
  key: 'groups',
  label: '接點組數',
  kind: 'select',
  layout: true,
  numeric: true,
  options: [
    ['1', '1 組（1C）'],
    ['2', '2 組（2C，8 腳座）'],
    ['3', '3 組（3C）'],
    ['4', '4 組（4C，14 腳座）'],
  ],
};
const COIL: FieldDef = { key: 'coil', label: '線圈電壓', kind: 'select', options: RATING_OPTIONS };
const RATING: FieldDef = { key: 'rating', label: '額定電壓', kind: 'select', options: RATING_OPTIONS };

const FIELDS: Record<string, FieldDef[]> = {
  pushButton: [{ key: 'label', label: '按鈕文字', kind: 'text' }],
  power: [
    {
      key: 'kind',
      label: '輸出',
      kind: 'select',
      layout: true,
      options: [
        ['DC', 'DC 直流'],
        ['AC', 'AC 交流'],
      ],
    },
  ],
  toggleSwitch: [{ key: 'label', label: '名稱', kind: 'text' }],
  loopDetector: [
    { key: 'onDelay', label: '偵測延遲（秒）', kind: 'number', step: 0.1 },
    { key: 'offDelay', label: '離開延遲（秒）', kind: 'number', step: 0.1 },
    { key: 'passTime', label: '「通過」持續（秒）', kind: 'number', step: 0.5 },
  ],
  irSensor: [
    { key: 'onDelay', label: '遮斷延遲（秒）', kind: 'number', step: 0.1 },
    { key: 'offDelay', label: '恢復延遲（秒）', kind: 'number', step: 0.1 },
    { key: 'passTime', label: '「通過」持續（秒）', kind: 'number', step: 0.5 },
  ],
  cardReader: [{ key: 'hold', label: '吸持時間（秒）', kind: 'number', step: 0.1 }],
  remote: [
    { key: 'label', label: '名稱', kind: 'text' },
    { key: 'code', label: '內碼', kind: 'text' },
  ],
  gate: [
    {
      key: 'mode',
      label: '驅動方式',
      kind: 'select',
      options: [
        ['direct', '馬達直驅（上下通電才動）'],
        ['pulse', '柵欄機控制板（脈衝觸發）'],
      ],
    },
    { key: 'openTime', label: '開門時間（秒）', kind: 'number', step: 0.5 },
    { key: 'closeTime', label: '關門時間（秒）', kind: 'number', step: 0.5 },
    { key: 'armLength', label: '桿子長度', kind: 'number', step: 10, layout: true },
  ],
  lamp: [
    { key: 'label', label: '名稱', kind: 'text' },
    { key: 'color', label: '顏色', kind: 'color' },
    RATING,
  ],
  buzzer: [RATING],
  trafficLight: [RATING],
  relay: [
    GROUPS,
    COIL,
    { key: 'onDelay', label: '吸合延遲（秒）', kind: 'number', step: 0.01 },
    { key: 'offDelay', label: '釋放延遲（秒）', kind: 'number', step: 0.01 },
  ],
  timer: [
    {
      key: 'kind',
      label: '類型',
      kind: 'select',
      options: [
        ['TON', 'TON 通電延時'],
        ['TOF', 'TOF 斷電延時'],
        ['TP', 'TP 脈衝'],
      ],
    },
    { key: 'preset', label: '設定時間（秒）', kind: 'number', step: 0.5 },
    GROUPS,
    COIL,
  ],
};

const HELP: Record<string, string> = {
  gate: '上、停、下與「共」接通即動作（乾接點）。馬達直驅：接通期間門才會移動，適合搭配主機切「机」。脈衝觸發：柵欄機自帶控制板，收到脈衝後自己跑到極限。上限、下限是極限開關接點，到位時與「限共」接通。',
  power: '正極（L）與負極（N）分別接到負載兩端才會通電。上方的開關可切斷輸出。正負極直接接通會顯示短路。',
  relay: '端子依繼電器座編號：第 1 組 COM 9、NO 5、NC 1；第 4 組 COM 12、NO 8、NC 4；線圈 14(+)、13(−)。線圈兩端接到電源正負極、且電壓相符才會吸合。',
  timer: '計時繼電器（TDR）。TON：線圈通電後延時切換接點；TOF：線圈斷電後延時復歸；TP：通電後接點切換一段時間。端子編號同繼電器。',
  pushButton: '按住圖示上的按鈕：COM 與 NO 接通、與 NC 斷開；放開則相反。',
  toggleSwitch: '點一下切換 ON／OFF：ON 時 COM 與 NO 接通，OFF 時 COM 與 NC 接通。',
  cardReader: '刷有效卡時 RELAY 吸合一段時間：COM 與 NO 接通。感應卡機的 NO、COM 接主機 KEY 的白（上）與綠（共）。',
  lamp: '「+」與「COM」分別接到電源兩極（或經過接點）就會亮。額定電壓設「不限」時不檢查電壓。',
  node: '接線節點。把接線拖到另一條線上也會自動加節點。',
  remote: '遙控器不需接線，按鍵會以無線方式送給所有主機。主機要先用 1# 登錄才會反應。',
  irSensor: '點「遮斷」切換狀態，點「通過」模擬一台車經過（遮斷一段時間後自動恢復）。遮斷時 COM 與 NO 接通。',
  loopDetector: '點「有車」切換狀態，點「通過」模擬一台車經過。有車時 COM 與 NO 接通。',
};

export function Inspector({ sim, device, wire, changed, relayout, sendKeys }: Props) {
  if (wire) {
    const f = sim.devices.find((d) => d.id === wire.from.device);
    const t = sim.devices.find((d) => d.id === wire.to.device);
    const pl = (d: DeviceInstance | undefined, port: string) => (d ? sim.ports(d).find((p) => p.id === port)?.label ?? port : '?');
    return (
      <div className="inspector">
        <h2>接線</h2>
        <p>
          {f?.name}・{pl(f, wire.from.port)} ↔ {t?.name}・{pl(t, wire.to.port)}
        </p>
        <div className="field">
          <label>線色</label>
          <div className="swatches">
            {WIRE_COLORS.map(([c, n]) => (
              <button
                key={c}
                title={n}
                className={wireColor(sim, wire) === c ? 'swatch on' : 'swatch'}
                style={{ background: c }}
                onClick={() => {
                  wire.color = c;
                  changed();
                }}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <label>走線</label>
          {wire.points ? (
            <button
              onClick={() => {
                delete wire.points;
                relayout();
              }}
            >
              恢復自動走線
            </button>
          ) : (
            <span className="hint">自動</span>
          )}
        </div>
        <div className="hint" style={{ marginBottom: 8 }}>
          拖曳線上的小方塊可以移動那一段，路徑就改成手動。把另一條接線拖到這條線上，會在落點加一個節點並接在一起。
        </div>
        <button
          className="danger"
          onClick={() => {
            sim.removeWire(wire.id);
            sim.solve();
            relayout();
          }}
        >
          刪除接線（Delete）
        </button>
      </div>
    );
  }
  if (!device) {
    return (
      <div className="inspector">
        <h2>使用方式</h2>
        <div className="hint">
          <p>1. 從左側點選設備加入畫布，拖曳設備移動。在空白處按住左鍵拖出框框可以一次選取多個設備，拖曳其中任一個就會一起移動，按 Delete 一起刪除。選取設備後拖右下角的小方塊可調整大小。</p>
          <p>2. 從一個端子（圓點）拖到另一個端子接線，接線不分方向，會自動走直角線並避開設備。拖到另一條線上會加節點分岔。</p>
          <p>　想自己決定路徑：在端子上點一下（不拖），再到空白處一點一點點出轉折點，最後點目標端子。已經接好的線，選取後拖曳線上的小方塊就能移動那一段。節點可以從左側「配線」加入並拖到想要的位置。</p>
          <p>3. 負載（繼電器線圈、燈、喇叭）要接到電源的正負極才會動作；主機的 KEY、SENSOR 和柵欄機的上停下是乾接點，與共點接通就動作。</p>
          <p>4. 按上方「播放」開始模擬，直接在設備上按按鈕、刷卡、讓車通過、按遙控器。</p>
          <p>5. 點選全功能主機可用虛擬鍵盤或設定面板調整參數。</p>
          <p>6. 下方記錄每個接點的動作與主機嗶聲。</p>
          <p>帶電或接通的線路會以橘色光暈顯示。專案會自動存在這個瀏覽器，也可以「儲存」成檔案。</p>
        </div>
      </div>
    );
  }
  const d = device;
  const set = (key: string, v: unknown, layout = false) => {
    d.params[key] = v;
    if (d.type === 'power' && key === 'kind') d.params.volts = v === 'DC' ? 12 : 110;
    if (d.type === 'remote' && key === 'label') d.name = String(v);
    if (layout) {
      sim.pruneWires();
      relayout();
    }
    sim.solve();
    changed();
  };
  const scale = d.scale ?? 1;
  return (
    <div className="inspector">
      <h2>{sim.model(d).name}</h2>
      <div className="field">
        <label>名稱</label>
        <input
          type="text"
          value={d.name}
          onChange={(e) => {
            d.name = e.target.value;
            changed();
          }}
        />
      </div>
      {d.type !== 'node' && (
        <div className="field">
          <label>圖示大小</label>
          <span className="hint">
            {Math.round(scale * 100)}%（拖曳設備右下角的小方塊調整）
          </span>
        </div>
      )}
      {d.type !== 'node' && (
        <div className="field">
          <span />
          <button
            onClick={() => {
              for (const o of sim.devices) if (o.type !== 'node') o.scale = scale;
              relayout();
            }}
          >
            全部設備套用此大小
          </button>
        </div>
      )}
      {d.type === 'power' && (
        <div className="field">
          <label>電壓（V）</label>
          <span style={{ display: 'flex', gap: 4 }}>
            <select
              value={(d.params.kind === 'DC' ? [5, 12, 24, 48] : [24, 110, 220]).includes(d.params.volts) ? d.params.volts : 'custom'}
              onChange={(e) => e.target.value !== 'custom' && set('volts', Number(e.target.value))}
            >
              {(d.params.kind === 'DC' ? [5, 12, 24, 48] : [24, 110, 220]).map((v) => (
                <option key={v} value={v}>
                  {d.params.kind} {v}V
                </option>
              ))}
              <option value="custom">自訂</option>
            </select>
            <input type="number" min={0} step={0.5} value={d.params.volts} onChange={(e) => set('volts', Math.max(0, Number(e.target.value)))} />
          </span>
        </div>
      )}
      {(FIELDS[d.type] ?? []).map((f) => (
        <div className="field" key={f.key}>
          <label>{f.label}</label>
          {f.kind === 'bool' ? (
            <input type="checkbox" checked={!!d.params[f.key]} onChange={(e) => set(f.key, e.target.checked)} />
          ) : f.kind === 'select' ? (
            <select value={String(d.params[f.key])} onChange={(e) => set(f.key, f.numeric ? Number(e.target.value) : e.target.value, f.layout)}>
              {f.options!.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : f.kind === 'number' ? (
            <input type="number" step={f.step} min={0} value={d.params[f.key]} onChange={(e) => set(f.key, Math.max(0, Number(e.target.value)), f.layout)} />
          ) : f.kind === 'color' ? (
            <input type="color" value={d.params[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          ) : (
            <input type="text" value={d.params[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          )}
        </div>
      ))}
      {HELP[d.type] && <div className="hint">{HELP[d.type]}</div>}
      {d.type === 'cvia92' && (
        <HostPanel d={d} sendKeys={(k) => sendKeys(d.id, k)} remotes={sim.devices.filter((x) => x.type === 'remote')} />
      )}
      <h3>設備</h3>
      <button
        className="danger"
        onClick={() => {
          sim.removeDevice(d.id);
          sim.solve();
          relayout();
        }}
      >
        刪除此設備（Delete）
      </button>
    </div>
  );
}
