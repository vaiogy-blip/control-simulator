# 控制模擬器交接文件（2026-10-14）

給接手的新對話串：先讀完這份。9 點新需求已在 2026-10-14 完成（見第 4 節）。

## 1. 專案目標與已定案事項

- 網頁版控制系統模擬器：在畫布上堆疊、接線各種控制設備，然後模擬整套系統的動作。**所有版本都不接實體硬體。**
- 核心設備是「全功能主機」（原型 CVIA-92 全功能無線車道型遙控主機，鍵盤參數式設定 1#~31#），另有繼電器類控制電路。
- 使用者（RYW）以繁體中文溝通。畫面上不要出現原廠品牌字樣（CVIA、JIA HUI）。
- 已向使用者確認的事實：
  - KEY 外部押扣：白＝上、紅＝停、黃＝下（綠＝共）。**出廠預設關閉**，用 11#11 或 11#22 開啟；2A1B 模式下紅（停）為常閉。
  - 感應卡機的 RELAY 接 KEY 的「上」，**不是**接 SM。
  - 警報、警示燈、紅綠燈都**共用第 4 顆 RELAY**。
  - 參數輸入**省略密碼**：`11#1234#11*` 簡化成 `11#11*`。
  - 遙控器按鍵**只用 25# 定義**，10# 不再使用（輸入 10# 會嗶三聲）。
  - 遙控器是**直立式五鍵**：左邊由上而下 ▲ ■ ▼ F，右邊單獨 S。25# 每區 10 碼，依序 ▲■▼F S 各 2 碼。
  - 主機外形下半部是大圓弧底（已畫出）。
  - 還沒用 25# 定義的區段，遙控器照預設 ▲上、■停、▼下、F 斷電、S 不使用（使用者已確認）。

完整說明書 PDF：`/mnt/project-files/uploads/hearth/10a16d20-e112-46e9-8723-a4be4ee664d2`
參數對照：`/mnt/project-files/design/CVIA-92-參數對照.md`；設計草案：`/mnt/project-files/design/設計方案-v1.md`
其餘待確認的假設列在 `README.md` 的「待確認的假設」。

## 2. 程式碼位置與工作流程

- **正式位置**（使用者電腦）：`G:\我的雲端硬碟\APP開發\控制模擬器`（已核准的連線資料夾）。
- **備份**：`/mnt/project-files/simulator/`（不含 node_modules）。
- 沒有 git repository。
- 開發流程：
  1. `cp -r /mnt/project-files/simulator ~/sim && cd ~/sim && npm install`
  2. `npm test`（vitest，目前 22 個測試全過）、`npm run build`（tsc + vite，輸出單一檔 `dist/index.html`）
  3. 把 `dist/index.html` 複製成 `控制模擬器.html`，原始碼與成品同步回 `/mnt/project-files/simulator/`
  4. 用 `device_commit_files`，以 `stagedPath=/mnt/project-files/simulator/...` 寫到 `G:\我的雲端硬碟\APP開發\控制模擬器\...`（相同相對路徑）
- 技術：React 18.3.1、TypeScript 5.6.3、Vite 6.3.5、vite-plugin-singlefile 2.2.0、vitest 3.1.4。成品是可離線開啟的單一 HTML。
- 畫面截圖測試：playwright-core 1.48.2，瀏覽器用 `/opt/pw-browsers/chromium_headless_shell-*/…/headless_shell`（新版 chromium 不支援舊 headless）。點 SVG 文字要 `click({force:true})`。

## 3. 架構與檔案（2026-10-14 第二版：電路模型）

- **電路模型**：接線不分方向，把兩個端子接在一起。`sim.ts` 每個掃描週期用 union-find 把「接線＋各設備目前閉合的接點」併成節點（net），再判斷：
  - 負載（`loads`：繼電器線圈、燈、喇叭）兩端分別在同一台電源的 hot／cold 節點上就通電；額定電壓（`rating`，交直流相同且 ±15%）不符則不動作並記入 `solution.mismatch`。
  - 乾接點輸入（`senses`：主機 KEY_W/R/Y 對 KEY_G、IR/SM 對 SCOM；柵欄機 UP/STOP/DOWN 對 COM）兩端同節點就接通。
  - 電源正負同節點＝短路（`solution.shorts`）。
  - 設備 step 只改 state，輸出接點由 `contacts(state)` 回報（主機的 `state.out` → MCOM-UP/STOP/DOWN、RCOM-RNO）。
