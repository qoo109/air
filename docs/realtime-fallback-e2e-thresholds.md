# Realtime fallback thresholds

Primary WebRTC routes keep the strict active-play drift target of Average ≤25 px, P95 ≤50 px and Max ≤90 px. Supabase Realtime is an emergency compatibility route and uses a documented degraded-mode target of Average ≤45 px, P95 ≤90 px and Max ≤160 px under the same 60 ms delay, 20 ms jitter and 2% gameplay packet-loss simulation.
