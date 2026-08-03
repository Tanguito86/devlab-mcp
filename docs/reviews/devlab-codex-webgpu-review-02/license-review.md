# License review

The source declares MIT in its README and plugin metadata, but the pinned tree
contains no material `LICENSE` or `COPYING` file. Metadata does not substitute
for material license text.

```text
DECLARED_LICENSE: MIT
LICENSE_FILE_PRESENT: false
LICENSE_STATUS: UNRESOLVED
SUBSTANTIAL_REUSE_AUTHORIZED: false
```

The four fixture implementations were compared read-only against all 23
verified reference files using eight-token shingles. The first post fixture
retained excessive structural similarity despite a low numeric score and was
rewritten. The final maximum overlap was:

```text
OWN_FILES: 4
REFERENCE_FILES: 23
MAX_8_TOKEN_SHINGLE_OVERLAP: 1.8450%
MAX_PAIR: threejs-webgpu-post/main.js vs examples/post-processing.js
CLASSIFICATION: standard imports and API expressions only
```

No source file, rule, template or example from the external checkout was
copied into the repository.
