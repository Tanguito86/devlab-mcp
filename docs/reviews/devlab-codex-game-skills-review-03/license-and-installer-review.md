# License and installer review

The root `LICENSE` is a valid MIT license with SHA-256
`4e95cc0c558be513b19089329d5ee9725a9037c9ebb685734efbebf5d8d0dd07` and
copyright `2026 Majid Manzarpour`.

```text
ROOT_LICENSE: MIT / VERIFIED
SELECTED_TEXT_GUIDANCE: ATTRIBUTION_REQUIRED
SCORECARD_JPG_ANCHORS: EXCLUDED / INDIVIDUAL_PROVENANCE_NOT_DOCUMENTED
GLOBAL_INSTALL: REJECTED_FOR_BENCHMARK
LOAD_MODE: READ_ONLY_FROM_PINNED_CHECKOUT
```

`install.sh` copies to Codex, Claude or agents global skill directories. It
uses `rsync` or `cp`, deletes same-named destinations under `--force`, writes a
managed manifest and deletes stale manifest entries under `--prune-managed`.
It has no Windows-native implementation or destination containment/ownership
proof.

The managed manifest is unsafe for this benchmark: skipped preexisting skills
are recorded as managed, so a later prune can remove content the installer did
not create. Environment variables can also redirect global destinations. No
installer mode is needed when exact files can be read from a detached checkout.

Future substantial reuse must preserve the MIT copyright and permission notice.
This sprint copies no upstream source, image, scaffold or script into DevLab.
