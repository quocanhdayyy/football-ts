import { prisma } from "../../../config/prisma";
import { Prisma } from "../../../generated/prisma/client";
import { ApiError, requireFound } from "../../../utils/api-handler";
import { metricInputHash } from "../../player-metrics-input";
import { ENGINE_VERSION, IMPLEMENTATION_STAGE, SCORING_AVAILABLE, matrixVersion, roles, validateV3Config } from "./config";
import type { V3Config, DataMode } from "./config";
import { normalizeCandidate, buildReference, scoreVector, eligibility, record } from "./performance";

export const ROLE_ALGORITHM = "role-scores-v3-stage2.1";
export const asJson = (value: unknown): Prisma.InputJsonObject => JSON.parse(JSON.stringify(value));
export async function resolveConfig(tx: Prisma.TransactionClient, id: number | undefined, admin: boolean) {
  const item = await tx.scoringConfig.findFirst({ where: {
    ...(id === undefined ? { isActive: true } : { id, ...(admin ? {} : { isActive: true }) }),
  } });
  if (!item) throw new ApiError(409, "Chưa có cấu hình V3 active được phép sử dụng. Chạy migration hoặc nhờ Admin kích hoạt cấu hình V3.");
  return { ...validateV3Config(item), id: item.id };
}

export type Dataset = { candidates: ReturnType<typeof normalizeCandidate>[]; reference: ReturnType<typeof buildReference>; configHash: string; datasetHash: string };
export async function loadDataset(tx: Prisma.TransactionClient, season: string, config: V3Config, mode: DataMode): Promise<Dataset> {
  // Hash actual JSON values too: a direct SQL edit cannot silently reuse an old cache.
  const fingerprint = await tx.$queryRaw<{ hash: string }[]>`
    SELECT md5(coalesce(string_agg(md5(to_jsonb(s)::text || to_jsonb(p)::text || coalesce(to_jsonb(m)::text,'null') || coalesce(to_jsonb(e)::text,'null')), '' ORDER BY s.id),'')) AS hash
    FROM player_stats s JOIN players p ON p.id=s.player_id
    LEFT JOIN player_stats_metrics m ON m.stats_id=s.id LEFT JOIN player_stats_estimates e ON e.stats_id=s.id
    WHERE s.season=${season}`;
  const datasetHash = metricInputHash({ season, fingerprint: fingerprint[0]!.hash });
  const { settings } = config;
  const configHash = metricInputHash({ algorithm: ROLE_ALGORITHM, matrixVersion, matrix: roles, mode,
    referenceMinMinutes: settings.referenceMinMinutes, minimumReferencePlayers: settings.minimumReferencePlayers,
    prior: settings.smoothingPrior, mean: settings.ratioMean, fullMinutes: settings.fullMinutes,
    minutesWeight: settings.minutesWeight, capBonus: settings.capBonus, transfers: settings.trackingTransfers });
  const key = `${configHash}:${datasetHash}`;
  const existing = memory.get(key); if (existing) return existing;
  const rows = await tx.playerStats.findMany({ where: { season }, include: { player: true, estimate: true, metrics: true }, orderBy: { id: "asc" } });
  if (!rows.length) throw new ApiError(409, "Chưa có thống kê cho mùa được chọn.");
  const candidates = rows.map(row => normalizeCandidate(row, mode));
  const result = { candidates, reference: buildReference(candidates, settings), configHash, datasetHash };
  if (memory.size >= 2) memory.delete(memory.keys().next().value!);
  memory.set(key, result); return result;
}
const memory = new Map<string, Dataset>();

