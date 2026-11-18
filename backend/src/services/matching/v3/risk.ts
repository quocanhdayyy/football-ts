import type { InjuryHistory, PlayerDataVerification, PlayerMarketValueHistory } from "../../../generated/prisma/client";
import type { Settings, RunOptions, V3Config } from "./config";
import { shiftCalendarMonths } from "./dates";
import { weighted } from "./financial";
const DAY = 86400000;
function merge(intervals: [number, number][]) {
  const out: [number, number][] = [];
  for (const [a, b] of intervals.sort((x, y) => x[0] - y[0])) {
    if (b <= a) continue;
    const last = out.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]);
  }
  return out;
}
export function injuryScore(rows: InjuryHistory[], verification: PlayerDataVerification | null, asOf: Date, now: Date, settings: Settings, allowEstimate: boolean) {
  const start = shiftCalendarMonths(asOf, -24).getTime(), split = shiftCalendarMonths(asOf, -12).getTime(), end = asOf.getTime();
  const relevant = rows.filter(r => r.startDate.getTime() <= end && (r.endDate === null || r.endDate.getTime() > start));
  const intervals = merge(relevant.map(r => [Math.max(start, r.startDate.getTime()), Math.min(end, r.endDate?.getTime() ?? end)]));
  let recentDays = 0, olderDays = 0;
  for (const [a, b] of intervals) { recentDays += Math.max(0, b - Math.max(a, split)) / DAY; olderDays += Math.max(0, Math.min(b, split) - a) / DAY; }
  const weightedDays = Math.min(180, recentDays + .6 * olderDays);
  const covered = !!verification?.injuryVerifiedAt && verification.injuryVerifiedAt <= now && !!verification.injurySource?.trim()
    && !!verification.injuryCoveredFrom && verification.injuryCoveredFrom.getTime() <= start && !!verification.injuryCoveredThrough && verification.injuryCoveredThrough >= asOf;
  const regions = new Map<string, [number, number][]>();
  for (const r of relevant) if (r.bodyRegion?.trim()) {
    const region = r.bodyRegion.trim().toUpperCase().replace(/\s+/g, "_"), list = regions.get(region) ?? [];
    list.push([r.startDate.getTime(), Math.max(r.startDate.getTime() + 1, Math.min(end, r.endDate?.getTime() ?? end))]); regions.set(region, list);
  }
  // Overlapping records in one region are treated as one episode for penalties.
  const episodes = [...regions.values()].map(merge);
  const recurrencePenalty = Math.min(24, 8 * episodes.reduce((sum, list) => sum + Math.max(0, list.length - 1), 0));
  const severePenalty = Math.min(20, 10 * episodes.flat().filter(([a, b]) => (b - a) / DAY >= 90).length);
  const missing = [...(!covered ? ["injuryCoverage24Months"] : []), ...(relevant.some(r => !r.bodyRegion?.trim()) ? ["injuryBodyRegion"] : [])];
  const estimated = missing.length > 0 && allowEstimate && settings.missingInjuryScore !== null;
  const score = missing.length ? estimated ? settings.missingInjuryScore : null : Math.max(0, 100 * (1 - weightedDays / 180) - recurrencePenalty - severePenalty);
  return { score, estimated, missing, covered, recentDays, olderDays, weightedDays, recurrencePenalty, severePenalty,
    ongoing: relevant.some(r => r.endDate === null || r.endDate > asOf), window: { from: new Date(start).toISOString().slice(0, 10), through: asOf.toISOString().slice(0, 10) } };
}
export function resaleAge(age: number) {
  if (age <= 26) return 100;
  if (age <= 29) return 100 - 10 * (age - 26);
  if (age <= 32) return 70 - 40 * (age - 29) / 3;
  return Math.max(0, 30 - 10 * (age - 32));
}
export function priceScore(rows: PlayerMarketValueHistory[], asOf: Date, now: Date, settings: Settings, source?: string) {
  const valid = rows.filter(r => r.valuedAt <= asOf && r.recordedAt <= now && r.marketValue.toNumber() > 0 && (!source || r.source === source));
  const sources = [...new Set(valid.map(r => r.source))];
  const missing = (reason: string) => ({ score: null, trend: null, volatility: null, growth: null, sigma: null, points: [] as unknown[], anchors: [] as unknown[], source: source ?? sources[0] ?? null, missing: [reason] });
  if (sources.length !== 1) return missing(sources.length ? "valuationSourceAmbiguous" : "marketValues");
  const dates = new Map<number, PlayerMarketValueHistory>();
  for (const row of valid.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id - b.id)) dates.set(row.valuedAt.getTime(), row);
  const values = [...dates.values()].sort((a, b) => a.valuedAt.getTime() - b.valuedAt.getTime()), start = shiftCalendarMonths(asOf, -24);
  const points = values.filter(r => r.valuedAt >= start);
  if (points.length < settings.valuationMinimumPoints) return missing("marketValues24MonthsMinimumPoints");
  const anchors = [-24, -18, -12, -6, 0].map(month => {
    const at = shiftCalendarMonths(asOf, month), row = values.filter(r => r.valuedAt <= at).at(-1);
    return row && (at.getTime() - row.valuedAt.getTime()) / DAY <= settings.valuationMaxAgeDays
      ? { at, valuedAt: row.valuedAt, value: row.marketValue.toNumber(), id: row.id, carriedDays: (at.getTime() - row.valuedAt.getTime()) / DAY } : null;
  });
  if (anchors.some(a => a === null)) return missing("marketValueSixMonthAnchors");
  const xs = points.map(r => (r.valuedAt.getTime() - start.getTime()) / DAY / 365.2425), ys = points.map(r => Math.log(r.marketValue.toNumber()));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const variance = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  if (!variance) return missing("marketValueDistinctDates");
  const growth = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i]! - my), 0) / variance;
  const changes = anchors.slice(1).map((a, i) => Math.log(a!.value / anchors[i]!.value)), mean = changes.reduce((a, b) => a + b, 0) / changes.length;
  const sigma = Math.sqrt(changes.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (changes.length - (settings.volatilitySample ? 1 : 0)));
  const trend = 50 + 50 * Math.max(-1, Math.min(growth / .3, 1)), volatility = 100 * (1 - Math.min(sigma / .35, 1));
  return { score: .6 * trend + .4 * volatility, trend, volatility, growth, sigma, source: sources[0]!, missing: [],
    points: points.map(r => ({ id: r.id, date: r.valuedAt, value: r.marketValue.toNumber(), reliability: r.reliability })), anchors };
}
export function risk(rows: InjuryHistory[], verification: PlayerDataVerification | null, valuations: PlayerMarketValueHistory[], age: number | null, asOf: Date, now: Date, config: V3Config, options: RunOptions, source?: string) {
  const injury = injuryScore(rows, verification, asOf, now, config.settings, options.dataMode === "PROTOTYPE"), price = priceScore(valuations, asOf, now, config.settings, source);
  const ageScore = age === null ? null : resaleAge(age + options.holdingYears), resale = weighted({ age: ageScore, price: price.score }, { age: .6, price: .4 });
  return { score: weighted({ injury: injury.score, resale }, config.riskWeights), injury, resale: { score: resale, ageScore, futureAge: age === null ? null : age + options.holdingYears, price }, weights: config.riskWeights };
}
