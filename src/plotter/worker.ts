import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { PlotterState } from '../types.js';
import { buildEndOfRunGcode, buildStrokeJobGcode } from './gcode.js';
import { SerialStreamer } from './serialStreamer.js';
import { StateStore } from '../state/stateStore.js';

export class PlotterWorker {
  private timer: NodeJS.Timeout | null = null;
  private processing = false;
  private paused = false;

  constructor(
    private readonly stateStore: StateStore,
    private readonly config: AppConfig,
    private readonly streamer: SerialStreamer,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.tick(), this.config.worker.tickMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  kick(): void {
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;

    try {
      const state = await this.stateStore.getState();
      if (state.paperRun.needsNewPaper) {
        this.paused = true;
        return;
      }

      this.paused = false;

      if (!this.streamer.isConnected() && !this.config.dryRun) {
        this.logger.debug('plotter not connected; skipping');
        return;
      }

      const rowId = this.findNextRowId(state);
      if (!rowId) {
        return;
      }

      const row = state.rows[rowId];
      if (!row) {
        return;
      }

      const fit = this.calculateFit(row.x);
      const pending = row.pendingStrokes;
      const nDo = Math.min(pending, fit);
      const shouldEndRun = pending > fit && fit > 0;
      const shouldEndNoFit = pending > 0 && fit === 0;

      const lines: string[] = [];
      let newX = row.x;

      if (nDo > 0) {
        const job = buildStrokeJobGcode({
          xStart: row.x,
          y: row.y,
          count: nDo,
          config: this.config,
        });
        lines.push(...job.lines);
        newX = job.xEnd;
      }

      if (shouldEndRun || shouldEndNoFit) {
        lines.push(...buildEndOfRunGcode(this.config));
      }

      if (lines.length === 0) {
        return;
      }

      await this.streamer.sendLines(lines);

      await this.stateStore.update((draft) => {
        const current = draft.rows[rowId];
        if (!current) {
          return draft;
        }

        if (nDo > 0) {
          current.x = newX;
          current.pendingStrokes = Math.max(0, current.pendingStrokes - nDo);
        }

        if (shouldEndRun || shouldEndNoFit) {
          draft.paperRun.needsNewPaper = true;
        }

        return draft;
      });

      if (shouldEndRun || shouldEndNoFit) {
        this.paused = true;
      }
    } catch (error) {
      this.logger.error({ err: error }, 'worker tick failed');
    } finally {
      this.processing = false;
    }
  }

  private findNextRowId(state: PlotterState): string | null {
    const rowOrder = Object.keys(this.config.rows);
    for (const rowId of rowOrder) {
      const row = state.rows[rowId];
      if (row?.pendingStrokes > 0) {
        return rowId;
      }
    }
    return null;
  }

  private calculateFit(xStart: number): number {
    const { xMax, strokeLength, strokeSpacing } = this.config.plotter;
    const maxStart = xMax - strokeLength;
    if (xStart > maxStart) {
      return 0;
    }
    return Math.floor((maxStart - xStart) / strokeSpacing) + 1;
  }
}
