# Ireland Pulse

Ireland Pulse is a live visual information site for what is happening in Ireland right now.

It combines public signals from Irish Reddit, Met Eireann observations, and Irish Rail train positions into a single art-directed web experience. The design is intentionally closer to an editorial data artwork than a conventional dashboard: readable information first, cinematic presentation second.

## Live Signals

- **Reddit**: hot posts from `r/ireland` and regional Irish subreddits, ranked by upvotes and comment activity.
- **Met Eireann**: current station observations including weather description, temperature, wind, pressure, rainfall, and observation time.
- **Irish Rail**: current train positions and live route/status snippets.
- **EirGrid**: shown as unavailable for now because the researched endpoint is flaky and not reliable enough for the primary experience.

## Running Locally

```bash
npm install
npm run dev
```

The app runs at `http://127.0.0.1:5173/`.

The local API proxy runs at `http://127.0.0.1:8787/` and exposes:

```bash
GET /api/health
GET /api/pulse
```

## Build

```bash
npm run build
```

## Data Notes

The app uses a small Node/Express proxy so the browser does not need to handle old XML APIs, CORS differences, or raw external response shapes directly.

No API keys are required for the current first version.

Spotify, Dublin Bikes, NTA, marine/tidal data, and other possible future signals are intentionally not included until they are tested and reliable enough for a public-facing experience.
