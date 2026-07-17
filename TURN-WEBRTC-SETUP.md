# Bubble Island TURN / WebRTC 設定

目前網站 v4.2.0 已改成：

1. Supabase 快速配對
2. Supabase Realtime 僅交換 WebRTC 訊號
3. 遊戲資料走 WebRTC DataChannel
4. 無法直接 P2P 時，自動使用 Cloudflare Realtime TURN

## 一、在 Cloudflare 建立 TURN Key

進入 Cloudflare Dashboard 的 **Realtime → TURN**，建立一組 TURN Key。

建立後保存兩項：

- TURN Key ID（Token ID / Key ID）
- TURN Key API Token

長期 API Token 不可放進 `index.html`、JavaScript、GitHub 或聊天內容。

## 二、在 Supabase 設定 Edge Function Secrets

進入 Supabase：

**Edge Functions → Secrets**

新增：

```text
CLOUDFLARE_TURN_KEY_ID=你的 TURN Key ID
CLOUDFLARE_TURN_API_TOKEN=你的 TURN API Token
```

## 三、部署 Edge Function

程式檔已放在：

```text
supabase/functions/turn-credentials/index.ts
```

設定檔：

```text
supabase/config.toml
```

### Dashboard 部署

在 Supabase Dashboard 建立名為：

```text
turn-credentials
```

的 Edge Function，把 `index.ts` 全部內容貼入後按 **Deploy function**。

### CLI 部署

```bash
supabase login
supabase link --project-ref upnucojrpmeopdqlwzge
supabase functions deploy turn-credentials --use-api
```

## 四、測試

兩台裝置都重新開啟：

```text
https://qoo109.github.io/air/
```

確認版本為 v4.2.0，再使用不同訪客名稱按：

```text
⚡ TURN／WebRTC 快速配對
```

HUD 顯示：

- `P2P xxms`：兩台裝置直接連線
- `TURN xxms`：透過 Cloudflare TURN 中繼
- `RELAY xxms`：WebRTC 完全失敗，暫時回到 Supabase 緊急備援

## 安全原則

- Cloudflare TURN 長期 Token 只放 Supabase Secrets。
- 網頁只取得有效一小時的短效 TURN 憑證。
- 不要把 Cloudflare TURN Token、Supabase Secret key 或 service-role key 放進 GitHub Pages。
