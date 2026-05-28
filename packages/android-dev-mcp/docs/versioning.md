# Versioning Policy

`android-dev-mcp` follows semantic versioning for the MCP API and package metadata.

## Compatibility Rules

Patch releases:

- Fix bugs.
- Improve error messages.
- Improve docs.
- Add tests or internal validation.
- Do not remove tools or required inputs.

Minor releases:

- Add new optional inputs.
- Add new tools.
- Add new output fields or extra readable lines.
- Add new workflow capabilities that preserve existing workflows.

Major releases:

- Rename or remove tools.
- Remove or change required inputs.
- Change existing input semantics.
- Replace the stdio MCP transport.
- Change generated artifact layout in a way that breaks existing automation.

## MCP API Contract

The stable contract is documented in [MCP API Contract](api-contract.md).

Existing tool names are treated as stable public API. New tools should be additive, and existing tools should prefer optional inputs over breaking changes.

## Deprecations

Deprecated behavior should remain available for at least one minor release when practical. Documentation should include:

- What is deprecated.
- Replacement behavior.
- Earliest version where removal may happen.

## Current Stability

The project is pre-1.0 but treats the current MCP tool names and common inputs (`app`, `deviceId`, `outputPath`) as compatibility-sensitive.
