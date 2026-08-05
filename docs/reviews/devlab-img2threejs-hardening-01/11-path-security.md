# Seguridad de rutas

`assertSafeRelativePath` y `resolveInsideRoot` rechazan rutas vacías, absolutas, drive
letters, UNC, NUL, separadores ambiguos, `.` y `..`. La ruta resuelta debe permanecer
dentro del root autorizado. También se recorren los segmentos existentes y se rechaza
cualquier symbolic link o junction para impedir escapes posteriores a la normalización.
La política ASCII portable también rechaza ADS (`:`), percent-encoding, separadores
mixtos, nombres de dispositivo Windows y colisiones case-insensitive entre outputs.

El root debe existir, ser directorio real y no symlink/junction. Para la escritura existe
`writeArtifactFileExclusive`: revalida el parent real y abre el destino con create
exclusive y no-follow. La política no autoriza roots modificables por un atacante; el
coordinador conserva ownership durante la operación.

Precondición de seguridad: builders y critics no reciben permiso de escritura sobre el
root ni sus parents. En POSIX la API rechaza roots group/world-writable. En Windows,
donde Node no ofrece `openat` ni verificación ACL portable, el coordinador debe crear el
root con ACL exclusiva y mantener esa ACL durante resolve+write. Sin esa precondición,
la biblioteca no afirma resistencia a sustitución concurrente de un parent por junction.

Los manifests y captures solo guardan paths relativos normalizados con `/`; nunca
persisten el root absoluto del host.
