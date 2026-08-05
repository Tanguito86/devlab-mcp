# 12 — Process ownership

Owned records include transaction ID, PID, parent PID, executable, command
hash, OS creation token, role and exit state. The start token is always read
from the operating-system process inventory; absence of that identity is a
fail-closed ownership error, never a generated fallback. Termination requires
transaction match and live identity match; PID reuse or a different
transaction is denied.

The positive pilot attributed both Igor and its new Runner, observed the Runner
signal and ended with zero Igor/Runner. The negative compile attributed Igor
only and produced no Runner. Foreign GameMaker, Igor or Runner processes block
SAFE_WRITE without being terminated. Unit cases cover success, nonzero exit,
timeout, cancellation, foreign process survival, wrong owner and PID reuse.
