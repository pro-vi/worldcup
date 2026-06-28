# Security Policy

## Supported Versions

Only the `main` branch is supported for security fixes.

## Reporting A Vulnerability

Please report vulnerabilities privately through GitHub Security Advisories for
`pro-vi/worldcup`, or by opening a minimal issue that says a private report is
needed without disclosing details.

Do not include secrets, private source packets, unpublished drafts, or exploit
payloads in public issues. If a committed secret is discovered, rotate it before
or at the same time as removing it from history; deletion alone is not enough.

## Security Boundaries

`worldcup` is an agent skill and reference workflow template. Its highest-risk
surfaces are:

- untrusted candidate text entering judge prompts;
- live-view event parsing from workflow journals;
- private source packets and generated artifacts accidentally committed.

Repository checks cover syntax and parser behavior. They do not replace a real
release canary through the skill host.
