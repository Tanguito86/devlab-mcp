# Factory design

`createCinderRelayDrone(spec, context)` is an async typed factory. The context
injects a structural Three.js runtime and fixes factory version `1.0.0`; the spec
remains independent of Three.js.

The factory returns the root, owned-resource registrations, geometry/material
statistics, world bounds, anchor points, canonical part records, capture
metadata, frame-indexed `relay-pulse`, strict geometry validation, and an
idempotent dispose handle backed by the existing `disposeModel` contract.

All transforms and node insertions are literal and stable. UUIDs are neither
read nor persisted. No loader, URL, imported geometry, texture, shader material,
clock, or random source exists in the factory.
