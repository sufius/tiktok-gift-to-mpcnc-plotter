import type { AppConfig } from '../config.js';

function fmt(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function buildStrokeJobGcode(params: {
  xStart: number;
  y: number;
  count: number;
  config: AppConfig;
}): { lines: string[]; xEnd: number } {
  const {
    xStart,
    y,
    count,
    config: {
      plotter: { strokeLength, strokeSpacing, zUp, zDown, feedRate, plungeRate },
    },
  } = params;

  const lines: string[] = ['G90', 'G21'];
  let x = xStart;

  for (let i = 0; i < count; i += 1) {
    lines.push(`G0 X${fmt(x)} Y${fmt(y)} Z${fmt(zUp)}`);
    lines.push(`G1 Z${fmt(zDown)} F${fmt(plungeRate)}`);
    lines.push(`G1 X${fmt(x + strokeLength)} F${fmt(feedRate)}`);
    lines.push(`G1 Z${fmt(zUp)} F${fmt(plungeRate)}`);
    x += strokeSpacing;
  }

  return { lines, xEnd: x };
}

export function buildEndOfRunGcode(config: AppConfig): string[] {
  return [
    `G1 Z${fmt(config.plotter.zUp)} F${fmt(config.plotter.plungeRate)}`,
    `G0 X${fmt(config.plotter.x0)} Y${fmt(config.plotter.y0)}`,
  ];
}
