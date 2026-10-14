import { Simulator } from './sim';
import { fastDoor, hostWithRelays, parkingEntrance, relayLatch } from './examples';
import type { HostState } from './host';

function load(f = parkingEntrance()) {
  const sim = new Simulator();
  sim.load(f);
  const by = (name: string) => sim.devices.find((d) => d.name.startsWith(name))!;
  return { sim, by, host: by('全功能主機'), gate: by('柵欄機') ?? by('快速門') };
}
const lastBeep = (h: { state: HostState }) => h.state.beeps.at(-1);
const keys = (sim: Simulator, id: string, s: string) => {
  for (const ch of s) {
    sim.action(id, 'key', ch);
    sim.step();
  }
};

describe('停車場入口範例', () => {
  it('刷卡後開門、車輛通過後二段式關門', () => {
    const { sim, by, host, gate } = load();
    sim.action(by('感應卡機').id, 'swipe');
    sim.run(4.2);
    expect(gate.state.pos).toBeCloseTo(1, 2);
    expect(by('警示燈').state.on).toBe(true);

    sim.action(by('紅外線').id, 'pass'); // 遮斷 2 秒
    sim.run(2.5);
    expect(host.state.stage2T).not.toBeNull();
    sim.run(2.5); // 18# 2 秒後開始關
    expect(host.state.motion).toBe('down');
    sim.run(4.2);
    expect(gate.state.pos).toBeCloseTo(0, 2);
    sim.run(0.2);
    expect(by('警示燈').state.on).toBe(false);
  });

  it('沒車通過時 7# 自動下降', () => {
    const { sim, by, gate } = load();
    sim.action(by('感應卡機').id, 'swipe');
    sim.run(4.2 + 10 + 4.2);
    expect(gate.state.pos).toBeCloseTo(0, 2);
  });

  it('關門途中紅外線遮斷會彈升（12#3）', () => {
    const { sim, by, host, gate } = load();
    sim.action(by('感應卡機').id, 'swipe');
    sim.run(4.2 + 10 + 1); // 自動下降中
    expect(host.state.motion).toBe('down');
    sim.action(by('紅外線').id, 'toggle');
    sim.run(0.5);
    expect(host.state.motion).toBe('up');
    sim.run(3);
    expect(gate.state.pos).toBeCloseTo(1, 2);
  });

  it('已登錄遙控器預設按鍵：▲上、■停、▼下、F 斷電', () => {
    const { sim, by, host } = load();
    const rc = by('遙控器').id;
    const press = (k: number) => {
      sim.action(rc, 'keyDown', k);
      sim.step();
      sim.action(rc, 'keyUp', k);
      sim.step();
    };
    press(1);
    expect(host.state.motion).toBe('up');
    press(2);
    expect(host.state.motion).toBe('idle');
    press(4);
    expect(host.state.cut).toBe(true);
    press(1);
    expect(host.state.motion).toBe('idle');
    press(2);
    expect(host.state.cut).toBe(false);
  });
});

describe('依接線圖的端子', () => {
  it('KEY 押扣：白上、紅停（2A1B 常閉）、黃下', () => {
    const { sim, by, host } = load();
    const click = (name: string) => {
      sim.action(by(name).id, 'press');
      sim.run(0.2);
      sim.action(by(name).id, 'release');
      sim.run(0.2);
    };
    click('押扣 上');
    expect(host.state.motion).toBe('up');
    click('押扣 停');
    expect(host.state.motion).toBe('idle');
    click('押扣 下');
    expect(host.state.motion).toBe('down');
  });

  it('切「電」時上停下只送 14# 秒脈衝，快速門自己跑到全開', () => {
    const { sim, by, host, gate } = load(fastDoor());
    const rc = by('遙控器').id;
    sim.action(rc, 'keyDown', 1);
    sim.run(0.5);
    expect(host.state.out.UP).toBe(true);
    sim.action(rc, 'keyUp', 1);
    sim.run(1);
    expect(host.state.out.UP).toBe(false);
    sim.run(1.5);
    expect(gate.state.pos).toBeCloseTo(1, 2);
  });

  it('6#2 分段定時：觸發嗶一長兩短並保持開門，解除嗶一長音後依 7# 倒數關門', () => {
    const { sim, host, gate } = load();
    keys(sim, host.id, '6#2*');
    const t = sim.addDevice('toggleSwitch', 0, 0, '定時器');
    sim.connect(t.id, 'COM', host.id, 'SCOM');
    sim.connect(t.id, 'NO', host.id, 'SM');
    sim.action(t.id, 'toggle');
    sim.run(0.2);
    expect(lastBeep(host)?.kind).toBe('long2');
    sim.run(4.5 + 15);
    expect(gate.state.pos).toBeCloseTo(1, 2);
    sim.action(t.id, 'toggle');
    sim.run(0.2);
    expect(lastBeep(host)?.kind).toBe('long');
    expect(host.state.motion).toBe('idle');
    sim.run(9.5); // 7# = 10 秒倒數
    expect(host.state.motion).toBe('idle');
    sim.run(0.5);
    expect(host.state.motion).toBe('down');
    sim.run(4.2);
    expect(gate.state.pos).toBeCloseTo(0, 2);
  });
});

