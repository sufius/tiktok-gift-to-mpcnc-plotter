import { readFile } from 'node:fs/promises';
import type { Logger } from 'pino';

export class GiftMapStore {
  private map = new Map<string, string>();

  constructor(
    private readonly giftMapPath: string,
    private readonly logger: Logger,
  ) {}

  async load(): Promise<void> {
    const raw = await readFile(this.giftMapPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, string>;
    const nextMap = new Map<string, string>();

    for (const [key, value] of Object.entries(parsed)) {
      nextMap.set(key, value);
      nextMap.set(key.toLowerCase(), value);
    }

    this.map = nextMap;
    this.logger.info({ entries: this.map.size }, 'gift map loaded');
  }

  resolveRowId(input: { giftId?: number; giftName?: string }): string | undefined {
    if (input.giftId !== undefined) {
      const byId = this.map.get(String(input.giftId));
      if (byId) {
        return byId;
      }
    }

    if (input.giftName) {
      const byName = this.map.get(input.giftName) ?? this.map.get(input.giftName.toLowerCase());
      if (byName) {
        return byName;
      }
    }

    return undefined;
  }
}
