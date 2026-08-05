# 13 - Crash recovery

The adapter's test-only fault lane covers before staging, during staging, before
promotion, after the first replace, and a partial WRITE_AHEAD crash. It is not
accepted by the public Asset Bridge schema or request type. Pre-promotion failures
leave the project unchanged. The partial promotion is reported as pending and the
next governed bridge rollback restores every original blob and the baseline
fingerprint.

The adapter writes and fsyncs the manifest before promotion, fsyncs staged
files, uses atomic rename, records before/after hashes, and never claims success
for a partial state. Bridge evidence metadata is also file-fsynced and its parent
directory is synced after rename when the platform permits it. Tests are in
`toctou.test.js` and adapter transaction tests.
