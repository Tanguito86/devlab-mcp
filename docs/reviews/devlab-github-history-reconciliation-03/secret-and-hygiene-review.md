# Secret and hygiene review

`gitleaks` was not installed and was not added. The required fallback scan covered every commit reachable from reconciled HEAD for private-key markers, named provider keys, GitHub/OpenAI/Google token prefixes, AWS variables, client-secret/private-key fields, password assignments, and bearer values.

```text
REAL_SECRETS: 0
UNRESOLVED_SECRETS: 0
FORBIDDEN_TRACKED_PATHS: 0
CURRENT_FILES_OVER_10_MIB: 0
REACHABLE_BLOBS_OVER_10_MIB: 0
UNEXPECTED_BINARY_EXTENSIONS: 0
```

Twenty privacy-keyword matches were classified as historical evidence paths, example defaults, AB-04 secret-handling contracts, or exclusion prose. `packages/android-dev-mcp/build_sb.bat` contains legacy machine-specific paths and is byte-identical in the already-published and local histories; it contains no credential or secret. It remains a non-blocking portability debt and was not modified by this reconciliation.
