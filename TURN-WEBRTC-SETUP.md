# Bubble Island Metered TURN / WebRTC 設定

目前網站 v4.2.1 使用：

1. Supabase 快速配對
2. Supabase Realtime 僅交換 WebRTC 訊號
3. 遊戲資料走 WebRTC DataChannel
4. 無法直接 P2P 時，自動使用 Metered Open Relay TURN

## 一、在 Metered 建立免費 TURN Credential

登入 Metered Dashboard 後進入 **TURN Server**。

第一次使用可按：

```text
Click Here to Generate Your First Credential
```

或按：

```text
Add Credential
```

建立後記下：

- Metered App Name：網址中的 `<appname>`
- TURN Credential API Key：Credential 旁的 **Show API Key**

不要使用 Dashboard → Developers 裡的 Secret Key；本專案只需要 Credential API Key。

## 二、在 Supabase 設定 Edge Function Secrets

進入 Supabase：

**Edge Functions → Secrets**

新增：

```text
METERED_APP_NAME=你的 Metered App Name
METERED_API_KEY=你的 TURN Credential API Key
```

## 三、部署 Edge Function

程式檔：

```text
supabase/functions/turn-credentials/index.ts
```

設定檔：

```text
supabase/config.toml
```

### Dashboard 部署

在 Supabase Dashboard 建立或更新名為：

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

確認版本為 v4.2.1，再使用不同訪客名稱按：

```text
⚡ Metered TURN 快速配對
```

HUD 顯示：

- `P2P xxms`：兩台裝置直接連線
- `METERED xxms`：透過 Metered Open Relay TURN 中繼
- `RELAY xxms`：WebRTC 完全失敗，暫時回到 Supabase 緊急備援

## 安全原則

- Metered Credential API Key 是 Credential scoped；目前仍由 Supabase Edge Function 代為取得 ICE Servers。
- 不要把 Metered Secret Key、Supabase Secret key 或 service-role key 放進 GitHub Pages。
- 若 Credential 外洩或不再使用，可在 Metered Dashboard 刪除並重新建立。
