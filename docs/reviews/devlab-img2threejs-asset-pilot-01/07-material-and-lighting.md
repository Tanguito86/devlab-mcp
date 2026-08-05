# Material and lighting

Five explicit `MeshStandardMaterial` instances are used: charcoal metal,
oxidized steel, ember core, sensor cyan, and maintenance marker. Every material
sets finite color/metalness/roughness values; emissive intensities are bounded.
There are no textures, shader materials, arbitrary shaders, PMREM, or HDRI.

The capture scene owns a reproducible warm key, cool fill, ember rim, bounded
hemisphere light, solid neutral background, disabled shadows, and a brighter
neutral material-diagnostic background. Lights are capture infrastructure, not
asset-owned internal lights.
