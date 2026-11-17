import { prisma } from "../../../config/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { ApiError, ownerWhere, requireFound } from "../../../utils/api-handler";
import { playerAge, shiftCalendarMonths } from "../matching-scoring.service";
import { remainingContractMonths } from "../financial-scoring.service";
import { writeAudit } from "../../audit-log.service";
import type { AuditContext } from "../../audit-log.service";
import { ENGINE_VERSION, matrixVersion, roles as catalog, positionGroup, strategies } from "./config";
import type { RunOptions, Weights } from "./config";
import { loadDataset, resolveConfig, asJson, ROLE_ALGORITHM } from "./squad.service";
import { eligibility, scoreVector, record } from "./performance";
import { financial, weighted } from "./financial";
import { risk } from "./risk";

export type MatchingInputV3 = { requirementId: number; season: string; roleIds: string[]; options: RunOptions; configId?: number;
  valuationSource?: string; strategy?: keyof typeof strategies; pillarWeights?: Weights };
const byPlayer = <T extends { playerId: number }>(rows: T[]) => new Map(rows.map(r => [r.playerId, r]));
const grouped = <T extends { playerId: number }>(rows: T[]) => {
  const map = new Map<number, T[]>(); for (const row of rows) { const list = map.get(row.playerId) ?? []; list.push(row); map.set(row.playerId, list); } return map;
};
const rounded = (v: number | null) => v === null ? null : Number(v.toFixed(2));
export const evaluationDay = (now: Date) => new Date(`${now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })}T00:00:00Z`);

