# Batch build

Batch input is sorted by `assetId@version`, concurrency is bounded to 1–4, and every asset receives isolated staging. The seven-fixture mixed run returned 1 SUCCESS, 2 CHANGES_REQUIRED and 4 BLOCKED: valid, invalid spec, exceeded budget, missing factory, failed capture, critic REQUIRED, and failed dispose. The catalog batch returned 1/1 SUCCESS and reused the byte-identical Cinder artifact.
