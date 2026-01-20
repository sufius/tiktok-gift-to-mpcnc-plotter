import type { Logger } from 'pino';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

const DEFAULT_TIMEOUT_MS = 10000;

type PendingAck = {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

export class SerialStreamer {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private pending: PendingAck[] = [];
  private busy = false;

  constructor(
    private readonly logger: Logger,
    private readonly dryRun: boolean,
  ) {}

  isConnected(): boolean {
    return Boolean(this.port?.isOpen);
  }

  async connect(path: string, baudRate: number): Promise<void> {
    if (this.dryRun) {
      this.logger.info({ path, baudRate }, 'dry-run mode: skipping serial connect');
      return;
    }

    if (this.port?.isOpen) {
      this.logger.info('serial already connected');
      return;
    }

    this.port = new SerialPort({ path, baudRate, autoOpen: true });
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

    this.parser.on('data', (line: string) => this.handleLine(line));
    this.port.on('error', (error) => {
      this.logger.error({ err: error }, 'serial error');
    });
    this.port.on('close', () => {
      this.rejectAll(new Error('serial connection closed'));
      this.logger.warn('serial connection closed');
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.port) {
        reject(new Error('serial port not initialized'));
        return;
      }

      this.port.once('open', () => {
        this.logger.info({ path, baudRate }, 'serial connected');
        resolve();
      });
      this.port.once('error', (error) => {
        reject(error);
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.dryRun) {
      this.logger.info('dry-run mode: skipping serial disconnect');
      return;
    }

    if (!this.port?.isOpen) {
      this.logger.info('serial already disconnected');
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.port?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  async sendLines(lines: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    if (this.dryRun) {
      lines.forEach((line) => this.logger.info({ line }, 'dry-run gcode'));
      return;
    }

    if (!this.port?.isOpen) {
      throw new Error('serial not connected');
    }

    if (this.busy) {
      throw new Error('serial streamer busy');
    }

    this.busy = true;
    try {
      for (const line of lines) {
        await this.sendLine(line, timeoutMs);
      }
    } finally {
      this.busy = false;
    }
  }

  private async sendLine(line: string, timeoutMs: number): Promise<void> {
    if (!this.port) {
      throw new Error('serial not connected');
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removePending(resolve);
        reject(new Error(`timeout waiting for ok: ${line}`));
      }, timeoutMs);

      this.pending.push({ resolve, reject, timeout });
      this.port?.write(`${line}\n`, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.removePending(resolve);
          reject(error);
        }
      });
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const lower = trimmed.toLowerCase();
    if (lower.startsWith('ok')) {
      const pending = this.pending.shift();
      if (pending) {
        clearTimeout(pending.timeout);
        pending.resolve();
      }
      return;
    }

    if (lower.startsWith('error')) {
      const pending = this.pending.shift();
      if (pending) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(trimmed));
      }
      return;
    }

    this.logger.debug({ line: trimmed }, 'serial output');
  }

  private removePending(resolve: () => void): void {
    const index = this.pending.findIndex((pending) => pending.resolve === resolve);
    if (index >= 0) {
      this.pending.splice(index, 1);
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.splice(0)) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }
}
