import type { Prisma } from "../../../generated/prisma/client";
import { metricsInput, metricInputHash, positionMinutesIssue } from "../../player-metrics-input";
import { inspectMetric } from "./input-readiness";
import { roles, groups, knownMetrics, ratioMetrics, positionGroup, adjacent, leagueNames } from "./config";
import type { Group, DataMode, Settings } from "./config";

export type StatsRow = Prisma.PlayerStatsGetPayload<{ include: { player: true; estimate: true; metrics: true } }>;
export type Metric = { value: number; status: string; basis: string; successes?: number; attempts?: number };
export const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export type Candidate = ReturnType<typeof normalizeCandidate>;
export function normalizeCandidate(row: StatsRow, mode: DataMode) {
  const metrics: Record<string, Metric> = {}, rejected: Record<string, string> = {};
  const evidence = record(row.metrics?.evidence), values = record(row.metrics?.values);
  const leagues = Array.isArray(evidence.leagues) ? evidence.leagues.filter((l): l is string => typeof l === "string" && leagueNames.includes(l)) : [];
  const group = Object.hasOwn(positionGroup, row.player.position) ? positionGroup[row.player.position]! : null;
  const stale = !!row.metrics && row.metrics.inputHash !== metricInputHash(metricsInput(row.player, row, row.estimate));
  if (row.minutesPlayed > 0) {
    for (const key of knownMetrics) {
      const raw = values[key], m = record(raw), checked = inspectMetric(key, raw);
      if (stale) rejected[key] = "STALE_METRICS";
      else if (!checked.usable) rejected[key] = checked.issue ?? "MISSING_METRIC";
      else if (mode === "OBSERVED_ONLY" && m.status === "ESTIMATED") rejected[key] = "ESTIMATE_NOT_ALLOWED";
      else {
        metrics[key] = { value: m.value as number, status: checked.status, basis: m.basis as string,
          ...(ratioMetrics.has(key) ? { successes: m.successes as number, attempts: m.attempts as number } : {}) };
      }
    }
    const basics = { goalsPer90: row.goals, assistsPer90: row.assists, keyPassesPer90: row.keyPasses,
      tacklesWonPer90: row.tacklesWon, interceptionsPer90: row.interceptions, passesCompletedPer90: row.passesCompleted };
    for (const [key, count] of Object.entries(basics)) if (count !== null && count >= 0) {
      metrics[key] = { value: 90 * count / row.minutesPlayed, status: "DERIVED", basis: "OBSERVED_PLAYER_STATS_TOTAL_PER_90" }; delete rejected[key];
    }
  }
  return { row, group, leagues, stale, metrics, rejected, inScope: row.player.transfermarktId !== null && leagues.length > 0 };
}
export const smooth = (m: Metric, mean: number | null, prior: number) => mean === null ? m.value : 100 * (m.successes! + prior * mean) / (m.attempts! + prior);
type Distribution = { values: number[]; mean: number | null; estimated: number };
export type Reference = { groups: Partial<Record<Group, Record<string, Distribution>>>; count: number };
export function buildReference(candidates: Candidate[], settings: Settings): Reference {
  const eligible = candidates.filter(c => c.inScope && c.group && c.row.minutesPlayed >= settings.referenceMinMinutes);
  const reference: Reference = { groups: {}, count: eligible.length };
  for (const group of groups) {
    const distributions: Record<string, Distribution> = {};
    for (const key of knownMetrics) {
      const samples = eligible.filter(c => c.group === group && c.metrics[key]).map(c => c.metrics[key]!);
      let mean: number | null = null;
      if (ratioMetrics.has(key) && samples.length) mean = settings.ratioMean === "PLAYER_MEAN"
        ? samples.reduce((sum, m) => sum + m.successes! / m.attempts!, 0) / samples.length
        : samples.reduce((sum, m) => sum + m.successes!, 0) / samples.reduce((sum, m) => sum + m.attempts!, 0);
      distributions[key] = { values: samples.map(m => smooth(m, mean, settings.smoothingPrior)).sort((a, b) => a - b), mean, estimated: samples.filter(m => m.status === "ESTIMATED").length };
    }
    reference.groups[group] = distributions;
  }
  return reference;
}
const bound = (values: number[], v: number, upper: boolean) => {
  let lo = 0, hi = values.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (values[mid]! < v || (upper && values[mid] === v)) lo = mid + 1; else hi = mid; }
  return lo;
};
export function percentile(values: number[], value: number) {
  const less = bound(values, value, false), equal = bound(values, value, true) - less;
  return { score: values.length ? 100 * (less + .5 * equal) / values.length : null, less, equal, count: values.length };
}
export function eligibility(candidate: Candidate, target: Group, allowShift: boolean) {
  if (candidate.group === target) return { eligible: true, basis: "PRIMARY", share: null };
  if (!candidate.group || !adjacent[candidate.group].includes(target)) return { eligible: false, basis: "NOT_ADJACENT", share: null };
  let share: number | null = null;
  const { row } = candidate;
  if (row.positionMinutes && row.minutesPlayed > 0 && !positionMinutesIssue(row.minutesPlayed, row.positionMinutes, row.positionMinutesSource)) {
    share = Object.entries(record(row.positionMinutes)).filter(([position]) => positionGroup[position] === target)
      .reduce((sum, [, n]) => sum + (n as number), 0) / row.minutesPlayed;
  }
  return { eligible: allowShift || (share !== null && share >= .25), basis: allowShift ? "USER_ALLOWED_SHIFT" : "POSITION_MINUTES", share };
}
export function scoreVector(candidate: Candidate, reference: Reference, settings: Settings) {
  const explanations: Record<string, Record<string, { raw: number; adjusted: number; percentile: number; status: string; basis: string; less: number; equal: number; referenceCount: number; referenceEstimated: number; mean: number | null }>> = {};
  const missing: Record<string, Record<string, string>> = {};
  for (const group of groups) {
    const explanation = explanations[group] = {} as typeof explanations[string];
    const failures = missing[group] = {} as Record<string, string>;
    for (const key of knownMetrics) {
      const m = candidate.metrics[key], dist = reference.groups[group]?.[key];
      if (!m) { failures[key] = candidate.rejected[key] ?? "MISSING_METRIC"; continue; }
      if (!dist || dist.values.length < settings.minimumReferencePlayers) { failures[key] = "INSUFFICIENT_REFERENCE"; continue; }
      const adjusted = smooth(m, dist.mean, settings.smoothingPrior), p = percentile(dist.values, adjusted);
      explanation[key] = { raw: m.value, adjusted, percentile: p.score!, status: m.status, basis: m.basis,
        less: p.less, equal: p.equal, referenceCount: p.count, referenceEstimated: dist.estimated, mean: dist.mean };
    }
  }
  const minutesScore = Math.min(100, 100 * candidate.row.minutesPlayed / settings.fullMinutes), cap = Math.min(100, minutesScore + settings.capBonus);
  const scores = roles.filter(role => candidate.group === "GK" ? role.group === "GK" : role.group !== "GK").map(role => {
    const metrics = explanations[role.group]!, weights = { ...role.weights }, transfers: { from: string; to: string; weight: number }[] = [];
    for (const [from, targets] of Object.entries(settings.trackingTransfers)) if ((weights[from] ?? 0) > 0 && !metrics[from] && Object.keys(targets).every(key => metrics[key])) {
      const weight = weights[from]!; weights[from] = 0;
      for (const [key, fraction] of Object.entries(targets)) { weights[key] = (weights[key] ?? 0) + weight * fraction; transfers.push({ from, to: key, weight: weight * fraction }); }
    }
    const absent = Object.keys(weights).filter(key => weights[key]! > 0 && !metrics[key]).map(key => ({ metric: key, reason: missing[role.group]![key]! }));
    if (candidate.row.minutesPlayed <= 0) absent.push({ metric: "minutesPlayed", reason: "NO_PLAYING_MINUTES" });
    if (!candidate.group) absent.push({ metric: "position", reason: "UNKNOWN_POSITION" });
    const quality = absent.length ? null : Object.entries(weights).reduce((sum, [key, w]) => sum + (w > 0 ? w * metrics[key]!.percentile : 0), 0);
    const beforeCap = quality === null ? null : settings.minutesWeight * minutesScore + (1 - settings.minutesWeight) * quality;
    const score = beforeCap === null ? null : Math.min(beforeCap, cap);
    const estimatedWeight = Object.entries(weights).reduce((sum, [key, w]) => sum + (metrics[key]?.status === "ESTIMATED" ? w : 0), 0);
    return { roleId: role.id, roleName: role.name, group: role.group, score, quality, beforeCap, cap, capApplied: score !== null && score < beforeCap!,
      weights, missing: absent, transfers, estimatedWeight };
  });
  return { minutesScore, cap, metricsByGroup: explanations, roles: scores };
}
