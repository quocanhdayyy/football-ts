import { endpoint } from "../utils/api-handler";
import { currentUser } from "../middleware/auth.middleware";
import { readInteger, readText, InputError } from "../utils/api-validation";
import { object, exactKeys, roles as roleCatalog, parseOptions } from "../services/matching/v3/config";
import { previewSquadV3, rebuildRoleCache } from "../services/matching/v3/squad.service";
import { ENGINE_VERSION, IMPLEMENTATION_STAGE, SCORING_AVAILABLE, matrixVersion, v3Template, defaultOptions, roles, strategies, policies, inputMetrics } from "../services/matching/v3/config";

// Full matching remains disabled while the stage-2 role preview is available.
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
