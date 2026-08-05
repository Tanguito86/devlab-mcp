# 10 - Version update

v2 used a new manifest, plan and binding; `bindingHashChanged` is true. Apply
returned `APPLIED`, kept the same resource name/path, produced no duplicate,
and changed only allowlisted bytes. Its fingerprint is
`03b23d3e1bb3a9b5f75e5192267b771c4898a4be51b93e30fcf05bed52cedb03`.

Igor load/compile/runtime passed and `evidence/after-v2.png` visibly shows the
magenta v2 beacon. Rollback of v2 restored the exact v1 fingerprint; rollback
of v1 restored the exact baseline.