describe('主機嗶聲', () => {
  it('外部接點、紅外線動作各嗶一聲', () => {
    const { sim, by, host } = load();
    sim.action(by('押扣 上').id, 'press');
    sim.run(0.2);
    expect(lastBeep(host)).toMatchObject({ kind: '1' });
    const n = host.state.beeps.length;
    sim.action(by('紅外線').id, 'toggle');
    sim.run(0.3);
    expect(host.state.beeps.length).toBe(n + 1);
    expect(lastBeep(host)?.msg).toContain('紅外線');
  });

  it('自動關門倒數最後 5 秒每秒嗶一聲，嗶完 5 聲才送下', () => {
    const { sim, by, host } = load();
    sim.action(by('感應卡機').id, 'swipe');
    sim.run(4.2); // 全開，開始 10 秒倒數
    const n0 = host.state.beeps.length;
    sim.run(5.5);
    expect(host.state.beeps.length).toBe(n0 + 1);
    sim.run(3.5);
    expect(host.state.beeps.length).toBe(n0 + 5);
    expect(host.state.motion).toBe('idle');
    expect(host.state.beeps.slice(-5).every((b: any) => b.kind === '1')).toBe(true);
    sim.run(1.1);
    expect(host.state.motion).toBe('down');
    expect(sim.log.some((e) => e.text.includes('自動關門倒數 1'))).toBe(true);
  });
});

describe('電路', () => {
  it('繼電器組數決定端子數', () => {
    const sim = new Simulator();
    const r = sim.addDevice('relay', 0, 0);
    expect(sim.ports(r).map((p) => p.id).sort()).toEqual(['1', '12', '13', '14', '4', '5', '8', '9']);
    r.params.groups = 4;
    expect(sim.ports(r).length).toBe(14);
  });

  it('線圈電壓不符時不吸合', () => {
    const sim = new Simulator();
    const psu = sim.addDevice('power', 0, 0);
    psu.params.kind = 'AC';
    psu.params.volts = 220;
    const r = sim.addDevice('relay', 0, 0);
    sim.connect(psu.id, 'P', r.id, '14');
    sim.connect(psu.id, 'N', r.id, '13');
    sim.run(0.2);
    expect(r.state.d.out).toBe(false);
    expect(sim.solution.mismatch[r.id]).toEqual(['COIL']);
    r.params.coil = 'AC220';
    sim.run(0.2);
    expect(r.state.d.out).toBe(true);
  });

  it('正負極短路會被偵測', () => {
    const sim = new Simulator();
    const psu = sim.addDevice('power', 0, 0);
    const b = sim.addDevice('pushButton', 0, 0);
    sim.connect(psu.id, 'P', b.id, 'COM');
    sim.connect(psu.id, 'N', b.id, 'NO');
    sim.step();
    expect(sim.solution.shorts.size).toBe(0);
    sim.action(b.id, 'press');
    sim.step();
    expect(sim.solution.shorts.has(psu.id)).toBe(true);
  });

  it('主機輸出經繼電器帶動柵欄機', () => {
    const { sim, by, host, gate } = load(hostWithRelays());
    sim.action(by('遙控器').id, 'keyDown', 1);
    sim.run(0.3);
    expect(by('上').state.d.out).toBe(true);
    sim.action(by('遙控器').id, 'keyUp', 1);
    sim.run(3);
    expect(gate.state.pos).toBeCloseTo(1, 2);
    expect(host.state.out.UP).toBe(false);
  });

  it('接線節點把多條線接在一起', () => {
    const sim = new Simulator();
    const psu = sim.addDevice('power', 0, 0);
    const n = sim.addDevice('node', 0, 0);
    const l1 = sim.addDevice('lamp', 0, 0);
    const l2 = sim.addDevice('lamp', 0, 0);
    sim.connect(psu.id, 'P', n.id, 'P');
    sim.connect(n.id, 'P', l1.id, 'P');
    sim.connect(n.id, 'P', l2.id, 'P');
    sim.connect(l1.id, 'COM', psu.id, 'N');
    sim.connect(l2.id, 'COM', psu.id, 'N');
    sim.step();
    expect(l1.state.on && l2.state.on).toBe(true);
  });
});

