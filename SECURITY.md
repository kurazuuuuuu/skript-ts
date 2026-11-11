# Security policy

## Supported versions

Only the latest release is supported. Fixes for security issues land
in a new release rather than being backported.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private
vulnerability reporting:

https://github.com/kurazuuuuuu/skript-ts/security/advisories/new

Do not open a public issue for a security problem, and do not disclose
it publicly until a fix is available.

Useful details to include:

- The skript-ts version (or commit) affected, and whether the
  transpiler, the engine jar, or both are involved.
- A minimal TypeScript script that reproduces the problem, if one
  exists.
- The impact you observed (for example: a script escaping the
  engine's file sandbox, or a crafted script crashing the server).

This is a small project maintained in spare time, so responses are
best-effort — but reports are taken seriously and will be answered.

## Scope notes

- The engine executes scripts with the server's privileges by
  design: only run scripts you trust, the same rule as for `.sk`
  files under the original Skript.
- The engine's sandboxed file core (`plugins/skript-ts/files/`) and
  its HTTP/URL policy are security boundaries; escapes from them are
  in scope for reports.
