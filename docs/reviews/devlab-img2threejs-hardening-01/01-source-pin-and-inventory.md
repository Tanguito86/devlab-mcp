# Source pin e inventario

## Autoridad externa

- Checkout: `H:\UserData\Deposito\Documents\img2threejs-intake\source`
- Remote: `https://github.com/img2threejs/img2threejs.git`
- Commit: `b604139f51d6831780240e8cf1d8b21a42401d0a`
- Estado observado: detached HEAD, limpio
- Archivos tracked: 153
- Licencia: Apache-2.0

## Hallazgos relevantes

`forge/stage3_build/generate_threejs_factory.py` interpola datos no confiables en
comentarios TypeScript en las líneas observadas 1020, 1021 y 1169. Aunque esas cadenas
estén en comentarios, saltos de línea y terminadores de comentario pueden alterar el
módulo emitido.

Hay cinco copias completas de `read_png` con la misma estrategia de acumulación IDAT e
inflado sin límites explícitos:

1. `forge/stage1_intake/build_detail_inventory.py`
2. `forge/stage1_intake/delight_albedo.py`
3. `forge/stage1_intake/extract_landmarks.py`
4. `forge/stage1_intake/extract_pbr_evidence.py`
5. `forge/stage4_review/make_comparison_sheet.py`

Existen lectores parciales adicionales para dimensiones, máscaras y métricas. No se
declaran equivalentes al parser canónico porque no decodifican la imagen completa, pero
siguen siendo entradas externas que una integración futura deberá enrutar por la misma
frontera de admisión.
