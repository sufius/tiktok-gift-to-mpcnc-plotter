export type RowState = {
  x: number;
  y: number;
  pendingStrokes: number;
};

export type PaperRunState = {
  needsNewPaper: boolean;
};

export type PlotterState = {
  rows: Record<string, RowState>;
  paperRun: PaperRunState;
};

export type GiftEvent = {
  giftId?: number;
  giftName?: string;
  repeatCount?: number;
  giftCount?: number;
  repeatEnd?: boolean;
};

export type GiftApplyInput = {
  rowId: string;
  count: number;
  source: 'tiktok' | 'simulate';
};
