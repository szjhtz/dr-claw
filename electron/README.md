# Electron Desktop Shell

This directory contains the minimal Electron wrapper for Dr. Claw.

Current approach:
- Keep the existing Express/WebSocket backend unchanged.
- Start `server/index.js` as a child process from Electron.
- Load the local app URL inside a `BrowserWindow`.

Useful commands:
- `npm run desktop:icons` regenerates desktop icon assets (`build/icon.png`, `build/icon.ico`, and on macOS also `build/icon.icns`).
- `npm run desktop:dev` prepares native modules, builds the frontend, and launches Electron.
- `npm run desktop:pack` creates an unpacked desktop bundle for the current host platform in `release/`.
- `npm run desktop:dist` builds installable packages for the current target flags.

Notes:
- Native modules such as `node-pty`, `better-sqlite3`, and `sqlite3` must be rebuilt for Electron.
- Electron rebuild cache is redirected into the repo (`.electron-gyp/`, `.electron-cache/`) to avoid host permission issues.
- Desktop builds currently disable in-app self-update. Users should install a newer package manually.

CI/CD:
- `.github/workflows/desktop-release.yml` builds macOS and Windows installers on GitHub Actions.
- Pushing a tag like `v1.2.3` publishes a GitHub Release with attached desktop artifacts.
- You can also trigger the workflow manually and choose whether to publish the release.
