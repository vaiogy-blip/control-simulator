import { useEffect, useState } from 'react';
import type { DeviceInstance } from '../engine/types';
import { KEY_CODES, keyMap, type HostParams, type HostState } from '../engine/host';

const AREAS = ['序號 0~1000', '序號 1001~2000', '序號 2001~2950', '外部押扣 白黃紅'];
const KEY_NAMES = ['▲', '■', '▼', 'F', 'S'];

interface Props {
  d: DeviceInstance;
  sendKeys: (keys: string) => void;
  remotes: DeviceInstance[];
}

const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

const show = (cmd: string) => cmd.replace(/\*/g, '米');

const FLAGS11: { label: string; on: number; off: number; get: (p: HostParams) => boolean }[] = [
  { label: '上下裝反', on: 4, off: 5, get: (p) => p.o11.reversed },
  { label: '主機聲響指示', on: 6, off: 7, get: (p) => p.o11.beep },
  { label: 'KEY 外部押扣 2A1B（紅＝停為常閉）', on: 22, off: 12, get: (p) => p.o11.extBtn && p.o11.extMode === '2A1B' },
  { label: 'KEY 外部押扣 3A（全部常開）', on: 21, off: 12, get: (p) => p.o11.extBtn && p.o11.extMode === '3A' },
  { label: '警報與 RELAY 同步', on: 15, off: 16, get: (p) => p.o11.alarmRelaySync },
  { label: 'SM 輸入改為上停下單鍵循環', on: 17, off: 18, get: (p) => p.o11.smokeCycle },
  { label: '斷電復電與 RELAY 同步', on: 19, off: 20, get: (p) => p.o11.cutRelaySync },
  { label: '遙控器上與 RELAY 同步', on: 23, off: 24, get: (p) => p.o11.upRelaySync },
  { label: '紅外線與 RELAY 同步', on: 25, off: 26, get: (p) => p.o11.irRelaySync },
  { label: '紅綠燈控制器（門全開時 RELAY 吸合）', on: 27, off: 28, get: (p) => p.o11.traffic },
];

const FLAGS13: { label: string; on: number; off: number; get: (p: HostParams) => boolean }[] = [
  { label: '2 秒馬達保護（換向等待）', on: 1, off: 0, get: (p) => p.m13.protect },
  { label: '防空轉保護（5 秒）※未模擬', on: 2, off: 3, get: (p) => p.m13.antiIdle },
  { label: '上下互動式 ※未模擬', on: 4, off: 5, get: (p) => p.m13.interlock },
];

const IR12: Record<number, string> = {
  1: '下停',
  2: '停彈升',
  3: '二段式關門及防跟車',
  4: '上停、下停',
  5: '下降中按上直接反轉',
  6: '停或上回復第一段自動關門',
  7: '遮斷時停，移除後依 18# 秒數繼續',
};

const WARN17: Record<number, string> = {
  11: '開門時動作',
  12: '關門時動作',
  13: '門開著就亮，關到底熄',
  14: '自動關門前提前亮（15# 秒）',
  15: '上停下動作時亮 15# 秒',
};

function NumSetting(props: { label: string; cmd: number; value: number; max: number; send: (k: string) => void; unit?: string }) {
  const [v, setV] = useState(String(props.value));
  useEffect(() => setV(String(props.value)), [props.value]);
  const command = `${props.cmd}#${v}*`;
  return (
    <div className="setting-row">
      <span className="name">
        {props.cmd}# {props.label}
        <div className="cmd">
          目前 {props.value}
          {props.unit ?? ' 秒'}・{show(command)}
        </div>
      </span>
      <input type="number" min={0} max={props.max} value={v} onChange={(e) => setV(e.target.value)} />
      <button onClick={() => props.send(command)}>設定</button>
    </div>
  );
}

