# ASH RELAY performance

## Final measurements

`runtime-gauntlet-r3-final/performance.json` passed all six states. SHA-256:
`0654e538d2c189676f48fc77b55d2e44cdd8dac91e8a0dc7210e18f43320033a`.

| State | CPU p50/p95/p99 ms | Draws | Triangles | Geometries | Textures | Programs | Heap delta bytes | Input proxy ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| idle | 2.8 / 4.0 / 4.4 | 109 | 12,238 | 57 | 4 | 14 | -7,461,211 | 31.6 |
| encounter-1 | 3.2 / 4.2 / 4.6 | 149 | 14,318 | 72 | 4 | 14 | +2,250,272 | 12.5 |
| encounter-2 | 3.2 / 4.2 / 5.0 | 163 | 15,512 | 85 | 4 | 14 | -12,730,736 | 14.7 |
| boss | 3.1 / 4.5 / 5.0 | 155 | 16,002 | 89 | 4 | 15 | +932,540 | 6.1 |
| stress | 3.3 / 4.4 / 4.9 | 164 | 18,880 | 94 | 4 | 15 | +857,072 | 16.8 |
| mobile | 3.0 / 4.2 / 4.6 | 139 | 12,828 | 94 | 4 | 15 | -834,608 | 25.8 |

Each state used 30 warm-up and 120 sampled frozen frames. All had renderer
resource growth `0/0/0` for geometries/textures/programs. rAF p95 was 8.4 ms
in every state. The enforced targets were CPU p95 <=16.67 ms, CPU p99 <=33.34
ms, and rAF p95 <=34 ms.

## Interpretation boundary

The CPU distribution measures `performance.now` around awaited
`renderOnce`. The rAF distribution is sampled while simulation is frozen, and
input latency is dispatch-to-next-observed-fixed-step. These are controlled
proxies, not GPU timestamp queries or end-to-end live-device latency. The
results establish ample CPU headroom and bounded renderer resources on the
contractual RTX 2060 path; they do not claim a complete GPU frame-time profile.
