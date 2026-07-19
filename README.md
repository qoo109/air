# 泡泡島空氣曲棍球 🏒

手機優先的網頁空氣曲棍球遊戲，支援單人模式、訪客名稱、排行榜、Supabase 快速配對、WebRTC P2P、Metered TURN 與 Realtime 備援。

- 正式網站：`https://qoo109.github.io/air/`
- 目前版本：**v5.0.0 Stable**
- 主分支：`main`
- 清理前備份：`backup-before-cleanup-2026-07-18`

## 目前保留的最近版本

| 版本 | 內容 |
|---|---|
| v5.0.0 | 低延遲頻率調整、快速斷線備援、網路品質 UI、好友房號邀請 |
| v4.3.5 | P2P／TURN／Realtime 三路 E2E 驗證與 Pages 正式部署 |
| v4.3.3 | 主場權威快照、防漂移球體同步 |
| v4.3.2 | 主場龜殼、客場旋渦殼的固定角色身分 |

舊版載入器仍保留供驗證與回溯；正式頁面改用 v5.0 編譯 Runtime，不再在玩家瀏覽器逐層抓取及套用舊補丁。

## 專案結構

```text
.
├── index.html                         # GitHub Pages 入口
├── manifest.json                      # PWA 設定
├── bubble-game-v31.js                 # 單人遊戲
├── multiplayer-v500-payload-*.js      # 壓縮後的 v5.0 Stable Runtime
├── multiplayer-v500.js                # v5.0 Runtime 啟動器
├── multiplayer-v500-ui.js             # 房號邀請與網路品質介面
├── multiplayer-v500.css               # v5.0 多人體驗樣式
├── multiplayer-v408.js                # 多人基礎引擎
├── multiplayer-v430-loader.js         # WebRTC／Metered TURN 網路層
├── multiplayer-v431-loader.js         # 120Hz 球體與平滑層
├── multiplayer-v432-loader.js         # 主客場角色層（v4.3.2）
├── multiplayer-v433-loader.js         # 權威快照防漂移層（v4.3.3）
├── multiplayer-test-hooks-v434.js     # 測試探針，正常玩家不啟用
├── docs/                              # 設定、測試與版本文件
├── supabase/                          # Edge Function 與 SQL
├── scripts/                           # Node 驗證與同步壓力測試
├── tests/e2e/                         # Playwright 雙玩家測試
└── .github/workflows/                  # GitHub Actions
```

## v5.0 多人連線

- P2P 主場快照約 40Hz，客場輸入約 60Hz。
- DataChannel 斷線約 0.9 秒後切換 Realtime 備援。
- 畫面顯示 P2P、Metered TURN 或 Realtime，以及延遲、抖動與品質分級。
- 支援 6 碼好友房號與邀請連結，不必等待隨機配對。
- 對手離線後顯示結果，並自動回到主選單。

## 常用測試

```bash
npm install
npm test
npm run test:e2e
```

- `npm test`：載入器語法、Runtime payload 完整性、補丁完整性與網路壓力情境。
- `npm run test:e2e`：建立兩個隔離手機玩家，實際登入、配對、移動球拍並輸出漂移報告。

## 文件

- [新遊戲多人連線標準建置手冊](docs/reusable-multiplayer-stack-guide.md)
- [Metered TURN／WebRTC 設定](docs/turn-webrtc-setup.md)
- [多人連線測試實驗室](docs/multiplayer-testing.md)
- [最近版本紀錄](docs/releases.md)

## 安全注意

- Supabase publishable key 可以放在前端。
- Metered API Key、Supabase secret key 只能放在 Supabase Secrets，不能提交到 GitHub。
- 正式網站正常開啟時，測試探針不會注入延遲或丟包；只有帶 `e2e=1`、`testNet` 或 `netDelay` 參數才啟用。
