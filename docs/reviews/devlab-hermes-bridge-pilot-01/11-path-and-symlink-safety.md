# 11 — Path and symlink safety

Rejected cases: traversal, absolute path, UNC, alternate drive, mixed
separators, NUL, ADS, encoded traversal, empty/dot segments, reserved Windows
devices, excessive depth/length and file-tree limit. Every existing segment is
checked with `lstat`; symlinks/junctions in the project tree fail closed.

Spaces and Unicode are supported. The real pilot ran from `Mi Proyecto Test ñ`.
Only `.gml`, `.yy`, `.yyp`, and `.json` may be written, and only when present
in both the plan allowlist and apply request.
