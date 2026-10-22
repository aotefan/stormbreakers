# Security

Only the current `main` branch is maintained. Use a supported, security-patched Node.js runtime and keep dependencies updated. Check `npm audit` and official Node.js security advisories before deployments; a clean audit is not proof that undiscovered vulnerabilities do not exist.

Please use [GitHub private vulnerability reporting](https://github.com/aotefan/stormbreakers/security/advisories/new) for reproducible security issues. Include affected revisions, a minimal local reproduction and impact. Do not disclose exploit details in public issues before coordination, and do not test attacks against the public demo.

The server validates incoming messages, caps payload size, applies per-connection message/join limits, bounds rooms/connections, expires empty rooms and closes slow or unresponsive peers. These limits do not replace host-level rate limiting for larger deployments. Room codes provide casual grouping, not authenticated access control. Do not put secrets in captain names. Production disables test-only duel/round controls.
