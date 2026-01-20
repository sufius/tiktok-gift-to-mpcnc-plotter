# tiktok-gift-to-mpcnc-plotter

Listen to TikTok LIVE gift events and drive an MPCNC pen plotter by streaming Marlin G-code. Gifts map to row IDs, each row accumulates pending strokes, and the system persists state so runs can resume after paper changes or restarts.

## Requirements
- Node.js 20+
- A Marlin-compatible MPCNC plotter (or dry-run mode for testing)

## Quick Start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in values.
3. Review `config/default.config.json` and `config/default.giftmap.json`.
4. Start in dry-run mode (default):
   ```bash
   npm run dev
   ```
5. Simulate a gift:
   ```bash
   curl -X POST http://localhost:3000/simulate/gift \
     -H 'Content-Type: application/json' \
     -d '{"rowId":"row1","count":5}'
   ```

## Configuration
- Config file: `config/default.config.json`
- Gift mapping file: `config/default.giftmap.json`
- State file: `config/default.state.json`

Environment overrides (see `.env.example`):
- `CONFIG_PATH`, `GIFT_MAP_PATH`, `STATE_PATH`
- `TIKTOK_USERNAME`, `TIKTOK_ROOM_ID`
- `TIKTOK_SESSIONID`, `TIKTOK_TT_TARGET_IDC` (optional cookies from your own authorized browser session)
- `SERIAL_PORT`, `SERIAL_BAUD`
- `DRY_RUN`, `HTTP_PORT`, `LOG_LEVEL`

## Plotter Behavior
- Each row has a fixed Y position and an X cursor.
- A stroke is a short line segment drawn in +X at the row's Y.
- After each stroke, X advances by `strokeSpacing`.
- If the next stroke would exceed `xMax`, the worker ends the run, sets `needsNewPaper`, and pauses.
- Use `POST /paper/changed` after loading new paper to reset X and continue.

## HTTP API
- `GET /health`
- `GET /status`
- `POST /paper/changed`
- `POST /mapping/reload`
- `POST /plotter/connect` body: `{ "port": "/dev/ttyUSB0", "baud": 115200 }`
- `POST /plotter/disconnect`
- `POST /simulate/gift` body: `{ "rowId": "row1", "count": 3 }`

## Running
- Development: `npm run dev`
- Build: `npm run build`
- Start: `npm run start`

Dry-run mode logs G-code instead of streaming it. Set `DRY_RUN=true` in `.env` or config.

## Notes
- TikTok integration is best-effort; disconnects are retried with backoff.
- For plotter-specific expectations, see `docs/marlin-notes.md`.
- Architecture and failure modes are described in `docs/architecture.md`.
