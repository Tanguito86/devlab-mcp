# @tanguito/visual-regression-mcp

MCP server for visual regression testing — pixel comparison, diff generation, and markdown reporting.

## Tools

| Tool | Description |
|------|-------------|
| `visual_compare_images` | Compare two PNG images pixel-by-pixel |
| `visual_create_baseline` | Copy an image as a baseline reference |
| `visual_compare_folder` | Compare all images in two directories |
| `visual_generate_report` | Generate markdown report from results JSON |

## Quick Start

```bash
pnpm build
pnpm test
pnpm run doctor
```

## Usage

### Compare two images

```bash
# Via MCP tool
visual_compare_images \
  --baselinePath baseline/menu.png \
  --actualPath screenshots/menu.png \
  --threshold 5 \
  --outputDiffPath diffs/menu-diff.png
```

Output:
```
Comparison: baseline/menu.png vs screenshots/menu.png
Dimensions: 360 × 640
Total pixels: 230,400
Changed pixels: 1,200
Percent changed: 0.52%
Status: ✅ PASS (threshold: 5)
Diff saved: diffs/menu-diff.png
```

### Compare entire folders

```bash
visual_compare_folder \
  --baselineDir baselines/ \
  --actualDir screenshots/ \
  --outputDir results/ \
  --threshold 5
```

This compares every `.png`/`.jpg` in `baselineDir` against matching filenames in `actualDir`, generates diff images for changed ones, and produces `visual-results.json` + `visual-report.md`.

## Pixel Comparison

- **Per-channel delta** — each R, G, B, A channel is compared independently
- **Threshold:** 0–255 (0 = exact match, 5 = tolerate minor anti-aliasing, 255 = everything is "same")
- **Diff output:** Changed pixels are red, unchanged are grayscale
- **Size mismatch:** If dimensions differ, the comparison fails (100% changed)

## Integration with browser-dev-mcp

1. Capture baseline screenshots with `browser_screenshot_canvas`
2. Capture new screenshots after changes
3. Run `visual_compare_folder` to detect regressions
4. Read the markdown report

See `examples/galaxy-visual-regression/` for a complete example using Galaxy Raiders boss screenshots.

## Architecture

- **Zero native dependencies** — pure Node.js PNG parsing (no sharp, no imagemagick)
- **Shared contracts** from `@tanguito/devlab-shared` (textResponse, RegisterTool)
- **MCP SDK** for tool registration and stdio transport

## License

MIT