describe('鍵盤設定', () => {
  it('不需密碼：11#11米 開啟外部押扣，超出範圍嗶三聲', () => {
    const { sim, host } = load();
    keys(sim, host.id, '7#20*');
    expect(host.params.autoClose7).toBe(20);
    expect(lastBeep(host)?.kind).toBe('long');
    keys(sim, host.id, '7#999*');
    expect(host.params.autoClose7).toBe(20);
    expect(lastBeep(host)?.kind).toBe('3');
    host.params.o11.extBtn = false;
    keys(sim, host.id, '11#11*');
    expect(host.params.o11.extBtn).toBe(true);
  });

  it('10# 已不使用', () => {
    const { sim, host } = load();
    keys(sim, host.id, '10#1208*');
    expect(lastBeep(host)?.kind).toBe('3');
  });

  it('25# 定義五鍵，S 鍵可設為 RELAY', () => {
    const { sim, by, host } = load();
    keys(sim, host.id, '25#0#0103020807*');
    sim.action(by('遙控器').id, 'keyDown', 5);
    sim.step();
    expect(host.state.out.RELAY).toBe(true);
  });

  it('1# 新增遙控器並可連續新增', () => {
    const sim = new Simulator();
    const host = sim.addDevice('cvia92', 0, 0);
    const r1 = sim.addDevice('remote', 0, 0);
    const r2 = sim.addDevice('remote', 0, 0);
    keys(sim, host.id, '1#5*');
    sim.action(r1.id, 'keyDown', 1);
    sim.step();
    keys(sim, host.id, '6*');
    sim.action(r2.id, 'keyDown', 2);
    sim.step();
    keys(sim, host.id, '*');
    expect(host.params.remotes.map((r: any) => r.serial)).toEqual([5, 6]);
    expect(host.state.keypad.session).toBeNull();
  });

  it('超過 8 秒未按鍵連嗶 5 聲', () => {
    const { sim, host } = load();
    keys(sim, host.id, '7#1');
    sim.run(8.5);
    expect(lastBeep(host)?.kind).toBe('5');
  });

  it('25# 自訂按鍵覆蓋 10# 模式', () => {
    const { sim, by, host } = load();
    keys(sim, host.id, '25#0#0700000000*');
    sim.action(by('遙控器').id, 'keyDown', 1);
    sim.step();
    expect(host.state.motion).toBe('idle');
    expect(host.state.out.RELAY).toBe(true);
  });
});

describe('繼電器自保持範例', () => {
  it('按啟動後自保持，3 秒後延時燈亮，按停止解除', () => {
    const { sim, by } = load(relayLatch());
    const start = by('啟動按鈕').id;
    const stop = by('停止按鈕').id;
    sim.step();
    sim.action(start, 'press');
    sim.run(0.3);
    sim.action(start, 'release');
    sim.run(0.5);
    expect(by('運轉燈').state.on).toBe(true);
    sim.run(3);
    expect(by('延時燈').state.on).toBe(true);
    sim.action(stop, 'press');
    sim.run(0.3);
    sim.action(stop, 'release');
    sim.run(0.3);
    expect(by('運轉燈').state.on).toBe(false);
    expect(by('延時燈').state.on).toBe(false);
  });
});

describe('出廠預設', () => {
  it('KEY 外部押扣預設關閉，11#22 開啟後才有作用', () => {
    const sim = new Simulator();
    const host = sim.addDevice('cvia92', 0, 0);
    const b = sim.addDevice('pushButton', 0, 0);
    sim.connect(b.id, 'NO', host.id, 'KEY_W');
    sim.connect(b.id, 'COM', host.id, 'KEY_G');
    sim.action(b.id, 'press');
    sim.run(0.2);
    expect(host.state.motion).toBe('idle');
    sim.action(b.id, 'release');
    keys(sim, host.id, '11#22*');
    sim.action(b.id, 'press');
    sim.run(0.2);
    expect(host.state.motion).toBe('up');
  });
});
