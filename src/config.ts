import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const RowConfigSchema = z.object({
  y: z.number(),
  startX: z.number().optional(),
});

export const ConfigSchema = z.object({
  http: z.object({
    port: z.number().int().positive(),
  }),
  tiktok: z.object({
    username: z.string().optional().default(''),
    roomId: z.string().optional().default(''),
    sessionId: z.string().optional().default(''),
    ttTargetIdc: z.string().optional().default(''),
  }),
  files: z.object({
    giftMapPath: z.string(),
    statePath: z.string(),
  }),
  plotter: z.object({
    x0: z.number(),
    y0: z.number(),
    xMax: z.number(),
    strokeLength: z.number().positive(),
    strokeSpacing: z.number().positive(),
    zUp: z.number(),
    zDown: z.number(),
    feedRate: z.number().positive(),
    plungeRate: z.number().positive(),
    rowStartX: z.number(),
  }),
  rows: z.record(RowConfigSchema),
  serial: z.object({
    port: z.string().optional().default(''),
    baudRate: z.number().int().positive().default(115200),
  }),
  worker: z.object({
    tickMs: z.number().int().positive(),
  }),
  dryRun: z.boolean(),
  logging: z.object({
    level: z.string().default('info'),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

function resolvePath(baseDir: string, target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(baseDir, target);
}

export async function loadConfig(): Promise<AppConfig> {
  const configPath = process.env.CONFIG_PATH || './config/default.config.json';
  const raw = await readFile(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  const merged = {
    ...parsed,
    http: {
      ...(parsed as any).http,
      port: process.env.HTTP_PORT ? Number(process.env.HTTP_PORT) : (parsed as any).http?.port,
    },
    tiktok: {
      ...(parsed as any).tiktok,
      username: process.env.TIKTOK_USERNAME ?? (parsed as any).tiktok?.username,
      roomId: process.env.TIKTOK_ROOM_ID ?? (parsed as any).tiktok?.roomId,
      sessionId: process.env.TIKTOK_SESSIONID ?? (parsed as any).tiktok?.sessionId,
      ttTargetIdc: process.env.TIKTOK_TT_TARGET_IDC ?? (parsed as any).tiktok?.ttTargetIdc,
    },
    files: {
      ...(parsed as any).files,
      giftMapPath: process.env.GIFT_MAP_PATH ?? (parsed as any).files?.giftMapPath,
      statePath: process.env.STATE_PATH ?? (parsed as any).files?.statePath,
    },
    serial: {
      ...(parsed as any).serial,
      port: process.env.SERIAL_PORT ?? (parsed as any).serial?.port,
      baudRate: process.env.SERIAL_BAUD ? Number(process.env.SERIAL_BAUD) : (parsed as any).serial?.baudRate,
    },
    dryRun:
      process.env.DRY_RUN !== undefined
        ? process.env.DRY_RUN.toLowerCase() === 'true'
        : (parsed as any).dryRun,
    logging: {
      ...(parsed as any).logging,
      level: process.env.LOG_LEVEL ?? (parsed as any).logging?.level,
    },
  };

  const config = ConfigSchema.parse(merged);
  const baseDir = path.dirname(path.resolve(configPath));
  config.files.giftMapPath = resolvePath(baseDir, config.files.giftMapPath);
  config.files.statePath = resolvePath(baseDir, config.files.statePath);

  return config;
}
