# Architecture

## Overview
The system listens to TikTok LIVE gift events, maps them to plotter rows, persists pending strokes, and streams Marlin G-code to an MPCNC pen plotter. A local HTTP API provides control and status.

## Components
- TikTok listener: Connects via tiktok-live-connector, normalizes gift events, and retries with backoff.
- Gift map: JSON lookup from gift id/name to rowId.
- State store: File-based JSON store with a mutex and atomic writes.
- Plotter worker: Scheduler that consumes pending strokes, enforces xMax, and pauses for paper changes.
- G-code generator: Builds safe Z-lifted stroke segments and end-of-run commands.
- Serial streamer: Line-by-line streaming with Marlin "ok" acknowledgements and timeouts.
- HTTP API: Health, status, control endpoints, and a simulation path.

## Data Flow
1. Gift event (TikTok or /simulate/gift) resolves to a rowId and count.
2. State store increments rows[rowId].pendingStrokes and persists immediately.
3. Worker ticks, finds a row with pending strokes, and computes how many fit within xMax.
4. Worker generates G-code, streams it, then persists the updated x and pending values.
5. If a stroke would exceed xMax, worker ends the run, sets needsNewPaper, and pauses.
6. /paper/changed resets row x positions and clears needsNewPaper to resume.

## Persistence and Resume
- State is stored in JSON under config/statePath with atomic writes.
- If the app restarts, state is loaded, merged with config rows, and processing resumes.
- When xMax is reached, remaining pending strokes remain in state until paper is changed.

## Failure Modes and Handling
- TikTok disconnects: Logged and retried with exponential backoff.
- Serial disconnect: Streaming stops; worker skips until reconnected.
- Streaming timeout or error: Job is not committed; the worker will retry on the next tick.
- Crash during streaming: Some strokes may be duplicated after restart; operators should monitor output.
- Corrupt state file: A new default state is created and logged.

## Single-flight Streaming
The serial streamer accepts only one in-flight job at a time, and the worker serializes its own tick execution to prevent concurrent streams.