export type SquadInput = { playerId: number; season: string; dataMode: DataMode; allowPositionShift: boolean; configId?: number; roleIds?: string[] };
export const previewSquadV3 = (input: SquadInput, admin: boolean) => prisma.$transaction(async tx => {
  const config = await resolveConfig(tx, input.configId, admin);
  const dataset = await loadDataset(tx, input.season, config, input.dataMode);
  const candidate = requireFound(dataset.candidates.find(c => c.row.playerId === input.playerId) ?? null);
  const cached = await tx.roleScoreSnapshot.findUnique({ where: { statsId_configHash: { statsId: candidate.row.id, configHash: dataset.configHash } } });
  const hit = cached?.datasetHash === dataset.datasetHash && cached.matrixVersion === matrixVersion && record(cached.values).algorithm === ROLE_ALGORITHM;
  const vector = hit ? record(cached!.values).vector as ReturnType<typeof scoreVector> : scoreVector(candidate, dataset.reference, config.settings);
  if (!hit) {
    const data = { datasetHash: dataset.datasetHash, matrixVersion, values: asJson({ algorithm: ROLE_ALGORITHM, dataMode: input.dataMode, vector }) };
    await tx.roleScoreSnapshot.upsert({ where: { statsId_configHash: { statsId: candidate.row.id, configHash: dataset.configHash } }, create: { statsId: candidate.row.id, configHash: dataset.configHash, ...data }, update: { ...data, generatedAt: new Date() } });
  }
  const roles = vector.roles.map(role => ({ ...role, ...eligibility(candidate, role.group, input.allowPositionShift) }));
  const topRoles = roles.filter(role => role.eligible && role.score !== null).sort((a, b) => b.score! - a.score! || a.roleId.localeCompare(b.roleId));
  const selected = input.roleIds ? roles.filter(role => input.roleIds!.includes(role.roleId)) : [];
  const selectionComplete = selected.length > 0 && selected.length === input.roleIds!.length && selected.every(role => role.eligible && role.score !== null);
  const selectedRole = selectionComplete ? [...selected].sort((a, b) => b.score! - a.score! || a.roleId.localeCompare(b.roleId))[0]! : null;
  return { engineVersion: ENGINE_VERSION, algorithm: ROLE_ALGORITHM, implementationStage: IMPLEMENTATION_STAGE, fullMatchingAvailable: SCORING_AVAILABLE, savedHistory: false,
    player: { id: candidate.row.playerId, name: candidate.row.player.name, position: candidate.row.player.position }, season: input.season,
    dataMode: input.dataMode, metricsStale: candidate.stale, config: { id: config.id, name: config.name, version: config.version },
    reference: { datasetHash: dataset.datasetHash, configHash: dataset.configHash, count: dataset.reference.count, minMinutes: config.settings.referenceMinMinutes,
      minimumReferencePlayers: config.settings.minimumReferencePlayers, ratioMean: config.settings.ratioMean, smoothingPrior: config.settings.smoothingPrior,
      metricsByGroup: Object.fromEntries(Object.entries(dataset.reference.groups).map(([group, metrics]) => [group,
        Object.fromEntries(Object.entries(metrics).map(([key, d]) => [key, { count: d.values.length, estimatedCount: d.estimated, ratioMean: d.mean }]))])) },
    cache: { hit: !!hit, saved: true }, minutesPlayed: candidate.row.minutesPlayed, minutesScore: vector.minutesScore, cap: vector.cap,
    roles, metricsByGroup: vector.metricsByGroup, topRoles: topRoles.slice(0, 5), selectedRole, squadScore: selectedRole?.score ?? null,
    ambiguousTopRole: topRoles.length > 1 && topRoles[0]!.score! - topRoles[1]!.score! < 3,
    warnings: [ ...(input.dataMode === "PROTOTYPE" ? ["PROTOTYPE: có thể dùng ước tính trong đầu vào và tập tham chiếu; không coi là thống kê đo đầy đủ."] : []),
      ...(candidate.stale ? ["Metrics đã cũ; chỉ sử dụng các chỉ số còn tính được từ thống kê gốc hiện tại."] : []),
      "450 phút là ngưỡng tham chiếu; điểm tối đa tại 900 phút vẫn là 65. Chưa áp dụng bộ lọc ứng viên hoặc ghép F/R ở đây.",
      ...(input.roleIds && !selectionComplete ? ["Chưa đủ điểm hoặc điều kiện vị trí cho toàn bộ vai trò được yêu cầu; chưa ghép điểm S."] : []) ] };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });

export const rebuildRoleCache = (season: string, mode: DataMode, configId: number | undefined, actorId: number) => prisma.$transaction(async tx => {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  if (actor?.role !== "ADMIN") throw new ApiError(403, "Chỉ Admin được xây lại cache.");
  const config = await resolveConfig(tx, configId, true), dataset = await loadDataset(tx, season, config, mode);
  let completePlayers = 0; const pending: object[] = [];
  const flush = async () => {
    if (!pending.length) return;
    await tx.$executeRaw`INSERT INTO role_score_snapshots (stats_id, config_hash, dataset_hash, matrix_version, "values", generated_at)
      SELECT x.id, ${dataset.configHash}, ${dataset.datasetHash}, ${matrixVersion}, x."values", CURRENT_TIMESTAMP
      FROM jsonb_to_recordset(${JSON.stringify(pending)}::jsonb) AS x(id integer, "values" jsonb)
      ON CONFLICT (stats_id, config_hash) DO UPDATE SET dataset_hash=EXCLUDED.dataset_hash, matrix_version=EXCLUDED.matrix_version, "values"=EXCLUDED."values", generated_at=EXCLUDED.generated_at`;
    pending.length = 0;
  };
  for (const candidate of dataset.candidates.filter(c => c.inScope)) {
    const vector = scoreVector(candidate, dataset.reference, config.settings);
    if (vector.roles.some(role => role.score !== null && eligibility(candidate, role.group, false).eligible)) completePlayers++;
    pending.push({ id: candidate.row.id, values: { algorithm: ROLE_ALGORITHM, dataMode: mode, vector } });
    if (pending.length >= 50) await flush();
  }
  await flush();
  return { season, dataMode: mode, datasetHash: dataset.datasetHash, configHash: dataset.configHash,
    players: dataset.candidates.filter(c => c.inScope).length, completePlayers, referenceCount: dataset.reference.count, savedHistory: false };
}, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 120000 });
