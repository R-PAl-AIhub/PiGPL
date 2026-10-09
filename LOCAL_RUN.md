# PiGPL — local run

## Requirements
- Node.js 22+ (Node 20+ may also work, but the project was built around Node 22)
- npm

## Start the development app

```bash
npm install
npm run dev
```

Then open:

http://localhost:8080

## Useful commands

```bash
npm run typecheck
npm run lint
npm run build
npm run preview
```

The app is a Vite + React + TanStack Start project. No database setup is required for the default local configuration; `.grok/app-env.json` keeps `VITE_AUTH_ENABLED` set to `false`.

Do not run `vite` directly; use the npm scripts above.
