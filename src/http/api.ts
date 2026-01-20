import express from 'express';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { GiftApplyInput } from '../types.js';
import type { GiftMapStore } from '../mapping/giftMap.js';
import type { StateStore } from '../state/stateStore.js';
import type { PlotterWorker } from '../plotter/worker.js';
import type { SerialStreamer } from '../plotter/serialStreamer.js';

const simulateSchema = z.object({
  rowId: z.string().min(1),
  count: z.number().int().positive(),
});

const connectSchema = z.object({
  port: z.string().optional(),
  baud: z.number().int().positive().optional(),
});

export type ApiDeps = {
  config: AppConfig;
  stateStore: StateStore;
  worker: PlotterWorker;
  giftMap: GiftMapStore;
  streamer: SerialStreamer;
  applyGift: (input: GiftApplyInput) => Promise<void>;
  logger: Logger;
};

export function createApiServer(deps: ApiDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/status', async (_req, res) => {
    const state = await deps.stateStore.getState();
    res.json({
      state,
      workerPaused: deps.worker.isPaused(),
      serialConnected: deps.streamer.isConnected(),
      dryRun: deps.config.dryRun,
    });
  });

  app.post('/paper/changed', async (_req, res) => {
    const startXDefault = deps.config.plotter.rowStartX ?? deps.config.plotter.x0;
    await deps.stateStore.update((state) => {
      for (const [rowId, rowConfig] of Object.entries(deps.config.rows)) {
        const row = state.rows[rowId] ?? {
          x: rowConfig.startX ?? startXDefault,
          y: rowConfig.y,
          pendingStrokes: 0,
        };
        row.x = rowConfig.startX ?? startXDefault;
        row.y = rowConfig.y;
        state.rows[rowId] = row;
      }
      state.paperRun.needsNewPaper = false;
      return state;
    });
    deps.worker.kick();
    res.json({ ok: true });
  });

  app.post('/mapping/reload', async (_req, res) => {
    await deps.giftMap.load();
    res.json({ ok: true });
  });

  app.post('/plotter/connect', async (req, res) => {
    const parsed = connectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    const port = parsed.data.port ?? deps.config.serial.port;
    const baudRate = parsed.data.baud ?? deps.config.serial.baudRate;

    if (!port) {
      res.status(400).json({ error: 'missing serial port' });
      return;
    }

    await deps.streamer.connect(port, baudRate);
    res.json({ ok: true, port, baudRate });
  });

  app.post('/plotter/disconnect', async (_req, res) => {
    await deps.streamer.disconnect();
    res.json({ ok: true });
  });

  app.post('/simulate/gift', async (req, res) => {
    const parsed = simulateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    await deps.applyGift({
      rowId: parsed.data.rowId,
      count: parsed.data.count,
      source: 'simulate',
    });

    res.json({ ok: true });
  });

  return app;
}
