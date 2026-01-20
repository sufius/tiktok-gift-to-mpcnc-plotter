declare module 'tiktok-live-connector' {
  export type WebcastPushConnectionOptions = {
    enableExtendedGiftInfo?: boolean;
    requestOptions?: {
      headers?: Record<string, string>;
    };
  };

  export class WebcastPushConnection {
    constructor(uniqueId: string, options?: WebcastPushConnectionOptions);
    connect(): Promise<unknown>;
    disconnect(): void;
    on(event: string, listener: (...args: any[]) => void): this;
  }
}
