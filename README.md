# Morse Trainer

Morse code trainer built with plain HTML/CSS/JS. Runs as a desktop app (Electron) and as a web app (no build step either way).

## Run

Desktop app:

```bash
npm install
npm start
```

Web app: serve `src/` from any static host (or just open `src/index.html`). A web deployment is live on Cloudflare Pages at <https://morse-trainer-43a.pages.dev>.

## Features

- **Speed**: character WPM in the top bar (default 8), optional Farnsworth spacing in Settings.
- **Receive**: listen and type; colour-coded diff, accuracy, weakest-character stats. Hints: show characters and/or dits & dahs as they play, plus explanations of Q codes and abbreviations.
- **Send**: key the shown text; per-character right/wrong marking, word-spacing errors, element and overall speed. Hints: code for the next character or every character, and listening to the text first. Backspace or 8 dits undoes.
- **Rhythm**: ideal timeline vs. your keyed timeline in units, per-element stats (dit, dah, element, letter and word gaps), a score and tips. An optional timing cursor sweeps the timeline at the ideal pace while you key, so you can check your speed against the target as you send.
- **Free roam**: live transcription of whatever you send; an endless receive stream to type along with; text-to-Morse player.
- **Exam mode**: practice based on the Indian amateur radio Morse test. It has a 5-minute receiving test and a 5-minute sending test at 8 WPM, and each passes with at least one continuous minute without errors. When sending, that error-free minute must also be at 8 WPM or faster, measured the standard (PARIS) way. You can choose plain English, text with numbers and punctuation, or ham messages, plus shorter practice lengths. It shows a timeline of errors and your attempt history.
- **Reference**: clickable Morse chart, Q codes, abbreviations, prosigns, cut numbers, timing, RST and a sample QSO.
- **Keys**: straight key (default Space) or iambic paddles (Mode A/B, default `[` and `]`). Any key can be rebound and the paddles can be swapped. There are also on-screen keys you can click.
- **Practice content**: letters, numbers, punctuation, words, Q codes, abbreviations, call signs, prosigns and QSO phrases, mixed as you choose, plus a custom character set.

Settings and statistics are saved in the app's local storage.

## Web version

The renderer (`src/`) is plain static HTML/CSS/JS with no build step, so the same code runs on the web. In the browser, audio starts on your first click or key press (standard autoplay policy).

Deployed to Cloudflare Pages as the `morse-trainer` project (production branch `main`): <https://morse-trainer-43a.pages.dev>.

Publishing a release deploys the site automatically via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml): it runs when the *Build and Release* workflow completes successfully on a release tag (the release is published with the workflow's `GITHUB_TOKEN`, whose events cannot trigger a second workflow, so the deploy hangs off the build instead). Pre-release tags like `v2.0.0-rc1` are skipped. The workflow needs the `CLOUDFLARE_API_TOKEN` (Cloudflare Pages · Edit) and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

To redeploy the site manually after changing `src/`, use Wrangler's direct upload:

```bash
npx wrangler pages deploy src --project-name morse-trainer --branch main
```

(`cf pages projects create --name <name> --production-branch main` created the project; the `cf` CLI cannot do the Pages asset upload itself, so Wrangler handles the upload step.)

## Files

- `main.js`: Electron main process
- `src/js/morse.js`: Morse tables, timing (PARIS/Farnsworth), scheduling, diff
- `src/js/audio.js`: Web Audio sidetone with click-free envelopes
- `src/js/keyer.js`: straight key decoder (adapts to your speed) and iambic keyer
- `src/js/data.js`: Q codes, abbreviations, word lists, call sign and QSO generators
- `src/js/app.js`: UI for all tabs

## Build

```bash
npm run dist
```

This writes `dist/morse-trainer-<version>.x86_64.rpm` (RPM for Fedora/RHEL). On Linux you can also run `npm run dist:linux` directly (it needs `rpm-build`).

For containerized builds:

```bash
npm run dist:linux:docker
```

The icon comes from `build/icon.png`. Run `npm run icon` to regenerate it.

Install on Fedora:

```bash
sudo dnf install ./morse-trainer-1.3.0.x86_64.rpm
```

The app appears in the GNOME menu as **Morse Trainer**, or you can run `morse-trainer` from a terminal. To remove it, run `sudo dnf remove morse-trainer`.

## License

AGPL-3.0 © 2026 Avoiq Private Limited. See [LICENSE](LICENSE).
