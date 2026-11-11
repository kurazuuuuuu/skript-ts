# Security policy

## Supported versions

Only the latest release is supported. Fixes for security issues land
in a new release rather than being backported.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private
vulnerability reporting:

https://github.com/kurazuuuuuu/skript-ts/security/advisories/new

Do not open a public issue for a security problem, and do not disclose
it publicly until a fix is available. If the private reporting form is
unavailable to you, open a public issue that contains no details and
ask for a private channel.

Useful details to include:

- The skript-ts version (or commit) affected, and whether the
  transpiler, the engine jar, or both are involved.
- A minimal TypeScript script that reproduces the problem, if one
  exists.
- The impact you observed (for example: a script escaping the
  engine's file sandbox, or a crafted script crashing the server).

This is a small project maintained in spare time, so responses are
best-effort — but reports are taken seriously and will be answered.

## Verifying a release

Release artifacts are published by the release workflow with a
signed build-provenance attestation. To verify a downloaded file:

```sh
gh attestation verify skript-ts.jar \
  --repo kurazuuuuuu/skript-ts \
  --signer-workflow kurazuuuuuu/skript-ts/.github/workflows/release.yml \
  --source-ref refs/tags/v2026.11.11
```

Replace the file name and the tag with the release you downloaded.
Pinning the signer workflow and the source ref matters: it proves
the file was built by this repository's release workflow from that
tag, not merely attested by someone. Each release also carries a
`sha256sums-<version>.txt` for plain checksum comparison
(`sha256sum -c sha256sums-<version>.txt`); the checksum file is
itself attested the same way, but treat the attestation as the
primary check — a checksum file sitting next to the artifacts can
only detect corruption, not substitution.

## Scope notes

- The engine executes scripts with the server's privileges by
  design: only run scripts you trust, the same rule as for `.sk`
  files under the original Skript.
- The engine's sandboxed file core (`plugins/skript-ts/files/`) and
  its HTTP/URL policy are security boundaries; escapes from them are
  in scope for reports.
