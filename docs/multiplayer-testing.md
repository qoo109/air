# 泡泡島多人連線測試實驗室

目前測試分成兩層：快速且穩定的演算法測試，以及真正登入 Supabase 的雙玩家瀏覽器測試。

## 一、自動基礎驗證

GitHub Actions：

```text
Validate multiplayer engine
```

每次多人引擎、測試探針或測試程式改動時會執行：

- JavaScript 語法檢查
- v4.3.3 巢狀載入器補丁驗證
- 20／50／80／120ms 網路延遲情境
- 抖動、丟包與封包亂序
- 平均、P95、最大球體誤差
- 單幀跳動與強制校正次數

輸出 Artifact：

```text
puck-sync-matrix-<run number>
```

## 二、雙玩家 E2E 實驗室

GitHub Actions：

```text
Multiplayer E2E Lab
```

它會建立兩個隔離瀏覽器環境：

- iPhone 13 模擬玩家
- Pixel 7 模擬玩家

兩位玩家會自動：

1. 建立匿名帳號。
2. 輸入不同名稱。
3. 同時進入快速配對。
4. 驗證主場龜殼與客場旋渦殼。
5. 自動拖動球拍。
6. 每 100ms 比較雙方看到的球位置。
7. 匯出路由、延遲、漂移、封包與畫面跳動報告。

## 手動執行

進入：

```text
GitHub → Actions → Multiplayer E2E Lab → Run workflow
```

預設參數：

```text
delay_ms: 60
jitter_ms: 20
loss_pct: 2
force_turn: false
sample_duration_ms: 15000
```

推薦測試組合：

| 情境 | Delay | Jitter | Loss | Force TURN |
|---|---:|---:|---:|---|
| 一般 Wi‑Fi | 20 | 5 | 0 | false |
| 一般行動網路 | 50 | 15 | 1 | false |
| 擁塞行動網路 | 80 | 25 | 3 | false |
| TURN 驗證 | 60 | 20 | 2 | true |
| 困難網路 | 120 | 40 | 5 | false |

## 報告

工作流程完成後下載：

```text
multiplayer-e2e-report-<run number>
```

內含：

- `multiplayer-drift-report.json`
- Playwright HTML report
- Trace
- 失敗截圖
- 測試影片

重點欄位：

- `routes`：P2P、Metered 或 Relay 與連線診斷。
- `drift.averagePx`：平均位置差。
- `drift.p95Px`：95% 樣本不超過的漂移。
- `drift.maxPx`：最大位置差。
- `visual.p95JumpPx`：畫面球體單幀跳動。
- `packetSimulation`：延遲、丟包與傳送錯誤統計。

## 本機執行

```bash
npm install
npm test
npm run test:e2e
```

正式網站只有網址帶有 `e2e=1`、`testNet` 或 `netDelay` 時才會開啟測試探針；正常玩家不會被注入延遲或丟包。
