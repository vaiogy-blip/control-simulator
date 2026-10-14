import { useState } from 'react';
import type { Simulator } from '../engine/sim';

/** 接點動作紀錄：依時間列出每個點位的動作與主機嗶聲 */
export function EventLog({ sim, selected, changed }: { sim: Simulator; selected: string | null; tick: number; changed: () => void }) {
  const [onlySel, setOnlySel] = useState(false);
  const [hideBeep, setHideBeep] = useState(false);
  const rows = sim.log.filter((e) => (!onlySel || !selected || e.device === selected) && (!hideBeep || e.point !== '嗶聲'));
  const list = rows.slice(-300).reverse();
  return (
    <div className="log">
      <div className="log-bar">
        <strong>接點動作紀錄</strong>
        <span className="hint">共 {rows.length} 筆，最新在最上面</span>
        <span className="spacer" />
        <label>
          <input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> 只看選取的設備
        </label>
        <label>
          <input type="checkbox" checked={hideBeep} onChange={(e) => setHideBeep(e.target.checked)} /> 隱藏嗶聲
        </label>
        <button
          onClick={() => {
            sim.clearLog();
            changed();
          }}
        >
          清除
        </button>
      </div>
      <div className="log-body">
        <table className="small">
          <thead>
            <tr>
              <th style={{ width: 80 }}>時間</th>
              <th style={{ width: 160 }}>設備</th>
              <th style={{ width: 120 }}>點位</th>
              <th>動作</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="hint">
                  按「播放」後，按鈕、感應器、繼電器、主機輸入輸出的每次動作都會記錄在這裡。
                </td>
              </tr>
            )}
            {list.map((e, i) => (
              <tr key={i} className={e.point === '嗶聲' ? 'log-beep' : e.on ? 'log-on' : e.on === false ? 'log-off' : ''}>
                <td className="num">{e.t.toFixed(2)}s</td>
                <td>{e.deviceName}</td>
                <td>{e.point}</td>
                <td>{e.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