export function HostPanel({ d, sendKeys, remotes }: Props) {
  const p = d.params as HostParams;
  const s = d.state as HostState;
  const [learnSerial, setLearnSerial] = useState('1');
  const [area, setArea] = useState(0);
  const [keys25, setKeys25] = useState(() => keyMap(p, 0));
  const [cut9, setCut9] = useState({ sec: String(p.autoCut9.sec), mode: String(p.autoCut9.mode || 3) });

  const setList = (cmd: number, clear: number, list: number[], code: number, on: boolean) => {
    if (on) return sendKeys(`${cmd}#${code}*`);
    const rest = list.filter((x) => x !== code);
    sendKeys([`${cmd}#${clear}*`, ...rest.map((x) => `${cmd}#${x}*`)].join(''));
  };

  return (
    <>
      <h3>主機板切換開關</h3>
      <div className="field">
        <label>馬達控制</label>
        <select
          value={p.motorSwitch}
          onChange={(e) => {
            p.motorSwitch = e.target.value as HostParams['motorSwitch'];
            sendKeys('');
          }}
        >
          <option value="traditional">机：傳統門（直接驅動馬達）</option>
          <option value="electronic">電：快速門／電子式馬達（送脈衝）</option>
        </select>
      </div>
      <div className="hint">
        机：上、下繼電器通電 8# 行程秒數（8# 為 0 時通電到按停）。電：上停下只吸合 14# 秒數，柵欄機請選「脈衝觸發」。
      </div>

      <h3>主機面板</h3>
      <div className="lcd">
        {s.status}
        {s.keypad.session ? '｜設定中' : ''}｜{s.keypad.buf.replace(/\*/g, '米') || ' '}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div className="keypad">
          {KEYPAD.map((k) => (
            <button key={k} onClick={() => sendKeys(k)}>
              {k === '*' ? '米' : k}
            </button>
          ))}
        </div>
        <div className="hint" style={{ flex: 1 }}>
          照實機操作輸入，格式為「功能#設定值米」，不需密碼，例如 7#10米、11#11米。
          <br />
          嗶長音＝設定成功
          <br />
          嗶一聲＝完成
          <br />
          嗶三聲＝錯誤
          <br />
          8 秒未按連嗶 5 聲離開
          <br />
          外部接點、紅外線動作各嗶一聲；自動關門最後 5 秒每秒嗶一聲
        </div>
      </div>
      <div className="beeps" style={{ marginTop: 8 }}>
        {s.beeps.length === 0 && <div className="hint">尚無嗶聲紀錄</div>}
        {[...s.beeps].reverse().map((b, i) => (
          <div key={i} className={b.kind === '3' || b.kind === '5' ? 'beep-bad' : 'beep-ok'}>
            {b.t.toFixed(1)}s {b.kind === 'long' ? '嗶～' : b.kind === 'long2' ? '嗶～嗶嗶' : `嗶×${b.kind}`} {b.msg}
          </div>
        ))}
      </div>

      <h3>遙控器</h3>
      <table className="small">
        <thead>
          <tr>
            <th>序號</th>
            <th>遙控器</th>
            <th>狀態</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {p.remotes.map((r) => {
            const dev = remotes.find((x) => x.params.code === r.code);
            return (
              <tr key={r.code}>
                <td>{r.serial}</td>
                <td>{dev?.name ?? r.code}</td>
                <td>{r.suspended ? '暫刪' : '正常'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button onClick={() => sendKeys(`${r.suspended ? 4 : 3}#${r.serial}**`)}>{r.suspended ? '恢復' : '暫刪'}</button>{' '}
                  <button className="danger" onClick={() => sendKeys(`2#${r.serial}**`)}>
                    刪除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="setting-row" style={{ marginTop: 6 }}>
        <span className="name">
          1# 新增遙控器
          <div className="cmd">{show(`1#${learnSerial}*`)} 後按遙控器任一鍵，再按米結束</div>
        </span>
        <input type="number" value={learnSerial} onChange={(e) => setLearnSerial(e.target.value)} />
        <button onClick={() => sendKeys(`1#${learnSerial}*`)}>開始</button>
      </div>
      {remotes.length === 0 && <div className="hint">畫布上還沒有遙控器，可從左側加入。</div>}

      <h3>25# 按鍵功能</h3>
      <div className="hint" style={{ marginBottom: 6 }}>
        遙控器五鍵（▲■▼F 與 S）和外部押扣的功能都由 25# 定義。未設定的區段照預設：▲上、■停、▼下、F 斷電、S 不使用。
      </div>
      <table className="small" style={{ marginBottom: 8 }}>
        <thead>
          <tr>
            <th>區碼</th>
            <th>目前設定</th>
          </tr>
        </thead>
        <tbody>
          {AREAS.map((label, i) => {
            const codes = i === 3 ? (p.custom25[3] ? keyMap(p, 3).slice(0, 3) : ['01', '02', '03']) : keyMap(p, i);
            const names = i === 3 ? ['白', '黃', '紅'] : KEY_NAMES;
            return (
              <tr key={i}>
                <td>
                  {i} {label}
                  {p.custom25[i] ? '' : '（預設）'}
                </td>
                <td>{codes.map((c, j) => `${names[j]}${KEY_CODES[c] ?? c}`).join('、')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="field">
        <select
          value={area}
          onChange={(e) => {
            const a = Number(e.target.value);
            setArea(a);
            setKeys25(a === 3 ? [...(p.custom25[3] ? keyMap(p, 3).slice(0, 3) : ['01', '02', '03']), '00', '00'] : keyMap(p, a));
          }}
        >
          {AREAS.map((l, i) => (
            <option key={i} value={i}>
              區碼 {i}：{l}
            </option>
          ))}
        </select>
      </div>
      {keys25.map((k, i) =>
        area === 3 && i > 2 ? null : (
          <div className="field" key={i}>
            <label>{area === 3 ? ['白', '黃', '紅'][i] : KEY_NAMES[i] + ' 鍵'}</label>
            <select value={k} onChange={(e) => setKeys25(keys25.map((x, j) => (j === i ? e.target.value : x)))}>
              {Object.entries(KEY_CODES).map(([c, l]) => (
                <option key={c} value={c}>
                  {c} {l}
                </option>
              ))}
            </select>
          </div>
        ),
      )}
      <div className="setting-row">
        <span className="cmd">{show(`25#${area}#${keys25.join('')}*`)}</span>
        <span />
        <button onClick={() => sendKeys(`25#${area}#${keys25.join('')}*`)}>設定</button>
      </div>

      <h3>時間參數</h3>
      <NumSetting label="自動下降" cmd={7} value={p.autoClose7} max={500} send={sendKeys} />
      <NumSetting label="行程時間" cmd={8} value={p.travel8} max={120} send={sendKeys} />
      <NumSetting label="上停下吸持" cmd={14} value={p.hold14} max={255} send={sendKeys} />
      <NumSetting label="第四繼電器吸持" cmd={15} value={p.relay15} max={255} send={sendKeys} />
      <NumSetting label="緊急求救（按住 F）" cmd={16} value={p.sos16} max={255} send={sendKeys} />
      <NumSetting label="二段式關門" cmd={18} value={p.stage2_18} max={255} send={sendKeys} />
      <NumSetting label="紅外線關門警報" cmd={23} value={p.irAlarm23} max={255} send={sendKeys} />
      <NumSetting label="警報喇叭時間（255＝長鳴）" cmd={24} value={p.alarm24} max={255} send={sendKeys} />
      <div className="setting-row">
        <span className="name">
          9# 自動斷電
          <div className="cmd">
            目前 {p.autoCut9.sec} 秒・模式 {p.autoCut9.mode}（1 按上、2 按下、3 上下）
          </div>
        </span>
        <span style={{ display: 'flex', gap: 4 }}>
          <input type="number" style={{ width: 56 }} value={cut9.sec} onChange={(e) => setCut9({ ...cut9, sec: e.target.value })} />
          <select value={cut9.mode} onChange={(e) => setCut9({ ...cut9, mode: e.target.value })}>
            <option value="1">按上</option>
            <option value="2">按下</option>
            <option value="3">上下</option>
          </select>
        </span>
        <button onClick={() => sendKeys(`9#${cut9.sec}#${cut9.mode}*`)}>設定</button>
      </div>
      <div className="field">
        <label>6# 分段定時（SM 接定時器：觸發時嗶一長兩短並保持開門，解除時嗶一長音後依 7# 倒數關門）</label>
        <input type="checkbox" checked={p.segTimer6} onChange={(e) => sendKeys(`6#${e.target.checked ? 2 : 3}*`)} />
      </div>
      <div className="field">
        <label>6# 暫停使用（遙控器無效）</label>
        <input type="checkbox" checked={p.paused6} onChange={(e) => sendKeys(`6#${e.target.checked ? 1 : 0}*`)} />
      </div>

      <h3>12# 紅外線（可組合）</h3>
      <div className="checks">
        {Object.entries(IR12).map(([k, l]) => {
          const code = Number(k);
          return (
            <label key={k}>
              <input type="checkbox" checked={p.ir12.includes(code)} onChange={(e) => setList(12, 0, p.ir12, code, e.target.checked)} />
              {k}. {l}
            </label>
          );
        })}
      </div>

      <h3>17# 防盜與警示燈（RELAY 輸出）</h3>
      <div className="field">
        <label>防盜（斷電啟動、停解除，警報由 RELAY 輸出）</label>
        <select value={p.guard17} onChange={(e) => sendKeys(`17#${e.target.value}*`)}>
          <option value={0}>關閉</option>
          <option value={1}>紅外線</option>
          <option value={2}>SM 接點（偵煙）</option>
          <option value={3}>紅外線＋SM 接點</option>
        </select>
      </div>
      <div className="checks">
        {Object.entries(WARN17).map(([k, l]) => {
          const code = Number(k);
          return (
            <label key={k}>
              <input type="checkbox" checked={p.warn17.includes(code)} onChange={(e) => setList(17, 10, p.warn17, code, e.target.checked)} />
              {k}. {l}
            </label>
          );
        })}
      </div>

      <h3>11# 主機功能</h3>
      <div className="checks">
        {FLAGS11.map((f) => (
          <label key={f.label}>
            <input type="checkbox" checked={f.get(p)} onChange={(e) => sendKeys(`11#${e.target.checked ? f.on : f.off}*`)} />
            {f.label}
          </label>
        ))}
      </div>

      <h3>13# 馬達保護</h3>
      <div className="checks">
        {FLAGS13.map((f) => (
          <label key={f.label}>
            <input type="checkbox" checked={f.get(p)} onChange={(e) => sendKeys(`13#${e.target.checked ? f.on : f.off}*`)} />
            {f.label}
          </label>
        ))}
      </div>

      <h3>其他</h3>
      <div className="setting-row">
        <span className="name">
          20# 還原預設值
          <div className="cmd">保留已登錄的遙控器</div>
        </span>
        <span />
        <button className="danger" onClick={() => confirm('還原主機預設值？') && sendKeys(`20#0*`)}>
          還原
        </button>
      </div>
      <div className="hint">
        10# 與 5# 已不使用。19#、22#、26#~31# 可輸入並記錄，但尚未模擬其功能。
      </div>
    </>
  );
}
