/**
 * 電路模型：每個設備有若干端子，接線不分方向，把兩個端子接在一起。
 * 接線＋設備內部「閉合的接點」把端子連成同一個節點（net）。
 * - 負載（線圈、燈、喇叭）兩端分別接到同一台電源的正、負極時就通電。
 * - 乾接點輸入（主機 KEY、SENSOR、柵欄機控制板）的兩個端子被接通時就動作。
 */

/** 遙控器發出的無線訊號，廣播給所有主機 */
export interface RfEvent {
  code: string; // 遙控器內碼
  key: number; // 1~5（4 = F 鍵，5 = S 鍵）
  down: boolean;
}

export interface PortDef {
  id: string;
  label: string;
}

/** 電源種類與電壓，例如 { kind: 'DC', volts: 12 } */
export interface Rating {
  kind: 'DC' | 'AC';
  volts: number;
}

/** 負載：兩端跨在同一台電源的兩極上就通電 */
export interface LoadDef {
  id: string;
  a: string;
  b: string;
  /** 額定電壓；沒有就不檢查 */
  rating?: Rating | null;
}

/** 乾接點輸入：a、b 兩端子接通時動作 */
export interface SenseDef {
  id: string;
  a: string;
  b: string;
}

/** 電源輸出：hot＝正極或 L，cold＝負極或 N */
export interface SourceDef {
  hot: string;
  cold: string;
  rating: Rating;
  on: boolean;
}

/** 設備上可記錄的點位（接點動作紀錄用） */
export interface PointDef {
  name: string;
  on: boolean;
  words?: [string, string]; // [動作時, 復歸時]
}

export interface StepCtx {
  t: number;
  dt: number;
  /** 各負載是否通電、各乾接點輸入是否接通，以 id 為 key */
  inputs: Record<string, boolean>;
  rf: RfEvent[];
}

export type Category = '控制主機' | '遙控' | '電源' | '輸入設備' | '輸出設備' | '繼電器類' | '配線';

export interface DeviceModel<P = any, S = any> {
  type: string;
  name: string;
  category: Category;
  ports(params: P): PortDef[];
  defaultParams(): P;
  init(params: P): S;
  /** 目前閉合的內部接點（端子對） */
  contacts?(state: S, params: P): [string, string][];
  loads?(params: P): LoadDef[];
  senses?(params: P): SenseDef[];
  sources?(state: S, params: P): SourceDef[];
  /** 推進一個掃描週期；可修改 state */
  step?(state: S, params: P, ctx: StepCtx): void;
  /** 使用者在畫面上的操作（按下按鈕、車輛進入等） */
  action?(state: S, params: P, action: string, value?: unknown): RfEvent[] | void;
  points?(state: S, params: P, inputs: Record<string, boolean>): PointDef[];
  /** 取出設備自己產生的紀錄（例如主機嗶聲） */
  drainLog?(state: S): string[];
  /** 判斷動作是否跑完時要比對的狀態（去掉一直在走的時鐘等欄位） */
  quiet?(state: S): unknown;
  /** 狀態看似沒變但仍在等待中（例如按住計時、鍵盤輸入中） */
  busy?(state: S, params: P): boolean;
}

export interface DeviceInstance {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  /** 圖示大小倍率，1 = 100% */
  scale?: number;
  params: any;
  state: any;
}

export interface PortRef {
  device: string;
  port: string;
}

export interface Wire {
  id: string;
  from: PortRef;
  to: PortRef;
  color?: string;
  /** 手動走線的轉折點（畫布座標）；沒有就自動走線 */
  points?: { x: number; y: number }[];
}

export interface ProjectFile {
  version: 2;
  name: string;
  devices: Omit<DeviceInstance, 'state'>[];
  wires: Wire[];
}

export interface LogEntry {
  t: number;
  device: string; // 設備 id
  deviceName: string;
  point: string;
  text: string;
  on?: boolean;
}
