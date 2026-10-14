import { Simulator } from './sim';
import type { ProjectFile } from './types';

const RED = '#e03131';
const BLACK = '#343a40';

/** 範例：停車場入口，全功能主機切「机」直接驅動傳統柵欄機馬達 */
export function parkingEntrance(): ProjectFile {
  const sim = new Simulator();
  const host = sim.addDevice('cvia92', 220, 40, '全功能主機');
  host.params.motorSwitch = 'traditional';
  host.params.travel8 = 4; // 行程略長於柵欄機實際 3 秒，確保到位
  host.params.autoClose7 = 10;
  host.params.ir12 = [3];
  host.params.stage2_18 = 2;
  host.params.warn17 = [13];
  host.params.o11.extBtn = true; // 11#22 開啟 KEY 外部押扣（2A1B）

  const rc = sim.addDevice('remote', 40, 40, '遙控器 A');
  rc.params.code = 'A1B2C3D4';
  host.params.remotes.push({ serial: 1, code: 'A1B2C3D4', suspended: false });

  const card = sim.addDevice('cardReader', 40, 600, '感應卡機');
  const ir = sim.addDevice('irSensor', 180, 600, '紅外線（門下）');
  const bUp = sim.addDevice('pushButton', 350, 600, '押扣 上');
  bUp.params.label = '上';
  const bStop = sim.addDevice('pushButton', 490, 600, '押扣 停');
  bStop.params.label = '停';
  const bDown = sim.addDevice('pushButton', 630, 600, '押扣 下');
  bDown.params.label = '下';

  const g = sim.addDevice('gate', 600, 40, '柵欄機（傳統馬達）');
  const psu = sim.addDevice('power', 980, 640, '電源 DC12V');
  const lamp = sim.addDevice('lamp', 1160, 640, '警示燈');

  // 感應卡機的 RELAY 接到 KEY 的「上」；2A1B 時停用押扣的 NC
  sim.connect(card.id, 'NO', host.id, 'KEY_W');
  sim.connect(card.id, 'COM', host.id, 'KEY_G');
  sim.connect(bUp.id, 'NO', host.id, 'KEY_W');
  sim.connect(bUp.id, 'COM', host.id, 'KEY_G');
  sim.connect(bStop.id, 'NC', host.id, 'KEY_R');
  sim.connect(bStop.id, 'COM', host.id, 'KEY_G');
  sim.connect(bDown.id, 'NO', host.id, 'KEY_Y');
  sim.connect(bDown.id, 'COM', host.id, 'KEY_G');
  sim.connect(ir.id, 'NO', host.id, 'IR');
  sim.connect(ir.id, 'COM', host.id, 'SCOM');
  sim.connect(host.id, 'UP', g.id, 'UP');
  sim.connect(host.id, 'STOP', g.id, 'STOP');
  sim.connect(host.id, 'DOWN', g.id, 'DOWN');
  sim.connect(host.id, 'MCOM', g.id, 'COM');
  sim.connect(psu.id, 'P', host.id, 'RCOM', RED);
  sim.connect(host.id, 'RNO', lamp.id, 'P', RED);
  sim.connect(lamp.id, 'COM', psu.id, 'N', BLACK);
  return sim.toFile('停車場入口（範例）');
}

/** 範例：快速門，全功能主機切「電」送上停下脈衝給快速門控制板 */
export function fastDoor(): ProjectFile {
  const sim = new Simulator();
  const host = sim.addDevice('cvia92', 220, 40, '全功能主機');
  host.params.motorSwitch = 'electronic';
  host.params.hold14 = 1;
  host.params.travel8 = 3;
  host.params.autoClose7 = 8;
  host.params.ir12 = [2];
  host.params.warn17 = [11, 12];

  const rc = sim.addDevice('remote', 40, 40, '遙控器 A');
  rc.params.code = 'F1F2F3F4';
  host.params.remotes.push({ serial: 1, code: 'F1F2F3F4', suspended: false });
  const ir = sim.addDevice('irSensor', 200, 600, '紅外線（門下）');

  const g = sim.addDevice('gate', 600, 40, '快速門');
  g.params.mode = 'pulse';
  g.params.openTime = 2.5;
  g.params.closeTime = 2.5;
  const psu = sim.addDevice('power', 980, 640, '電源 DC12V');
  const lamp = sim.addDevice('lamp', 1160, 640, '警示燈');

  sim.connect(ir.id, 'NO', host.id, 'IR');
  sim.connect(ir.id, 'COM', host.id, 'SCOM');
  sim.connect(host.id, 'UP', g.id, 'UP');
  sim.connect(host.id, 'STOP', g.id, 'STOP');
  sim.connect(host.id, 'DOWN', g.id, 'DOWN');
  sim.connect(host.id, 'MCOM', g.id, 'COM');
  sim.connect(psu.id, 'P', host.id, 'RCOM', RED);
  sim.connect(host.id, 'RNO', lamp.id, 'P', RED);
  sim.connect(lamp.id, 'COM', psu.id, 'N', BLACK);
  return sim.toFile('快速門（範例）');
}