- **接點動作紀錄**：各模型的 `points()` 變化與主機 `drainLog()`（嗶聲）寫入 `sim.log`。
- 存檔 `version: 2`；開舊版檔保留設備、移除接線。localStorage key `control-sim-project-v3`。

| 檔案 | 內容 |
|---|---|
| `src/engine/types.ts` | PortDef、LoadDef、SenseDef、SourceDef、PointDef、DeviceModel、Wire（含 color）、ProjectFile v2、LogEntry |
| `src/engine/sim.ts` | Simulator：solve()、step()、log、load/toFile、pruneWires |
| `src/engine/host.ts` | 全功能主機。端子 KEY_W/KEY_R/KEY_Y/KEY_G、SCOM/IR/SM、UP/STOP/DOWN/MCOM、RNO/RCOM。嗶聲 kind 加 'long2'；paramSummary() 產生參數清單 |
| `src/engine/devices.ts` | 輸入設備一律 COM/NO/NC；電源（DC/AC、電壓）；柵欄機（上停下共＋限COM/上限/下限）；指示燈/喇叭（P/COM）、紅綠燈（R/G/COM）；繼電器與計時繼電器（1~4 組，腳位依繼電器座，線圈 14/13）；節點 |
| `src/engine/examples.ts` | 停車場入口、快速門、主機經繼電器帶動柵欄機、繼電器自保持＋延時 |
| `src/engine/engine.test.ts` | 22 個測試 |
| `src/ui/layout.ts` | 各設備外框與端子位置、繼電器座排列、boxOf/portWorld、titleBelow |
| `src/ui/route.ts` | 直角佈線：10px 格點 A*，避開設備、轉彎與不同節點重疊加權；Wire.points 有值時照手動轉折點走（manualPath）；junctions() 算分岔圓點 |
| 手動走線（App.tsx） | 端子點一下不拖＝逐點畫線（drag.click）；選取接線後拖線段小方塊（drag.kind 'seg'）把路徑轉成 Wire.points；Inspector「恢復自動走線」刪掉 points |
| `src/ui/App.tsx` | 畫布、拖曳、接線（拖到線上自動加節點並拆線）、顯示縮放、佈線只在 layoutRev 改變時重算 |
| `src/ui/DeviceBody.tsx` | 接線圖風格主機（外框＋參數清單）／實機外觀、繼電器座、電源供應器、燈、柵欄機等 |
| `src/ui/EventLog.tsx`、`Inspector.tsx`、`HostPanel.tsx`、`wires.ts`、`sound.ts`、`styles.css` | 接點紀錄、參數（圖示大小、線色、組數、線圈電壓、電源）、主機面板、線色、嗶聲音效 |

## 4. 9 點需求：已完成（2026-10-14）

1. 下方改成「接點動作紀錄」。
2. 每個設備可調圖示大小（50~200%，可一鍵套用全部），畫布另有整體顯示縮放。
3. 主機嗶聲：KEY、紅外線動作各一短聲；SM 分段定時觸發一長兩短、解除一長音後依 7# 倒數；7# 倒數最後 5 秒每秒一短聲，第 5 聲後才送下。
4、5. 所有設備有共點；輸入設備一律 COM/NO/NC。
6. 繼電器、計時繼電器可選 1~4 組接點。
7. 左側新增「電源」：DC/AC 下拉，電壓可選或自訂。
8. 主機預設用接線圖風格（外框＋參數清單），繼電器畫成繼電器座（腳位編號）。
9. 直角走線、避開設備、分岔節點圓點、線色。

已確認：未設 25# 的區段，遙控器照預設 ▲上 ■停 ▼下 F斷電 S不用。

### 可能的下一步
- 請使用者看實際畫面回饋（走線美觀、圖示比例、嗶聲時機）。
- DIN 端子台設備、雙主機、更多實際案例範例（如福容ONE 的 IR/LOOP、警示燈 TDR 模組）。

## 5. 記憶與筆記

- 專案記憶：`/tmp/claude/memory/team/silo/`（simulator-v01、cvia-92-host、code-location、project-design-v1）。
- 檔案筆記：`/mnt/project-files/.notes/inputs.md`。
