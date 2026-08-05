# Examples

The JSON capsules are stored here for inspection, but their resource paths are not relative to this directory. DevLab defines one base: the **experience distribution root supplied explicitly by the consumer**.

For the packaged examples that root is the `topdown-shooter-kit` package root, so:

```text
distribution root + fixtures/local-asset-registry-v1.json
distribution root + fixtures/provenance.json
```

Consumers must pass the same root to their local loader. Resolving against the location of `examples/experience-v2-*.json` is invalid.
