# Canonical specification

The authoritative renderer-independent input is
`assets/pilots/cinder-relay-drone/cinder-relay-drone.spec.json`.

`validateCinderRelayDroneSpec` enforces the exact schema recursively: unknown or
missing keys, alternate identity/seed, changed scale, silhouette, material,
damage, or lighting values fail closed. The JSON has no absolute path,
timestamp, UUID, random ID, renderer type, or Three.js object.
