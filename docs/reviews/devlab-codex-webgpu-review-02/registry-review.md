# Registry review

```text
SOURCE: dgreenheck/webgpu-claude-skill
PIN: af2319bd01bb7cc881267a9ef42cafdaf5e9029d
INTEGRATION_MODE: external-curated-reference
AUTOMATIC_UPDATES: false
INSTALLED: false
ENABLED: false
EXTERNAL_CODE_EXECUTED: false
EXTERNAL_DEPENDENCIES_INSTALLED: false
```

The independent configured-checkout validation used a detached, clean
physical checkout at the exact pin. All allowlisted paths existed as regular
files and all registered SHA-256 values matched.

```text
CHECKOUT_VALIDATION: 51/51 PASS
REGISTRY_TESTS: 57/57 PASS
PATH_ESCAPE: 0
RUNTIME_DEPENDENCIES_ON_CHECKOUT: 0
SUBMODULES: 0
```

Source-id parsing, full-SHA pins, normalized origin, wildcard rejection,
duplicate-path rejection, symlink/junction containment and fail-closed policy
were rechecked. The checkout was read only; none of its code was executed.
