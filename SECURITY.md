# Security Policy

## Supported version

The latest `main` branch is the supported version of LuBai Football.

## Reporting a vulnerability

Please do **not** publish API keys, database credentials, admin tokens, private feed URLs, or other secrets in a public GitHub issue.

For a security-sensitive report, contact the repository owner privately through an available GitHub contact method. For ordinary bugs that do not contain secrets or exploit details, use GitHub Issues.

## Deployment guidance

- Keep `.env` out of Git.
- Store secrets in Railway Variables or another secret manager.
- Use a long random `ADMIN_TOKEN`.
- Rotate any credential that is accidentally committed.
- Do not bypass paywalls, authentication, CAPTCHAs, or access controls when adding news sources.
