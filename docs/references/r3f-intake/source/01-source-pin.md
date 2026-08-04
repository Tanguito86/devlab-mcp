# 01 — Source pin

Repositorio: https://github.com/pmndrs/react-three-fiber
PIN: `0a107412ac64667b1908422e859447952f57feef`
SHA corto: `0a107412`

## Verificación del checkout

| Chequeo | Resultado |
|---|---|
| HEAD exacto | `0a107412ac64667b1908422e859447952f57feef` = pin ✅ |
| Detached HEAD | ✅ (`git symbolic-ref -q HEAD` falla) |
| Working tree | limpio (`git status --porcelain` = 0) |
| Origin | `https://github.com/pmndrs/react-three-fiber.git` (fetch+push) |
| Submodules | 0 (sin `.gitmodules`, index sin modo 160000) |
| Git LFS | no configurado (sin `.gitattributes` LFS) |
| Symlinks | 0 en index (modo 120000) y 0 en filesystem |
| Junctions/reparse | ninguno detectado en el checkout (ruta normal) |
| Hooks no-sample | 0 |
| Tracked files | 187 |
| Tamaño (sin .git) | ~27.6 MB |

## Identidad del commit

- Author: Kris Baumgartner <kjbaumgartner@gmail.com>
- Fecha: Fri Jul 31 12:11:23 2026 -0400
- Subject: `RELEASING: Releasing 2 package(s)`
- Releases del commit: `@react-three/fiber@9.7.0`, `@react-three/test-renderer@9.1.1` — **coincide exactamente con EXPECTED_RELEASE** ✅
- Toques del commit: 7 archivos (2 CHANGELOG, 2 package.json, 3 changesets consumidos)

## Archivos generados

- `source-pin.txt` — el SHA completo
- `git-show.txt` — `git show --stat --format=fuller HEAD`
- `git-status.txt` — `git status`
- `git-tree.txt` — `git ls-tree -r --long HEAD` (187 entradas)
- `tracked-files.txt` — `git ls-files` (187 paths)
- `tracked-file-hashes.sha256` / `03-file-hashes.sha256` — SHA-256 de los 187 tracked files

El pin corresponde al release 9.7.0/9.1.1 publicado; no se avanzó a master ni a commits posteriores.
