# Galaxy Raiders — Visual Regression Example

Pixel-diff Galaxy Raiders boss screenshots across builds.

## Setup

```bash
# From monorepo root
pnpm install && pnpm build
cd examples/galaxy-visual-regression
```

## Directory Structure

```
baseline/    ← Known-good screenshots (golden images)
actual/      ← New screenshots to compare
diffs/       ← Generated diff images (red = changed)
reports/     ← visual-results.json + visual-report.md
```

## Create Baselines

First, capture baseline screenshots of Galaxy Raiders:

```bash
# Run from this directory
mkdir -p baseline actual

# Copy your known-good screenshots as baselines
cp ../../evidence/galaxy-deep-test/boss-lv5-crabtron_canvas.png baseline/boss-lv5.png
cp ../../evidence/galaxy-deep-test/boss-lv10-serpentrix_canvas.png baseline/boss-lv10.png
cp ../../evidence/galaxy-deep-test/boss-lv20-emperor_canvas.png baseline/boss-lv20.png
```

## Run Visual Comparison

Compare new screenshots against baselines:

```bash
# Place new screenshots in actual/
# Then compare with the visual-regression-mcp

# Via folder comparison:
# visual_compare_folder --baselineDir baseline/ --actualDir actual/ --outputDir results/

# Or compare individual images:
node run-visual-test.js
```

## Expected Results

All baselines should match if the game hasn't changed. With a threshold of 5 (tolerates minor anti-aliasing differences):

```
boss-lv5:   81 KB, 360×640, 0 changed pixels, ✅ PASS
boss-lv10:  64 KB, 360×640, 0 changed pixels, ✅ PASS
boss-lv20:  90 KB, 360×640, 0 changed pixels, ✅ PASS
```

If a screenshot differs, the diff image highlights changed pixels in red.

## CI Integration

This is the natural next step after publishing — running these visual comparisons in GitHub Actions whenever Galaxy Raiders code changes.
