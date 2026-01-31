import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { Logger } from 'pino';
import type { AppConfig } from '../config.js';
import type { GiftApplyInput } from '../types.js';
import type { GiftMapStore } from '../mapping/giftMap.js';
import type { StateStore } from '../state/stateStore.js';
import type { PlotterWorker } from '../plotter/worker.js';
import type { SerialStreamer } from '../plotter/serialStreamer.js';
import type { TikTokListener } from '../tiktok/listener.js';

const simulateSchema = z.object({
  rowId: z.string().min(1),
  count: z.number().int().positive(),
});

const connectSchema = z.object({
  port: z.string().optional(),
  baud: z.number().int().positive().optional(),
});

const dryRunSchema = z.object({
  dryRun: z.boolean(),
});

const noTiktokRunSchema = z.object({
  noTiktokRun: z.boolean(),
});

const gcodeSchema = z.object({
  lines: z.array(z.string().min(1)).min(1),
});

function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export type ApiDeps = {
  config: AppConfig;
  stateStore: StateStore;
  worker: PlotterWorker;
  giftMap: GiftMapStore;
  streamer: SerialStreamer;
  tiktokListener: TikTokListener;
  applyGift: (input: GiftApplyInput) => Promise<void>;
  logger: Logger;
};

export function createApiServer(deps: ApiDeps): express.Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const webRoots = [
    path.resolve(process.cwd(), 'src', 'web'),
    path.resolve(process.cwd(), 'dist', 'web'),
  ];
  const webRoot = webRoots.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
  if (webRoot) {
    app.use('/', express.static(webRoot));
  }

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
      noTiktokRun: deps.config.noTiktokRun,
      position: deps.streamer.getPosition(),
      positionUpdatedAt: deps.streamer.getPositionUpdatedAt(),
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

  app.post('/plotter/gcode', async (req, res) => {
    const parsed = gcodeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    try {
      await deps.streamer.sendLines(parsed.data.lines);
      res.json({ ok: true, lines: parsed.data.lines.length });
    } catch (error) {
      deps.logger.error({ err: error }, 'gcode send failed');
      res.status(500).json({ error: 'failed to send gcode' });
    }
  });

  app.get('/plotter/position', (_req, res) => {
    res.json({
      ok: true,
      position: deps.streamer.getPosition(),
      updatedAt: deps.streamer.getPositionUpdatedAt(),
    });
  });

  app.post('/plotter/position', async (_req, res) => {
    try {
      const position = await deps.streamer.requestPosition();
      res.json({
        ok: true,
        position,
        updatedAt: deps.streamer.getPositionUpdatedAt(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to fetch position';
      res.status(500).json({ error: message });
    }
  });

  app.post('/plotter/safe-home', async (_req, res) => {
    try {
      const { x0, y0, zUp, plungeRate } = deps.config.plotter;
      await deps.streamer.sendLines([
        'G90',
        'G21',
        `G1 Z${fmt(zUp)} F${fmt(plungeRate)}`,
        `G0 X${fmt(x0)} Y${fmt(y0)}`,
      ]);
      const position = await deps.streamer.requestPosition();
      res.json({
        ok: true,
        position,
        updatedAt: deps.streamer.getPositionUpdatedAt(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to move to safe home';
      res.status(500).json({ error: message });
    }
  });

  app.post('/plotter/zero', async (_req, res) => {
    try {
      const before = await deps.streamer.requestPosition();
      await deps.streamer.sendLines(['G92 X0 Y0 Z0']);
      const after = await deps.streamer.requestPosition();
      res.json({
        ok: true,
        before,
        after,
        updatedAt: deps.streamer.getPositionUpdatedAt(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed to zero position';
      res.status(500).json({ error: message });
    }
  });

  app.post('/config/dry-run', async (req, res) => {
    const parsed = dryRunSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    await deps.streamer.setDryRun(parsed.data.dryRun);
    deps.config.dryRun = parsed.data.dryRun;
    res.json({ ok: true, dryRun: deps.config.dryRun });
  });

  app.post('/config/no-tiktok-run', async (req, res) => {
    const parsed = noTiktokRunSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid request body' });
      return;
    }

    deps.config.noTiktokRun = parsed.data.noTiktokRun;
    if (deps.config.noTiktokRun) {
      deps.tiktokListener.stop();
    } else {
      deps.tiktokListener.start();
    }

    res.json({ ok: true, noTiktokRun: deps.config.noTiktokRun });
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
