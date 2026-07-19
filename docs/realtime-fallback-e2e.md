# Realtime fallback E2E

The multiplayer browser laboratory now includes a deterministic Supabase Realtime fallback route. The test intentionally disables WebRTC, accelerates only the two connection fallback timers, applies the configured gameplay delay, jitter and packet loss to `relay-game` broadcasts, and verifies that both players remain synchronized over the relay transport.
