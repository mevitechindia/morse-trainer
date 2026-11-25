# Notes for coding agents

## Versioning

- Before pushing any change that ships in the app (anything under `src/`, `main.js`, or the packaging config in `package.json`), bump `"version"` in `package.json` first: minor for new features, patch for fixes. The version names the released artifacts (`morse-trainer-<version>`, `Morse-Trainer-<version>.exe`) and the `v*` release tags.
- Docs- and tooling-only changes (README, `.github/`, this file) do not need a bump.
