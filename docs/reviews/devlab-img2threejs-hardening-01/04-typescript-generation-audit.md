# Auditoría de generación TypeScript

El upstream serializa la mayoría de los valores de código mediante JSON, pero deja tres
comentarios construidos con interpolación directa. Los comentarios no son una frontera
segura: `\n`, `\r`, `*/`, backticks o texto extremadamente largo pueden cambiar la forma
del programa o agotar recursos.

La implementación DevLab adopta estas reglas:

- solo identificadores ECMAScript ASCII de longitud acotada;
- palabras reservadas rechazadas;
- colisiones detectadas después de la normalización;
- todos los datos en literales JSON canónicos;
- números exclusivamente finitos; `-0` se rechaza explícitamente;
- comentarios constantes, nunca derivados de inputs;
- tamaño total de input y output acotado;
- profundidad 32, 50.000 nodos, arrays 10.000 y objetos 5.000 keys como máximos;
- solo records planos/null-prototype, sin accessors ni symbol keys;
- prohibidos `eval` y `new Function`.
