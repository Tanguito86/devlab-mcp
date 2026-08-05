# Atomic staging

Builds write under `assets/builds/staging/<build-id>/<asset>/<version>`. A READY directory is promoted with one filesystem rename. Failed builds retain a typed `staging-state.json` and never appear under canonical artifacts. An existing version with a different manifest is rejected; an identical build is reused. The first two export findings demonstrated this fail-closed behavior before the successful BUILD-A promotion.