async function evaluateBatch(tx: Prisma.TransactionClient, input: MatchingInputV3, ownerId: number | undefined, context: AuditContext, ids?: number[], save = false) {
  const requirement = requireFound(await tx.clubRequirement.findFirst({ where: { id: input.requirementId, ...ownerWhere(ownerId) } }));
  if (requirement.budget.toNumber() <= 0 || requirement.salaryLimit.toNumber() <= 0) throw new ApiError(400, "Ngân sách và trần lương V3 phải lớn hơn 0.");
  if (input.roleIds.some(id => catalog.find(r => r.id === id)?.group !== positionGroup[requirement.position])) throw new ApiError(400, "Vai trò phải thuộc nhóm vị trí CLB cần.");
  const config = await resolveConfig(tx, input.configId, ownerId === undefined), weights = input.pillarWeights ?? (input.strategy ? strategies[input.strategy] : config.pillarWeights);
  if (save && config.id === null) throw new ApiError(409, "Cần lưu cấu hình V3 trước khi lưu kết quả Matching.");
  if (save) await tx.$queryRaw`SELECT id FROM scoring_configs WHERE id=${config.id} FOR SHARE`;
  const now = new Date(), asOf = evaluationDay(now), data = await loadDataset(tx, input.season, config, input.options.dataMode);
  const players = ids ? await tx.player.findMany({ where: { id: { in: ids } }, orderBy: { id: "asc" } }) : data.candidates.filter(c => c.inScope).map(c => c.row.player);
  if (ids && players.length !== ids.length) throw new ApiError(404, "Không tìm thấy cầu thủ.");
  const playerIds = players.map(p => p.id), candidates = new Map(data.candidates.map(c => [c.row.playerId, c]));
  // Every dependent relation is loaded once for the whole batch; never call the
  // single-player preview/queries inside discovery's candidate loop.
  const quotes = byPlayer(await tx.matchingInput.findMany({ where: { requirementId: requirement.id, playerId: { in: playerIds } } }));
  const contracts = grouped(await tx.contract.findMany({ where: { playerId: { in: playerIds }, status: "ACTIVE", startDate: { lte: asOf }, endDate: { gte: asOf } } }));
  const verifications = byPlayer(await tx.playerDataVerification.findMany({ where: { playerId: { in: playerIds } } }));
  const injuries = grouped(await tx.injuryHistory.findMany({ where: { playerId: { in: playerIds }, startDate: { lte: asOf } } }));
  const valuationStart = new Date(shiftCalendarMonths(asOf, -24).getTime() - config.settings.valuationMaxAgeDays * 86400000);
  const valuations = grouped(await tx.playerMarketValueHistory.findMany({ where: { playerId: { in: playerIds }, valuedAt: { lte: asOf, gte: valuationStart }, recordedAt: { lte: now } }, orderBy: [{ valuedAt: "asc" }, { id: "asc" }] }));
  const cacheIds = players.flatMap(p => {
    const c = candidates.get(p.id); return c && eligibility(c, positionGroup[requirement.position]!, input.options.allowPositionShift).eligible && c.row.minutesPlayed >= input.options.minMinutes ? [c.row.id] : [];
  });
  const cache = new Map((await tx.roleScoreSnapshot.findMany({ where: { statsId: { in: cacheIds }, configHash: data.configHash, datasetHash: data.datasetHash, matrixVersion }, select: { statsId: true, values: true } })).map(r => [r.statsId, r.values]));
  const results = [];
  for (const player of players) {
    const candidate = candidates.get(player.id), quote = quotes.get(player.id) ?? null, active = contracts.get(player.id) ?? [], contract = active.length === 1 ? active[0]! : null;
    const verification = verifications.get(player.id) ?? null, medical = injuries.get(player.id) ?? [], values = valuations.get(player.id) ?? [];
    const missing: string[] = [], excluded: string[] = [], warnings: string[] = [], pros: string[] = [], cons: string[] = [];
    if (input.options.dataMode === "PROTOTYPE") warnings.push("PROTOTYPE: đầu vào và tập tham chiếu có thể chứa ước tính; chưa phải đánh giá đo lường đầy đủ.");
    const free = !active.length && verification?.registrationStatus === "FREE_AGENT" && verification.registrationAsOf?.getTime() === asOf.getTime() && !!verification.registrationVerifiedAt && verification.registrationVerifiedAt <= now;
    const sourceValues = values.filter(v => !input.valuationSource || v.source === input.valuationSource);
    const feeValuation = new Set(sourceValues.map(v => v.source)).size === 1 ? sourceValues.at(-1) ?? null : null;
    let fee = quote?.estimatedFee?.toNumber() ?? (free ? 0 : null), feeBasis = quote?.estimatedFee != null ? "REQUIREMENT_QUOTE" : free ? "VERIFIED_FREE_AGENT_TODAY" : "UNKNOWN";
    if (fee === null && input.options.dataMode === "PROTOTYPE" && config.settings.allowMarketValueFeeEstimate && feeValuation) {
      fee = feeValuation.marketValue.toNumber() * config.settings.marketValueFeeMultiplier; feeBasis = "MARKET_VALUE_ESTIMATE";
      warnings.push("Phí mua là giá trị thị trường × hệ số cấu hình, có ngày/nguồn; chưa phải báo giá đã xác minh.");
    }
    if (active.length > 1) warnings.push("Hợp đồng ACTIVE chồng lấn; chưa xác định thời hạn còn lại.");
    const finance = financial({ fee, wage: quote?.expectedSalaryPerYear?.toNumber() ?? null, budget: requirement.budget.toNumber(), salaryLimit: requirement.salaryLimit.toNumber(), contractYears: contract ? remainingContractMonths(asOf, contract.endDate).toNumber() / 12 : free ? 0 : null }, config, input.options);
    if (finance.fee.allowed === false) excluded.push("feeAboveTolerance"); else if (finance.fee.allowed === null) missing.push("feeForEligibility");
    if (finance.salary.allowed === false) excluded.push("wageAboveTolerance"); else if (finance.salary.allowed === null) missing.push("wageForEligibility");
    const age = playerAge(player.dateOfBirth, asOf);
    if (input.options.minimumAge !== null || input.options.maximumAge !== null) {
      if (age === null) missing.push("age"); else if (age < (input.options.minimumAge ?? 0) || age > (input.options.maximumAge ?? 100)) excluded.push("ageOutsideRange");
    }
    if (input.options.preferredFoot && player.preferredFoot !== input.options.preferredFoot && player.preferredFoot !== "BOTH") {
      if (!player.preferredFoot) missing.push("preferredFoot"); else excluded.push("preferredFootMismatch");
    }
    type Vector = ReturnType<typeof scoreVector>;
    let vector: Vector | null = null;
    if (!candidate) missing.push("seasonStats");
    else {
      if (candidate.stale) warnings.push("Metrics cũ đã bị loại khỏi tính toán; chỉ số gốc còn hợp lệ vẫn được dùng.");
      if (candidate.row.minutesPlayed < input.options.minMinutes) excluded.push("minutesBelowMinimum");
      if (input.options.leagues.length) {
        if (!candidate.leagues.length) missing.push("leagueMembership");
        else if (!candidate.leagues.some(l => input.options.leagues.includes(l))) excluded.push("leagueOutsideScope");
      }
      const stored = record(cache.get(candidate.row.id));
      if (eligibility(candidate, positionGroup[requirement.position]!, input.options.allowPositionShift).eligible && candidate.row.minutesPlayed >= input.options.minMinutes)
        vector = stored.algorithm === ROLE_ALGORITHM ? stored.vector as Vector : scoreVector(candidate, data.reference, config.settings);
    }
    const requested = vector?.roles.filter(r => input.roleIds.includes(r.roleId)).map(r => ({ ...r, ...eligibility(candidate!, r.group, input.options.allowPositionShift) })) ?? [];
    const eligible = requested.filter(r => r.eligible), available = eligible.filter(r => r.score !== null).sort((a, b) => b.score! - a.score! || a.roleId.localeCompare(b.roleId));
    if (candidate && !eligibility(candidate, positionGroup[requirement.position]!, input.options.allowPositionShift).eligible) excluded.push("positionNotEligible");
    const roleComplete = eligible.length > 0 && eligible.every(r => r.score !== null);
    const chosen = roleComplete ? available[0]! : null, squad = chosen?.score ?? null;
    if (candidate && eligible.some(r => r.score === null)) missing.push(...eligible.flatMap(r => r.missing.map(m => `squad.${r.roleId}.${m.metric}:${m.reason}`)));
    if (chosen && chosen.score! < input.options.minimumRoleScore) excluded.push("roleScoreBelowMinimum");
    if (chosen?.capApplied) warnings.push("Điểm vai trò bị chặn theo số phút thi đấu.");
    if (available.length > 1 && available[0]!.score! - available[1]!.score! < 3) warnings.push("Hai vai trò yêu cầu cách nhau dưới 3 điểm; coi là gần tương đương.");
    const riskResult = risk(medical, verification, values, age, asOf, now, config, input.options, input.valuationSource);
    if (weights.financial > 0 && finance.score === null) for (const [k, v] of Object.entries(finance.scores)) if (v === null && config.financialWeights[k as keyof typeof config.financialWeights] > 0) missing.push(`financial.${k}`);
    if (weights.risk > 0 && riskResult.score === null) {
      if (config.riskWeights.injury > 0 && riskResult.injury.score === null) missing.push(...riskResult.injury.missing.map(m => `risk.${m}`));
      if (config.riskWeights.resale > 0 && riskResult.resale.score === null) missing.push(...riskResult.resale.price.missing.map(m => `risk.${m}`), ...(age === null ? ["risk.age"] : []));
    }
    const total = weighted({ financial: finance.score, squad, risk: riskResult.score }, weights), complete = total !== null && !excluded.length && !missing.length;
    const contributions = { financial: weights.financial ? finance.score === null ? null : weights.financial * finance.score : 0,
      squad: weights.squad ? squad === null ? null : weights.squad * squad : 0, risk: weights.risk ? riskResult.score === null ? null : weights.risk * riskResult.score : 0 };
    for (const [key, score] of Object.entries({ financial: finance.score, squad, risk: riskResult.score })) if (score !== null) (score >= 70 ? pros : cons).push(`${key}: ${rounded(score)}/100, đóng góp ${rounded(contributions[key as keyof typeof contributions]) ?? "chưa biết"} điểm tổng.`);
    if (riskResult.injury.estimated) warnings.push("Điểm chấn thương tạm 70 theo cấu hình PROTOTYPE; chưa xác minh lịch sử.");
    const criteria = { financial: { ...finance, feeBasis, feeSource: quote?.feeSource ?? (feeBasis === "MARKET_VALUE_ESTIMATE" ? feeValuation?.source : null) ?? null,
      feeValuedAt: feeBasis === "MARKET_VALUE_ESTIMATE" ? feeValuation?.valuedAt : null, salarySource: quote?.salarySource ?? null },
      squad: { score: squad, chosen, requestedRoleIds: input.roleIds, metrics: chosen ? vector!.metricsByGroup[chosen.group] : null }, risk: riskResult, contributions };
    let resultId: number | null = null;
    if (save && complete) {
      const snapshot = { engineVersion: ENGINE_VERSION, evaluatedAt: now, evaluatedOn: asOf, season: input.season, matrixVersion, roleAlgorithm: ROLE_ALGORITHM,
        datasetHash: data.datasetHash, performanceConfigHash: data.configHash, config, weights, strategy: input.strategy ?? "CONFIG_OR_CUSTOM", options: input.options,
        valuationSource: input.valuationSource ?? null, player, requirement, quote, contract, verification, injuries: medical, valuations: values,
        stats: candidate?.row ?? null, criteria, policies: { overlappingRegionEpisodes: "MERGED", ageRangeSource: "EXPLICIT_OPTIONS_ONLY", missingData: "NULL_NO_REWEIGHT" } };
      const saved = await tx.matchResult.create({ data: { userId: requirement.userId, requirementId: requirement.id, playerId: player.id, configId: config.id!, totalScore: total!,
        financialScore: finance.score, squadScore: squad, riskScore: riskResult.score, criteriaScores: asJson(criteria), inputSnapshot: asJson(snapshot), prosCons: { pros, cons, warnings }, evaluatedAt: now } });
      await writeAudit(tx, context, "MatchResult", saved.id, "CREATE", undefined, { id: saved.id, playerId: player.id, engineVersion: ENGINE_VERSION, totalScore: saved.totalScore }); resultId = saved.id;
    }
    results.push({ player: { id: player.id, name: player.name, position: player.position, age }, complete, status: excluded.length ? "EXCLUDED" : complete ? "COMPLETE" : "INCOMPLETE",
      totalScore: complete ? rounded(total) : null, financialScore: rounded(finance.score), squadScore: rounded(squad), riskScore: rounded(riskResult.score),
      precision: { total: complete ? total : null, financial: finance.score, squad, risk: riskResult.score, fee }, criteria, missing: [...new Set(missing)], excluded,
      prosCons: { pros, cons, warnings }, saved: resultId !== null, resultId });
  }
  return { engineVersion: ENGINE_VERSION, implementationStage: 3, requirementId: requirement.id, season: input.season, evaluatedAt: now,
    config: { id: config.id, name: config.name, version: config.version, hash: config.hash, pillarWeights: weights }, options: input.options,
    reference: { datasetHash: data.datasetHash, configHash: data.configHash, count: data.reference.count }, results };
}
export const evaluateV3 = (input: MatchingInputV3 & { playerId: number; save: boolean }, ownerId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const batch = await evaluateBatch(tx, input, ownerId, context, [input.playerId], input.save); return { ...batch, results: undefined, ...batch.results[0]! };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });
export const rankV3 = (input: MatchingInputV3 & { playerIds?: number[]; page: number; pageSize: number }, ownerId: number | undefined, context: AuditContext) => prisma.$transaction(async tx => {
  const batch = await evaluateBatch(tx, input, ownerId, context, input.playerIds);
  const ranked = batch.results.filter(r => r.complete).sort((a, b) => b.precision.total! - a.precision.total! || b.precision.squad! - a.precision.squad!
    || (b.precision.financial ?? -1) - (a.precision.financial ?? -1) || a.precision.fee! - b.precision.fee! || a.player.id - b.player.id);
  const incomplete = batch.results.filter(r => r.status === "INCOMPLETE"), excluded = batch.results.filter(r => r.status === "EXCLUDED"), offset = (input.page - 1) * input.pageSize;
  return { ...batch, results: undefined, saved: false,
    ranked: ranked.slice(0, input.options.topN).slice(offset, offset + input.pageSize).map((r, i) => ({ rank: offset + i + 1, ...r })),
    incomplete: incomplete.slice(offset, offset + input.pageSize), excluded: excluded.slice(offset, offset + input.pageSize),
    meta: { page: input.page, pageSize: input.pageSize, topN: input.options.topN, totalCandidates: batch.results.length, rankedCount: ranked.length,
      incompleteCount: incomplete.length, excludedCount: excluded.length,
      rankedPages: Math.ceil(Math.min(ranked.length, input.options.topN) / input.pageSize),
      totalPages: Math.ceil(Math.max(Math.min(ranked.length, input.options.topN), incomplete.length, excluded.length) / input.pageSize) } };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120000 });
