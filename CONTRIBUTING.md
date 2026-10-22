# Contributing

Start with the setup instructions in [README.md](README.md). Use the supported, security-patched Node runtime declared in `.nvmrc` and `npm ci` for reproducible installs.

1. Open an issue describing a reproducible bug or a focused feature proposal.
2. Create a branch from `main`. Keep gameplay rules in `shared/` so solo and online modes agree.
3. Run `npm test` and `npm audit`. For a UI or control change, check desktop, portrait and landscape touch layouts; include screenshots or a short reproduction.
4. Open a pull request describing the behavior change and relevant validation. Do not commit `.env` files, credentials, generated builds, or test artifacts.

For site content, edit `src/site.ts`; the build prerenders the same React content users see. Keep structured data and `public/llms.txt` consistent with actual behavior. A custom deployment needs its own canonical URLs.

Contributions are provided under this project's MIT license. Use assets you created or have permission to redistribute, and preserve third-party license notices.
