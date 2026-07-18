# 泡泡島多人連線測試實驗室

## 測試分成兩層

### 1. 每次更新自動執行

工作流程：`Validate multiplayer engine`

會檢查：

- 所有多人載入器與測試探針的 JavaScript 語法
- v4.3.3 巢狀補丁是否能完整套用到基礎引擎
- 20ms、50ms、80ms、120ms 四種網路情境
- 抖動、丟包與封包亂序
- 平均球體誤差、P95 誤差、最大誤差與畫面跳動

產物：`puck-sync-matrix-<run number>`

其中包含 `puck-sync-matrix.json`。

### 2. 兩個虛擬手機玩家實際對打

工作流程：`Multiplayer E2E Lab`

操作：

1. 開啟 GitHub 儲存庫的 **Actions**。
2. 左側選擇 **Multiplayer E2E Lab**。
3. 按 **Run workflow**。
4. 設定延遲、抖動、丟包與是否強制 Metered TURN。
5. 測試完成後下載 `multiplayer-e2e-report-<run number>`。

預設參數：

- 延遲：60ms
- 抖動：20ms
- 丟包：2%
- 強制 TURN：關閉
- 量測時間：15000ms

測試會建立兩個互相隔離的手機瀏覽器環境：

- iPhone 13 模擬玩家
- Pixel 7 模擬玩家

兩邊會各自建立匿名帳號、進入配對、移動球拍並收集球的位置。

## 報告內容

`multiplayer-drift-report.json` 包含：

- 主場與客場角色、頭像
- P2P、Metered 或 Relay 路由
- RTT 與連線診斷
- 平均球體位置差
- P95 球體位置差
- 最大球體位置差
- 畫面單幀跳動
- 延遲、抖動、丟包模擬統計
- 測試期間的原始樣本

失敗時還會保留：

- Playwright Trace
- 失敗畫面截圖
- 測試影片
- HTML 測試報告

## 建議測試組合

| 情境 | 延遲 | 抖動 | 丟包 | 強制 TURN |
|---|---:|---:|---:|---|
| 同一個 Wi-Fi | 20 | 5 | 0 | 否 |
| 一般 4G／5G | 60 | 20 | 2 | 否 |
| 擁塞行動網路 | 100 | 35 | 4 | 否 |
| Metered TURN 驗收 | 60 | 20 | 2 | 是 |

強制 TURN 會使用 Metered 流量額度，不需要每次都開啟。

## 本機執行

```bash
npm install
npx playwright install chromium
npm run test:sync
npm run test:e2e
```

自訂網路：

```bash
NET_DELAY=80 NET_JITTER=25 NET_LOSS=3 npm run test:e2e
```

強制 Metered TURN：

```bash
FORCE_TURN=true npm run test:e2e
```

## 網頁測試參數

測試探針只有在 URL 帶有測試參數時才會啟動，正常玩家不會受到影響。

```text
?e2e=1&netDelay=80&netJitter=25&netLoss=3
```

也支援簡寫：

```text
?testNet=80,25,3
```
