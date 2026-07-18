# 泡泡島空氣曲棍球 🏒

手機優先的網頁空氣曲棍球遊戲，支援單人模式、訪客名稱、排行榜、Supabase 快速配對、WebRTC P2P、Metered TURN 與 Realtime 備援。

- 正式網站：`https://qoo109.github.io/air/`
- 目前版本：**v4.3.4**
- 主分支：`main`
- 清理前備份：`backup-before-cleanup-2026-07-18`

## 目前保留的最近三版

| 版本 | 內容 |
|---|---|
| v4.3.4 | 雙玩家 Playwright 實驗室、延遲／抖動／丟包模擬、漂移報告 |
| v4.3.3 | 主場權威快照、防漂移球體同步 |
| v4.3.2 | 主場龜殼、客場旋渦殼的固定角色身分 |

更舊的獨立多人引擎與 v4.1／v4.2 快照已移除。`multiplayer-v408.js`、`multiplayer-v430-loader.js`、`multiplayer-v431-loader.js` 是目前引擎仍需要的內部基礎層，不視為可執行的舊版快照。

## 專案結構

```text
.
├── index.html                         # GitHub Pages 入口
├── manifest.json                      # PWA 設定
├── bubble-game-v31.js                 # 單人遊戲
├── multiplayer-v408.js                # 多人基礎引擎
├── multiplayer-v430-loader.js         # WebRTC／Metered TURN 網路層
├── multiplayer-v431-loader.js         # 120Hz 球體與平滑層
├── multiplayer-v432-loader.js         # 主客場角色層（v4.3.2）
├── multiplayer-v433-loader.js         # 權威快照防漂移層（v4.3.3）
├── multiplayer-test-hooks-v434.js     # v4.3.4 測試探針，正常玩家不啟用
├── styles／CSS 版本檔                  # 目前頁面仍載入的視覺層
├── docs/
│   ├── reusable-multiplayer-stack-guide.md # 新遊戲可重用的完整多人建置手冊
│   ├── turn-webrtc-setup.md            # TURN 與 Edge Function 設定
│   ├── multiplayer-testing.md          # 自動測試操作
│   └── releases.md                     # 最近三版紀錄
├── supabase/
│   ├── config.toml
│   ├── functions/turn-credentials/     # TURN 憑證 Edge Function
│   └── sql/                            # 配對與排行榜 SQL
├── scripts/                            # Node 驗證與同步壓力測試
├── tests/e2e/                          # Playwright 雙玩家測試
└── .github/workflows/                  # GitHub Actions
```

## 常用測試

```bash
npm install
npm test
npm run test:e2e
```

- `npm test`：載入器語法、補丁完整性、四種網路壓力情境。
- `npm run test:e2e`：建立兩個隔離手機玩家，實際登入、配對、移動球拍並輸出漂移報告。

## 文件

- [新遊戲多人連線標準建置手冊](docs/reusable-multiplayer-stack-guide.md)
- [Metered TURN／WebRTC 設定](docs/turn-webrtc-setup.md)
- [多人連線測試實驗室](docs/multiplayer-testing.md)
- [最近三版紀錄](docs/releases.md)

## 安全注意

- Supabase publishable key 可以放在前端。
- Metered API Key、Supabase secret key 只能放在 Supabase Secrets，不能提交到 GitHub。
- 正式網站正常開啟時，測試探針不會注入延遲或丟包；只有帶 `e2e=1`、`testNet` 或 `netDelay` 參數才啟用。
