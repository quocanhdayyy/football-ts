import { matchingV3OpenApi } from "../docs/matching-v3.openapi";
import { endpoint } from "../utils/api-handler";
import { currentUser, ownerScope } from "../middleware/auth.middleware";
import { readInteger, readText, InputError } from "../utils/api-validation";
import { object, exactKeys, roles as roleCatalog, parseOptions, strategies as strategyCatalog, unitWeights } from "../services/matching/v3/config";
import { evaluateV3, rankV3 } from "../services/matching/v3/engine";
import type { MatchingInputV3 } from "../services/matching/v3/engine";
import { previewSquadV3, rebuildRoleCache } from "../services/matching/v3/squad.service";
import { ENGINE_VERSION, IMPLEMENTATION_STAGE, SCORING_AVAILABLE, matrixVersion, v3Template, defaultOptions, roles, strategies, policies, inputMetrics } from "../services/matching/v3/config";

// V3 exposes its own versioned scoring contract; legacy Matching routes stay separate.
export const templateV3 = endpoint(async (_req, res) => {
  res.json({ status: "success", data: {
    engineVersion: ENGINE_VERSION, implementationStage: IMPLEMENTATION_STAGE, scoringAvailable: SCORING_AVAILABLE,
    matrixVersion, config: v3Template(), options: defaultOptions, roles, strategies, inputMetrics, policies,
    roleScoringAvailable: true,
  } });
});

const completedSeason = (v: unknown) => {
  const season = readText(v, "season", 20);
  if (!/^\d{4}\/\d{4}$/.test(season) || +season.slice(0, 4) < 1 || +season.slice(5) !== +season.slice(0, 4) + 1
    || new Date(`${season.slice(5)}-07-01T00:00:00Z`) > new Date()) throw new InputError("season phải là mùa YYYY/YYYY liên tiếp đã kết thúc.");
  return season;
};
export const squadPreviewV3 = endpoint(async (req, res) => {
  const body = object(req.body, "body"); exactKeys(body, ["playerId", "season", "configId", "roleIds", "options"], "body");
  const options = body.options === undefined ? {} : object(body.options, "options"); exactKeys(options, ["dataMode", "allowPositionShift"], "options");
  const parsed = parseOptions(options);
  if (body.roleIds !== undefined && (!Array.isArray(body.roleIds) || !body.roleIds.length || body.roleIds.length > 35
    || new Set(body.roleIds).size !== body.roleIds.length || body.roleIds.some(id => !roleCatalog.some(r => r.id === id)))) throw new InputError("roleIds phải chứa các mã vai trò hợp lệ, không trùng.");
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: await previewSquadV3({ playerId: readInteger(body.playerId, "playerId", 1), season: completedSeason(body.season),
    dataMode: parsed.dataMode, allowPositionShift: parsed.allowPositionShift,
    ...(body.configId === undefined ? {} : { configId: readInteger(body.configId, "configId", 1) }),
    ...(body.roleIds === undefined ? {} : { roleIds: body.roleIds as string[] }) }, currentUser(res).role === "ADMIN") });
});
export const rebuildRolesV3 = endpoint(async (req, res) => {
  const body = object(req.body, "body"); exactKeys(body, ["season", "dataMode", "configId"], "body");
  const options = parseOptions(body.dataMode === undefined ? {} : { dataMode: body.dataMode });
  res.json({ status: "success", data: await rebuildRoleCache(completedSeason(body.season), options.dataMode,
    body.configId === undefined ? undefined : readInteger(body.configId, "configId", 1), currentUser(res).id) });
});

const commonKeys = ["requirementId", "season", "roleIds", "options", "configId", "valuationSource", "strategy", "pillarWeights"];
function matchingBody(body: Record<string, unknown>): MatchingInputV3 {
  if (!Array.isArray(body.roleIds) || !body.roleIds.length || body.roleIds.length > 35 || new Set(body.roleIds).size !== body.roleIds.length
    || body.roleIds.some(id => !roleCatalog.some(r => r.id === id))) throw new InputError("roleIds phải chứa 1–35 mã vai trò hợp lệ, không trùng.");
  if (body.strategy !== undefined && (typeof body.strategy !== "string" || !Object.hasOwn(strategyCatalog, body.strategy))) throw new InputError("strategy không hợp lệ.");
  if (body.strategy !== undefined && body.pillarWeights !== undefined) throw new InputError("Chỉ gửi strategy hoặc pillarWeights.");
  return { requirementId: readInteger(body.requirementId, "requirementId", 1), season: completedSeason(body.season), roleIds: body.roleIds as string[], options: parseOptions(body.options),
    ...(body.configId === undefined ? {} : { configId: readInteger(body.configId, "configId", 1) }),
    ...(body.valuationSource === undefined ? {} : { valuationSource: readText(body.valuationSource, "valuationSource", 255) }),
    ...(body.strategy === undefined ? {} : { strategy: body.strategy as keyof typeof strategyCatalog }),
    ...(body.pillarWeights === undefined ? {} : { pillarWeights: unitWeights(body.pillarWeights, ["financial", "squad", "risk"], "pillarWeights") }) };
}
export const matchingEvaluateV3 = endpoint(async (req, res) => {
  const body = object(req.body, "body"); exactKeys(body, [...commonKeys, "playerId", "save"], "body");
  if (body.save !== undefined && typeof body.save !== "boolean") throw new InputError("save phải là boolean.");
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: await evaluateV3({ ...matchingBody(body), playerId: readInteger(body.playerId, "playerId", 1), save: body.save === true },
    ownerScope(res), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
const batchV3 = (discover: boolean) => endpoint(async (req, res) => {
  const body = object(req.body, "body"); exactKeys(body, [...commonKeys, "page", "pageSize", ...(discover ? [] : ["playerIds"])], "body");
  let playerIds: number[] | undefined;
  if (!discover) {
    if (!Array.isArray(body.playerIds) || !body.playerIds.length || body.playerIds.length > 100) throw new InputError("playerIds phải chứa từ 1 đến 100 ID.");
    playerIds = body.playerIds.map(v => readInteger(v, "playerIds", 1));
    if (new Set(playerIds).size !== playerIds.length) throw new InputError("playerIds không được trùng.");
  }
  const page = body.page === undefined ? 1 : readInteger(body.page, "page", 1), pageSize = body.pageSize === undefined ? 20 : readInteger(body.pageSize, "pageSize", 1);
  if (pageSize > 100 || (page - 1) * pageSize > 2147483647) throw new InputError("page/pageSize ngoài phạm vi, pageSize tối đa 100.");
  res.set("Cache-Control", "no-store");
  res.json({ status: "success", data: await rankV3({ ...matchingBody(body), page, pageSize, ...(playerIds ? { playerIds } : {}) },
    ownerScope(res), { actorId: currentUser(res).id, ipAddress: req.ip ?? null }) });
});
export const matchingRankV3 = batchV3(false), matchingSearchV3 = batchV3(true);

export const openApiV3 = endpoint(async (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(matchingV3OpenApi);
});
