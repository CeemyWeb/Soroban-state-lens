# Pull request review setup

The `Source integrity / Check source integrity` job runs on every PR update. It checks out the base revision, fetches the PR head as Git objects, verifies the event's exact head SHA, and scans source without executing it. It has a read-only token, installs no dependencies, and does not import PR configuration or tests. A PR cannot replace the checker used to inspect its own code.

The guard rejects runtime evaluation, remote module imports, obfuscator-style hex tables, dense executable lines, hidden direction controls, oversized or binary source, source symlinks, and heavily escaped strings. Ordinary XDR/base64 data and local imports remain allowed. This is a heuristic guard: readable malicious code and new obfuscation techniques still require review. Findings must be inspected by a maintainer; a PR cannot waive them with an inline comment or its own allowlist.

Merge this guard into the default branch before relying on its PR trigger. The first setup PR has no trusted checker on its base and needs manual review. After merging, make `Check source integrity` a required check in the `main` branch ruleset and apply it to administrators as appropriate. Keep normal PR lint/build/tests on the unprivileged `pull_request` event. Those jobs can run concurrently with this static guard; the required check protects merging, not execution of all PR tests.

Run the guard locally from a trusted checkout:

```sh
node --test scripts/check-source-integrity.test.mjs
node scripts/check-source-integrity.mjs --ref HEAD
```

To enable automatic code review, connect `Vynix-Labs/Soroban-state-lens` in the [review settings](https://app.chatgpt.com/settings/code-review). Open the repository's `Review code` settings and set `Automatic review` to `All PRs`. Choose a trigger that includes PR creation; include new pushes if the available setting supports it. Repository configuration requires GitHub push or admin permission. `AGENTS.md` supplies the repository's review rules, but does not enable the service by itself.

The official [GitHub review guide](https://learn.chatgpt.com/docs/third-party/github) describes repository and personal review settings. This repository setup does not require an API key or a privileged workflow that posts review requests.
