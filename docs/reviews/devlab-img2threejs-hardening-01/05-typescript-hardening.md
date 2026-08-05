# Contrato de hardening TypeScript

`generateSafeFactoryModule` recibe un documento validado y emite un módulo TypeScript
determinista. `validateSafeIdentifier` aplica `^[A-Za-z_$][A-Za-z0-9_$]*$`, máximo 64
caracteres y una denylist de palabras reservadas y nombres peligrosos como
`constructor`, `prototype` y `__proto__`.

El contrato rechaza caracteres NUL, texto excesivo, claves peligrosas, valores no
finitos, `-0` y colisiones de símbolos. La serialización ordena las claves de objetos y
preserva arrays. El resultado no incorpora reloj, path absoluto ni
estado global.
