# DEVLAB-THREEJS-GAME-SKILLS-AB-04A — Contrato canónico

## Fuente única de verdad

`benchmarks/threejs-game-skills-ab/benchmark-contract.json` es la única fuente
mantenida manualmente para la configuración compartida. El prompt, los gates y
las policies de ambas piernas se derivan de ese JSON y el preflight falla si
alguno difiere de su renderizado exacto.

El runbook, el schema de resultados, la rúbrica, la source policy, el manifest
de guidance y el scaffold son consumidores o entradas hash-locked; ninguno
puede redefinir valores compartidos del contrato.

## Snapshot final de AB-04A

```text
CONTRACT_VERSION: ab04-v2
CONTRACT_SHA256_CANONICAL_LF: 852676a9255dc01c32828100b8b327bab9337579a43bc4e226be9e8de3f43482
SOURCE_POLICY_SHA256_CANONICAL_LF: 500cde0e44a40d5a11f920ca08a6b1ca4b22f2e7c6479d961fc794c0540248f7
GUIDANCE_MANIFEST_SHA256_CANONICAL_LF: 443f510cd4021cc43f0a0d0a53a6f40faad34f45767d6137c6d1ef23c93037ee
RESULT_SCHEMA_SHA256_CANONICAL_LF: 4b0f6ce7fc706765ea103b45d06c30d3b1ed68a3254c2a69bb27836a36d1ca39
SCORING_RUBRIC_SHA256_CANONICAL_LF: 4e5576615370283d28be87ec1e0d705a3ff1c7bc4bf0efc070dbe77cb49c8a87
SCAFFOLD_TREE_SHA256: c085bed4d3b3c52fc6d87eab44e0a9ee54cdf3891d5ba59154a57d16cf363908
SOURCE_HEAD: 7221c1f4a6d2ae189a4d85d058d24f3228499d46
SOURCE_ALLOWLIST: 25/25 PASS
```

La fuente externa fue verificada detached, limpia y en el pin exacto. Los 25
archivos permitidos son regulares, contenidos en el checkout y coinciden con
sus hashes LF canónicos. El scaffold interno contiene exactamente 22 archivos
y su árbol coincide con el hash contractual.

## Política de hash y snapshots

Los textos se validan como UTF-8 sin BOM, normalizando CRLF/CR a LF antes de
SHA-256. Los binarios se hashean sobre bytes originales. Los árboles usan
rutas seguras ordenadas, tamaño, tipo y hash por archivo. Symlinks, junctions,
tipos irregulares y escapes de root se rechazan.

El verificador lee una sola vez y deep-freeze los snapshots del contrato,
prompt, gates, policies, schema, rúbrica, source policy y manifest. Todas las
operaciones posteriores reutilizan esos mismos bytes autenticados; no reabren
un archivo de control durante la decisión.

## Resultados y decisión

El schema exige evidencia tipada y completa: contrato, prompt, rúbrica, gates,
policy, manifest, capturas PNG/RGBA, bot runs, las cinco familias de performance
(`idle`, `encounter-normal`, `stress`, `boss`, `mobile`), logs y reporte final.
El verificador comprueba formatos, hashes, estructura PNG, longitudes RGBA,
semántica JSON, attestation de runtime, gates y scoring; una pierna inelegible
no puede puntuarse ni compararse.

La identidad del runtime incluye Chromium `148.0.7778.96`, el hash de su
ejecutable y la clausura local completa del arnés de captura (`capture.js`,
`browser-runtime.js`, `server.js` y `contract.js`). El smoke autentica esos
cuatro archivos antes de importarlos y comprueba la identidad observada del
navegador, el backend y WebGPU contra el contrato.

La clausura ejecutable también incluye Playwright `1.60.0` y
playwright-core `1.60.0`. El contrato fija sus `package.json`, conteos y hashes
de árbol completos; el smoke verifica la resolución dentro del store pnpm, los
entrypoints realmente usados y la invariancia de ambos paquetes antes y después
de las capturas.

La distribución Chromium tampoco se reduce al hash de `chrome.exe`: revision
`chromium-1223`, 308 archivos y 432.272.872 bytes quedan ligados al árbol
`bfd9c556552c637ceee2cf808aa1b5984da29f874965f0fd99b42326b3110fa0`.
El ejecutable observado debe resolver dentro de esa distribución autenticada,
que vuelve a hashearse después de las capturas.

La rúbrica define seis dominios normalizados, total ponderado y `delta = B-A`.
La decisión es inequívoca:

- gana B si `delta >= 8`;
- gana A si `delta < -3`;
- resultado inconcluso si `-3 <= delta < 8`;
- cualquier regresión P0/P1 invalida la comparación.

## Guidance de LEG_B

LEG_B solo puede pedir un archivo allowlisted mediante el broker. Cada lectura
queda ligada a pair, run, LEG_B, secuencia, contrato, source HEAD, manifest,
ruta y hash, y recibe HMAC-SHA256 con una clave de 32 bytes propiedad del
coordinador. `verify-result` exige el ledger confiable del coordinador, su copia
exacta en la evidencia, todos los receipts en orden y la misma clave.

AB-04A implementa y prueba este protocolo, pero no afirma que dos directorios
hermanos sean una sandbox. El futuro ejecutor de AB-04 debe proteger la clave y
el ledger con ACL/contención real, negar acceso directo al checkout y aplicar
egress OS-level antes de iniciar builders.

## Reanudación

`resumption-instructions.md` conserva deliberadamente `<commit 04A>` porque un
commit no puede incluir su propio hash. El SHA real se entrega tras crear el
único commit y hacer el fast-forward autorizado. Antes de reanudar AB-04 se
debe ejecutar el preflight desde ese HEAD limpio.
