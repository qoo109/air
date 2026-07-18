# 版本保留紀錄

專案只在主要文件中保留最近三個正式版本，避免根目錄累積大量舊快照。

## v4.3.4 — 自動測試實驗室

- Playwright 雙玩家手機模擬
- 延遲、抖動與丟包注入
- 球體漂移 JSON 報告
- Trace、截圖與失敗影片
- GitHub Actions 自動驗證

## v4.3.3 — 權威快照防漂移

- 主場作為球體權威來源
- 客場使用快照插值
- 取消長距離球體預測
- 限制額外推算時間
- 降低漂移、回拉與錯誤碰撞

## v4.3.2 — 固定雙角色

- 主場固定使用綠色龜殼
- 客場固定使用橘色旋渦殼
- 兩台裝置看到一致角色身分
- HUD 頭像與主客場標籤同步

## 已移除的舊多人快照

```text
multiplayer-v40.js
multiplayer-v404.js
multiplayer-v407.js
multiplayer-v409.js
multiplayer-v410-loader.js
multiplayer-v411-loader.js
multiplayer-v420-loader.js
multiplayer-v421-loader.js
multiplayer-v422-loader.js
```

## 仍保留的內部依賴

以下檔案名稱雖帶舊版號，但仍是目前 v4.3.4 執行鏈的一部分，不能直接刪除：

```text
multiplayer-v408.js
multiplayer-v430-loader.js
multiplayer-v431-loader.js
multiplayer-v432-loader.js
multiplayer-v433-loader.js
```

其中 v432、v433 對應最近保留版本；v408、v430、v431 是基礎引擎、網路層與球體物理層。

## 清理規則

- 每次推出新正式版，只保留目前版與前兩版的說明。
- 已被 `index.html`、測試或其他載入器引用的檔案，不可只看版號直接刪除。
- 刪除前先建立備份分支。
- 測試報告放在 GitHub Actions Artifact，不提交到主分支。
