# Security and paths

All specs, catalogs, manifests, captures, exports, staging paths and critic bundles pass through the repository-relative path policy or `resolveInsideRoot`. Tests reject traversal with both separators, absolute and drive paths, UNC, NUL, symlink/junction escape, mixed separators, encoded traversal, ADS and Windows device aliases. Runtime networking is denied except the existing loopback capture server.