/** 範例：全功能主機輸出經繼電器帶動柵欄機（仿車道控制盤） */
export function hostWithRelays(): ProjectFile {
  const sim = new Simulator();
  const host = sim.addDevice('cvia92', 40, 40, '全功能主機');
  host.params.motorSwitch = 'electronic';
  host.params.hold14 = 1;
  host.params.travel8 = 3;
  host.params.autoClose7 = 8;
  const rc = sim.addDevice('remote', 40, 580, '遙控器 A');
  rc.params.code = 'C0FFEE01';
  host.params.remotes.push({ serial: 1, code: 'C0FFEE01', suspended: false });

  const psu = sim.addDevice('power', 760, 40, '電源 DC12V');
  const rUp = sim.addDevice('relay', 520, 300, '上');
  const rDown = sim.addDevice('relay', 660, 300, '下');
  const g = sim.addDevice('gate', 820, 300, '柵欄機');
  g.params.mode = 'pulse';
  g.params.openTime = 2.5;
  g.params.closeTime = 2.5;

  // 主機輸出「共」接 +12V，上、下分別接繼電器線圈 14，線圈 13 回到 −
  sim.connect(psu.id, 'P', host.id, 'MCOM', RED);
  sim.connect(host.id, 'UP', rUp.id, '14', RED);
  sim.connect(host.id, 'DOWN', rDown.id, '14', RED);
  sim.connect(rUp.id, '13', psu.id, 'N', BLACK);
  sim.connect(rDown.id, '13', psu.id, 'N', BLACK);
  // 繼電器接點 9(COM)、5(NO) 接柵欄機控制板的 上／下 與 共
  sim.connect(rUp.id, '5', g.id, 'UP');
  sim.connect(rDown.id, '5', g.id, 'DOWN');
  sim.connect(rUp.id, '9', g.id, 'COM');
  sim.connect(rDown.id, '9', g.id, 'COM');
  return sim.toFile('主機經繼電器帶動柵欄機（範例）');
}

/** 範例：繼電器自保持啟停加延時 */
export function relayLatch(): ProjectFile {
  const sim = new Simulator();
  const psu = sim.addDevice('power', 40, 40, '電源 DC12V');
  const start = sim.addDevice('pushButton', 200, 360, '啟動按鈕');
  start.params.label = '啟動';
  const stopBtn = sim.addDevice('pushButton', 40, 360, '停止按鈕');
  stopBtn.params.label = '停止';
  const r1 = sim.addDevice('relay', 400, 120, '繼電器 R1');
  const t1 = sim.addDevice('timer', 560, 120, '延時 T1');
  t1.params.preset = 3;
  const lampRun = sim.addDevice('lamp', 720, 360, '運轉燈');
  lampRun.params.color = '#2ecc71';
  lampRun.params.label = '運轉';
  const lampDelay = sim.addDevice('lamp', 860, 360, '延時燈');
  lampDelay.params.label = '延時到';

  // 自保持：+ → 停止(NC) → 啟動(NO) 並聯 R1 第一組 NO → R1 線圈 → −
  sim.connect(psu.id, 'P', stopBtn.id, 'COM', RED);
  sim.connect(stopBtn.id, 'NC', start.id, 'COM');
  sim.connect(start.id, 'NO', r1.id, '14');
  sim.connect(stopBtn.id, 'NC', r1.id, '9');
  sim.connect(r1.id, '5', r1.id, '14');
  sim.connect(r1.id, '13', psu.id, 'N', BLACK);
  // R1 第二組 NO 點亮運轉燈並啟動 T1
  sim.connect(psu.id, 'P', r1.id, '12', RED);
  sim.connect(r1.id, '8', lampRun.id, 'P');
  sim.connect(lampRun.id, 'COM', psu.id, 'N', BLACK);
  sim.connect(r1.id, '8', t1.id, '14');
  sim.connect(t1.id, '13', psu.id, 'N', BLACK);
  sim.connect(psu.id, 'P', t1.id, '9', RED);
  sim.connect(t1.id, '5', lampDelay.id, 'P');
  sim.connect(lampDelay.id, 'COM', psu.id, 'N', BLACK);
  return sim.toFile('繼電器自保持（範例）');
}

export const EXAMPLES: { name: string; make: () => ProjectFile }[] = [
  { name: '停車場入口（傳統馬達）', make: parkingEntrance },
  { name: '快速門（電子式）', make: fastDoor },
  { name: '主機經繼電器帶動柵欄機', make: hostWithRelays },
  { name: '繼電器自保持＋延時', make: relayLatch },
];
