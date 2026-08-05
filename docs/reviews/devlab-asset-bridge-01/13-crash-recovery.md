# 13 - Crash recovery

Fault injection covers before staging, during staging, before promotion, after
the first replace, and a partial WRITE_AHEAD crash. Pre-promotion failures leave
the project unchanged and map to `APPLY_FAILED_RECOVERED`. The partial promotion
is reported as pending and the next governed rollback restores every original
blob and the baseline fingerprint.

The adapter writes and fsyncs the manifest before promotion, fsyncs staged
files, uses atomic rename, records before/after hashes, and never claims success
for a partial state. Tests are in `toctou.test.js` and adapter transaction tests.
