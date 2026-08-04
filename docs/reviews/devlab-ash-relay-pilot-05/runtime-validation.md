# ASH RELAY runtime validation

## Result

The definitive runtime suite is:

```text
runtime-gauntlet-r3-final/summary.json
SHA256: 8dd10dc7d9eaca23a645215d9cefe8818513b7bc5e800ac5351fe9d0d5e55878
STATUS: PASS
```

| Gate | Result |
| --- | --- |
| native hardware WebGPU | PASS |
| desktop controls | PASS |
| portrait touch controls | PASS |
| pause/resume | PASS |
| performance | PASS |
| lifecycle 10 cycles | PASS |
| controlled seed sensitivity | PASS |
| resource stability | PASS |
| resize matrix | PASS |
| blocked external requests | 0 |
| console errors | 0 |
| page errors | 0 |

## Contractual runtime

```text
BROWSER: Chromium 148.0.7778.96
EXECUTABLE:
H:/DevData/ms-playwright/chromium-1223/chrome-win64/chrome.exe
BROWSER_SHA256:
290fa7018fda22c52ada5eddb0113baf3ebc41fd0fde6085eddb19793606c635
BACKEND: native-webgpu
ADAPTER_VENDOR: nvidia
ADAPTER_ARCHITECTURE: turing
FALLBACK_ADAPTER: false
SOFTWARE_RENDERER: false
```

The runner attests the exact browser before opening the game, serves only the
final dist tree over ephemeral loopback, and rejects non-loopback page
requests. The invoked dist tree is
`0528cd921e83a8ceca22e08d024abb77cf0a75368dc3079ad8033ecf3950746b`.

## Controls

At 1280x720, trusted Enter, W, pointer movement, left mouse, and Escape inputs
produced movement, one new shot, and observed pause/resume. At 390x844,
Chromium mobile/touch emulation displayed both touch surfaces; CDP trusted
touch events produced movement, one shot, and pause/resume.

`controls.json` SHA-256:
`7c25bd1c2d000da4aac3bc9786aac4798ddad9acb20449acabb6d334c110769e`.
Measured movement was 0.215 desktop and 0.338 mobile world units. Approximate
input observations were 20.177 ms for desktop attack and 56.941 ms for touch
attack. Touch movement observation was 186.988 ms; it is a harness response
proxy, not device end-to-end latency.

## Resize and presentation

`resize-final/resize.json` passed 320x568, 720x1280, 960x540, and 1600x900.
Every row confirmed canvas dimensions, camera aspect, render-target sizing,
bounded DPR, and a valid capture, with no warning. SHA-256:
`dd6279c98c144992bf49926174b0658d2b8a8eff14369503455188d84fce00be`.

The runtime initialized Three.js `WebGPURenderer` on the native adapter and
rendered the TSL-powered node/core/conduit and danger effects visible in the
capture matrix. No WebGL or software fallback is accepted.
