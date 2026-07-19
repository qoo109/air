# Acceptance criteria

A Realtime fallback run passes only when both browser contexts report route `REALTIME`, transport `relay`, no connected WebRTC peer, actual `relay-game` traffic on both sides, zero Realtime send errors, sufficient active-play samples, and drift within the degraded-mode threshold.
