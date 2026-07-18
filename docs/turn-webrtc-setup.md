# Metered TURN／WebRTC 設定

目前正式版 v4.3.4 的多人連線順序：

1. Supabase 建立匿名訪客與快速配對。
2. Supabase Realtime 交換 WebRTC SDP／ICE 訊號。
3. 優先使用 WebRTC P2P DataChannel。
4. P2P 失敗時使用 Metered TURN。
5. WebRTC 無法恢復時使用 Supabase Realtime 備援。

## Metered

在 Metered TURN Server 建立應用程式與 Credential。API Key 不可放進前端或 GitHub。

Supabase Secrets 使用以下名稱：

```text
METERED_APP_NAME
METERED_API_KEY
```

`METERED_APP_NAME` 只填應用程式名稱，例如：

```text
qoo109-air
```

不要填完整網址。

## Supabase Edge Function

函式位置：

```text
supabase/functions/turn-credentials/index.ts
```

函式名稱必須是：

```text
turn-credentials
```

目前前端透過已登入的匿名使用者呼叫這個函式。Legacy JWT 驗證先保持開啟；若未來出現新格式 JWT 的 401，再把函式升級成新版 JWT 驗證後才關閉舊驗證器，不能直接公開端點。

## Supabase SQL

依序在 SQL Editor 執行：

```text
supabase/sql/leaderboard.sql
supabase/sql/multiplayer-matchmaking.sql
```

## 路由標籤

遊戲 HUD 可能顯示：

- `P2P`：兩位玩家直接連線，通常延遲最低。
- `METERED`：經過 Metered TURN 中繼。
- `RELAY`：WebRTC 無法使用，進入 Supabase 備援。

## 測試 TURN

可在雙玩家測試實驗室勾選 `force_turn`，強制略過直接 P2P：

```text
GitHub → Actions → Multiplayer E2E Lab → Run workflow
```

不要把 Metered API Key、Credential 密碼或 Supabase secret key 貼進 Issue、README、截圖或聊天內容。
