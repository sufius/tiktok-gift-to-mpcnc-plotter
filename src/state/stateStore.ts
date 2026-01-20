import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from 'pino';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { PlotterState } from '../types.js';

const RowStateSchema = z.object({
  x: z.number(),
  y: z.number(),
  pendingStrokes: z.number().int().nonnegative(),
});

const PlotterStateSchema = z.object({
  rows: z.record(RowStateSchema),
  paperRun: z.object({
    needsNewPaper: z.boolean(),
  }),
});

class Mutex {
  private chain = Promise.resolve();

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}

export function createDefaultState(config: AppConfig): PlotterState {
  const rows: PlotterState['rows'] = {};
  const startXDefault = config.plotter.rowStartX ?? config.plotter.x0;

  for (const [rowId, rowConfig] of Object.entries(config.rows)) {
    rows[rowId] = {
      x: rowConfig.startX ?? startXDefault,
      y: rowConfig.y,
      pendingStrokes: 0,
    };
  }

  return {
    rows,
    paperRun: { needsNewPaper: false },
  };
}

function mergeStateWithConfig(state: PlotterState, config: AppConfig): PlotterState {
  const rows: PlotterState['rows'] = { ...state.rows };
  const startXDefault = config.plotter.rowStartX ?? config.plotter.x0;

  for (const [rowId, rowConfig] of Object.entries(config.rows)) {
    const existing = rows[rowId];
    rows[rowId] = {
      x: existing?.x ?? rowConfig.startX ?? startXDefault,
      y: rowConfig.y,
      pendingStrokes: existing?.pendingStrokes ?? 0,
    };
  }

  return {
    rows,
    paperRun: state.paperRun ?? { needsNewPaper: false },
  };
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.tmp`);
  await writeFile(tmpPath, data, 'utf8');
  await rename(tmpPath, filePath);
}

export class StateStore {
  private readonly mutex = new Mutex();
  private state: PlotterState | null = null;

  constructor(
    private readonly statePath: string,
    private readonly logger: Logger,
    private readonly config: AppConfig,
  ) {}

  async loadOrCreate(defaultState: PlotterState): Promise<PlotterState> {
    return this.mutex.runExclusive(async () => {
      try {
        const raw = await readFile(this.statePath, 'utf8');
        const parsed = PlotterStateSchema.parse(JSON.parse(raw));
        const merged = mergeStateWithConfig(parsed, this.config);
        this.state = merged;
        this.logger.info({ path: this.statePath }, 'state loaded');
        return structuredClone(merged);
      } catch (error) {
        this.logger.warn({ err: error, path: this.statePath }, 'state missing or invalid, creating default');
        this.state = defaultState;
        await atomicWrite(this.statePath, JSON.stringify(defaultState, null, 2));
        return structuredClone(defaultState);
      }
    });
  }

  async getState(): Promise<PlotterState> {
    return this.mutex.runExclusive(async () => {
      if (!this.state) {
        throw new Error('state not initialized');
      }
      return structuredClone(this.state);
    });
  }

  async update(mutator: (state: PlotterState) => PlotterState | void): Promise<PlotterState> {
    return this.mutex.runExclusive(async () => {
      if (!this.state) {
        throw new Error('state not initialized');
      }
      const next = mutator(this.state) ?? this.state;
      this.state = next;
      await atomicWrite(this.statePath, JSON.stringify(next, null, 2));
      return structuredClone(next);
    });
  }
}
