# 15 - Igor and runtime

Toolchain: GameMaker-LTS2026 `2026.0.0.16`, runtime `2024.14.3.260`, installed
Igor and ProjectTool supplied explicitly by flags. No implicit path is used.

Initial, v1, v2 and post-rollback each passed TEXT, PROJECT_LOAD, COMPILE, and
RUNTIME. Runtime required a newly owned Runner plus the current version signal;
compile alone was insufficient. Captures:

- `evidence/before.png` - version 0;
- `evidence/after-v1.png` - cyan beacon and version 1;
- `evidence/after-v2.png` - magenta beacon and version 2;
- `evidence/after-rollback.png` - restored version 0.

Initial and final GameMaker/Igor/Runner PID sets were both empty. The pilot does
not compare the unrelated, naturally changing population of all non-GameMaker
system processes. Adapter tests verify timeout, cancellation, PID/start-token
ownership, nonzero exit preservation, and that a concrete foreign Runner PID
remains alive. The timeout classification was corrected so expiry during WMI
identity acquisition returns `TIMEOUT`, not `PROCESS_OWNERSHIP`.
