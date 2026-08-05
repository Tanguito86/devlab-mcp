# Geometry budget

The blockout uses ten locally created primitive geometries. Strict validation
covers finite and invertible world matrices, positive scale, nonempty bounded
geometry, position/normal attributes, index range, finite attributes, explicit
ownership/material names, attachment, unique names, and every canonical part ID.

Acceptance budgets are enforced in tests: triangles `<=30000`, draw calls
`<=16`, materials `<=8`, textures `<=4`, internal lights `<=2`, and asset nodes
`<=140`. Target-budget excess is non-blocking `OPTIONAL`; absolute-budget excess
is `REQUIRED`.
