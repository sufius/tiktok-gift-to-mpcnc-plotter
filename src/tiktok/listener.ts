import type { Logger } from 'pino';
import { WebcastPushConnection } from 'tiktok-live-connector';
import type { AppConfig } from '../config.js';
import type { GiftApplyInput, GiftEvent } from '../types.js';
import type { GiftMapStore } from '../mapping/giftMap.js';

const MAX_BACKOFF_MS = 30000;

export class TikTokListener {
  private connection: WebcastPushConnection | null = null;
  private running = false;
  private backoffMs = 1000;

  constructor(
    private readonly config: AppConfig,
    private readonly giftMap: GiftMapStore,
    private readonly applyGift: (input: GiftApplyInput) => Promise<void>,
    private readonly logger: Logger,
  ) {}

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    this.connection?.disconnect();
    this.connection = null;
  }

  private async connect(): Promise<void> {
    if (!this.running) {
      return;
    }

    const uniqueId = this.config.tiktok.username || this.config.tiktok.roomId;
    if (!uniqueId) {
      this.logger.warn('tiktok username/roomId missing; listener not started');
      return;
    }

    const cookieParts = [];
    if (this.config.tiktok.sessionId) {
      cookieParts.push(`sessionid=${this.config.tiktok.sessionId}`);
    }
    if (this.config.tiktok.ttTargetIdc) {
      cookieParts.push(`tt-target-idc=${this.config.tiktok.ttTargetIdc}`);
    }

    const requestOptions = cookieParts.length
      ? { headers: { Cookie: cookieParts.join('; ') } }
      : undefined;

    const connection = new WebcastPushConnection(uniqueId, {
      enableExtendedGiftInfo: true,
      requestOptions,
    });

    this.connection = connection;

    connection.on('gift', (data: GiftEvent) => void this.handleGift(data));
    connection.on('disconnected', () => this.handleDisconnect());
    connection.on('streamEnd', () => this.handleDisconnect());
    connection.on('error', (error: unknown) => {
      this.logger.error({ err: error }, 'tiktok error');
    });

    try {
      await connection.connect();
      this.logger.info('tiktok connected');
      this.backoffMs = 1000;
    } catch (error) {
      this.logger.error({ err: error }, 'tiktok connect failed');
      this.scheduleReconnect();
    }
  }

  private handleDisconnect(): void {
    if (!this.running) {
      return;
    }
    this.logger.warn('tiktok disconnected');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.running) {
      return;
    }

    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);

    setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private async handleGift(event: GiftEvent): Promise<void> {
    const rowId = this.giftMap.resolveRowId({
      giftId: event.giftId,
      giftName: event.giftName,
    });

    if (!rowId) {
      this.logger.debug({ giftId: event.giftId, giftName: event.giftName }, 'unmapped gift');
      return;
    }

    const count = this.resolveGiftCount(event);
    if (count <= 0) {
      return;
    }

    await this.applyGift({ rowId, count, source: 'tiktok' });
  }

  private resolveGiftCount(event: GiftEvent): number {
    if (event.repeatEnd && event.repeatCount) {
      return event.repeatCount;
    }

    if (event.giftCount) {
      return event.giftCount;
    }

    if (event.repeatCount && event.repeatEnd === undefined) {
      return event.repeatCount;
    }

    return 1;
  }
}
