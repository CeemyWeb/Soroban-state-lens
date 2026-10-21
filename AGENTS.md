# Repository guidance

Use the concrete domain and wire types for known values. Treat untyped RPC responses as external data until validated. Preserve existing user work and keep changes scoped to the request.

## Code Review Rules

### Executable configuration and dependencies

Flag obfuscated code, encoded executable payloads, runtime evaluation, remote script/module loading, or unexpected process creation in source, tests, install scripts, and build configuration. XDR/base64 fixtures and WASM metadata are legitimate data; trace whether decoded bytes reach execution before reporting them. Configuration changes must be readable and relevant to the PR's stated purpose.

### PR and CI authority

PR source must never execute with maintainer credentials. The source-integrity workflow runs the trusted base checker and inspects PR Git blobs as data. Flag changes that execute PR-controlled scripts from a privileged event, disable the guard, widen token permissions, or introduce secret access without a demonstrated requirement.

### Product boundaries

Review RPC request envelopes against the actual wire contract and test real worker serialization for structured decoder values. Keep network and contract identity attached to persisted snapshots, specs, and watchlists. Mocked RPC success alone does not establish interoperability.
