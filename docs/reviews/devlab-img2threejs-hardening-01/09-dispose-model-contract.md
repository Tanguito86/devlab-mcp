# Contrato `disposeModel`

Todo recurso se registra con categoría y ownership:

- `OWNED`: se libera exactamente una vez, deduplicado por identidad;
- `SHARED`: se conserva y se contabiliza;
- `EXTERNAL`: se conserva y se contabiliza.

Categorías cubiertas: geometries, materials, textures, render targets, skeletons y
custom resources. Además se detienen mixers, se remueve cada listener y se desprenden
referencias de escena. Los errores se acumulan sin impedir el cleanup restante. Una
segunda invocación es un no-op observable mediante `alreadyDisposed`. El tracking usa
identidad de root y de cada recurso, no la identidad del wrapper. Un dispose fallido no
se marca completo: el recurso pendiente vuelve a intentarse y los recursos ya liberados
no se repiten. Los modelos sin arrays de recursos también tienen ciclo idempotente.
