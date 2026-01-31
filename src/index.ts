import dotenv from 'dotenv';
import pino from 'pino';
import { loadConfig } from './config.js';
import { GiftMapStore } from './mapping/giftMap.js';
import { createApiServer } from './http/api.js';
import { SerialStreamer } from './plotter/serialStreamer.js';
import { PlotterWorker } from './plotter/worker.js';
import { StateStore, createDefaultState } from './state/stateStore.js';
import { TikTokListener } from './tiktok/listener.js';
import type { GiftApplyInput } from './types.js';

async function main(): Promise<void> {
  dotenv.config();
  const config = await loadConfig();

  const logger = pino({ level: config.logging.level });

  const giftMap = new GiftMapStore(config.files.giftMapPath, logger.child({ module: 'gift-map' }));
  await giftMap.load();

  const stateStore = new StateStore(
    config.files.statePath,
    logger.child({ module: 'state-store' }),
    config,
  );
  await stateStore.loadOrCreate(createDefaultState(config));

  const streamer = new SerialStreamer(logger.child({ module: 'serial' }), config.dryRun);

  const worker = new PlotterWorker(
    stateStore,
    config,
    streamer,
    logger.child({ module: 'worker' }),
  );
  worker.start();

  const applyGift = async (input: GiftApplyInput): Promise<void> => {
    if (!Number.isFinite(input.count) || input.count <= 0) {
      return;
    }

    await stateStore.update((state) => {
      const row = state.rows[input.rowId];
      if (!row) {
        logger.warn({ rowId: input.rowId }, 'unknown rowId; gift ignored');
        return state;
      }
      row.pendingStrokes += input.count;
      return state;
    });

    logger.info(
      { rowId: input.rowId, count: input.count, source: input.source },
      'gift queued',
    );
    worker.kick();
  };

  const tiktokListener = new TikTokListener(
    config,
    giftMap,
    applyGift,
    logger.child({ module: 'tiktok' }),
  );

  const app = createApiServer({
    config,
    stateStore,
    worker,
    giftMap,
    streamer,
    tiktokListener,
    applyGift,
    logger: logger.child({ module: 'api' }),
  });

  const server = app.listen(config.http.port, () => {
    logger.info({ port: config.http.port }, 'http server listening');
  });

  if (config.noTiktokRun) {
    logger.info('NO_TIKTOK_RUN enabled; listener disabled');
  } else if (config.tiktok.username || config.tiktok.roomId) {
    tiktokListener.start();
  } else {
    logger.warn('tiktok username/roomId missing; listener disabled');
  }

  const shutdown = async (): Promise<void> => {
    logger.info('shutting down');
    tiktokListener.stop();
    worker.stop();
    await streamer.disconnect();
    server.close();
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
