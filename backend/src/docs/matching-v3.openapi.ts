import { ENGINE_VERSION, IMPLEMENTATION_STAGE, roles, strategies, leagueNames, defaultOptions, matrixVersion } from "../services/matching/v3/config";

type Schema = Record<string, unknown>;
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const obj = (properties: Record<string, Schema>, required = Object.keys(properties), closed = false): Schema => ({ type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: !closed });
const text: Schema = { type: "string" }, integer: Schema = { type: "integer", minimum: 0 };
const id: Schema = { type: "integer", minimum: 1, maximum: 2147483647 };
const nullableScore: Schema = { type: "number", minimum: 0, maximum: 100, nullable: true };
const strings: Schema = { type: "array", items: text };
const json: Schema = { type: "object", additionalProperties: true };
const ids: Schema = { type: "array", items: id, minItems: 1, maxItems: 100, uniqueItems: true };
const date: Schema = { type: "string", format: "date-time" };
const season: Schema = { type: "string", pattern: "^[0-9]{4}/[0-9]{4}$", description: "Hai năm liên tiếp, mùa đã kết thúc; backend kiểm tra cả hai điều kiện.", example: "2025/2026" };
const roleIds: Schema = { type: "array", minItems: 1, maxItems: 35, uniqueItems: true, items: { type: "string", enum: roles.map(r => r.id) }, description: "Các vai trò phải cùng nhóm vị trí nhu cầu CLB; đọc mã từ template." };
const money: Schema = { oneOf: [{ type: "number", minimum: 0 }, { type: "string", pattern: "^[0-9]+(\\.[0-9]{1,2})?$" }], description: "Số tiền không âm, tối đa 13 chữ số nguyên và 2 số thập phân; cùng tiền tệ giữa các đầu vào. Decimal trả trong CRUD/lịch sử là chuỗi." };
const nullableMoney: Schema = { anyOf: [{ type: "number", minimum: 0, nullable: true }, { type: "string", pattern: "^[0-9]{1,13}(\\.[0-9]{1,2})?$" }] };
const envelope = (data: Schema) => obj({ status: { type: "string", enum: ["success"] }, data });
const response = (schema: Schema, description = "Thành công") => ({ description, content: { "application/json": { schema } } });
const errorDescriptions: Record<number, string> = {400:"Body/query không hợp lệ",401:"Token thiếu, sai hoặc hết hạn",403:"Cần quyền Admin",404:"Không có bản ghi trong phạm vi được phép",409:"Cấu hình/xung đột dữ liệu",413:"Body quá lớn",500:"Lỗi server"};
const errorResponses = Object.fromEntries(Object.entries(errorDescriptions).map(([code, description]) => [`Error${code}`, response(ref("Error"), description)]));
const errors = Object.fromEntries(Object.keys(errorDescriptions).map(code => [code, { $ref: `#/components/responses/Error${code}` }]));
const operation = (operationId: string, summary: string, schema: Schema, body?: Schema, status = 200) => ({
  operationId, summary, tags: ["Matching V3"], responses: { [status]: response(schema), ...errors },
  ...(body ? { requestBody: { required: true, content: { "application/json": { schema: body } } } } : {}),
});
const quotePolicy = "Cần ít nhất phí hoặc lương dự kiến. Mỗi khoản có số tiền phải kèm nguồn không rỗng; bỏ khoản phải gửi cả giá trị và nguồn = null. PATCH kiểm tra trạng thái sau khi ghép với bản cũ.";
const pathId = { name: "id", in: "path", required: true, schema: id };
const paging = [{ name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } }, { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }];
const common = {
  requirementId: id, season, roleIds, configId: id, valuationSource: { ...text, maxLength: 255 },
  strategy: { type: "string", enum: Object.keys(strategies) }, pillarWeights: ref("Weights"), options: ref("Options"),
};
const body = (extra: Record<string, Schema>, required: string[]) => ({ ...obj({ ...common, ...extra }, ["requirementId", "season", "roleIds", ...required], true),
  not: { required: ["strategy", "pillarWeights"] }, description: "Không gửi đồng thời strategy và pillarWeights. Bỏ cả hai dùng cấu hình. Không gửi userId. Dữ liệu thiếu trả HTTP 200 với tổng null." });
const baseResult = {
  player: obj({ id, name: text, position: text, age: { type: "number", nullable: true } }), complete: { type: "boolean" },
  status: { type: "string", enum: ["COMPLETE", "INCOMPLETE", "EXCLUDED"] },
  totalScore: nullableScore, financialScore: nullableScore, squadScore: nullableScore, riskScore: nullableScore,
  precision: obj({ total: nullableScore, financial: nullableScore, squad: nullableScore, risk: nullableScore, fee: { type: "number", nullable: true, minimum: 0 } }),
  criteria: obj({ financial: json, squad: json, risk: json, contributions: json }),
  missing: strings, excluded: strings, prosCons: obj({ pros: strings, cons: strings, warnings: strings }),
  saved: { type: "boolean" }, resultId: { ...id, nullable: true },
};
const metaResult = {
  engineVersion: { type: "string", enum: [ENGINE_VERSION] }, implementationStage: { type: "integer", enum: [IMPLEMENTATION_STAGE] },
  requirementId: id, season, evaluatedAt: date,
  config: obj({ id: { ...id, nullable: true }, name: text, version: integer, hash: text, pillarWeights: ref("Weights") }),
  options: ref("Options"), reference: obj({ datasetHash: text, configHash: text, count: integer }),
};
const exampleRequest = { playerId: 1700, requirementId: 42, season: "2025/2026", roleIds: ["POACHER"], strategy: "BALANCED", options: { dataMode: "PROTOTYPE", feeTolerance: .2, wageTolerance: .5 }, save: false };
const schemas: Record<string, Schema> = {
  Error: obj({ status: { type: "string", enum: ["error"] }, message: text }),
  Weights: { ...obj({ financial: { type: "number", minimum: 0 }, squad: { type: "number", minimum: 0 }, risk: { type: "number", minimum: 0 } }, undefined, true), description: "Tổng phải dương; backend chuẩn hóa về 1 và trả trọng số thực trong data.config.pillarWeights." },
  Options: { ...obj({
    dataMode: { type: "string", enum: ["PROTOTYPE", "OBSERVED_ONLY"] },
    minMinutes: { type: "integer", minimum: 0 }, minimumRoleScore: { type: "number", minimum: 0, maximum: 100 },
    allowPositionShift: { type: "boolean" }, feeTolerance: { type: "number", minimum: 0, maximum: 10, description: "0.2 = 20%; đúng giới hạn vẫn đủ điều kiện với điểm phí 0." },
    wageTolerance: { type: "number", minimum: 0, maximum: 10 }, contractMinYears: { type: "number", minimum: 0 }, contractMaxYears: { type: "number", minimum: 0, maximum: 30 },
    holdingYears: { type: "number", minimum: 0, maximum: 30 }, minimumAge: { type: "number", minimum: 0, maximum: 100, nullable: true }, maximumAge: { type: "number", minimum: 0, maximum: 100, nullable: true },
    preferredFoot: { type: "string", enum: ["LEFT", "RIGHT", "BOTH", null], nullable: true }, leagues: { type: "array", uniqueItems: true, items: { type: "string", enum: leagueNames } }, topN: { type: "integer", minimum: 1, maximum: 100 },
  }, [], true), default: defaultOptions, description: "Tuổi chỉ lọc nếu options có minimumAge/maximumAge; không ngầm lấy minAge/maxAge của nhu cầu. contractMinYears ≤ contractMaxYears; minimumAge ≤ maximumAge. Trần điểm tại 900 phút là 65, có thể không qua minimumRoleScore mặc định 70." },
  EvaluateRequest: { ...body({ playerId: id, save: { type: "boolean", default: false } }, ["playerId"]), example: exampleRequest },
  RankRequest: body({ playerIds: ids, page: { type: "integer", minimum: 1, default: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, ["playerIds"]),
  SearchRequest: body({ page: { type: "integer", minimum: 1, default: 1 }, pageSize: { type: "integer", minimum: 1, maximum: 100, default: 20 } }, []),
  CandidateResult: obj(baseResult),
  Evaluation: obj({ ...metaResult, ...baseResult }),
  Ranking: obj({ ...metaResult, saved: { type: "boolean", enum: [false] },
    ranked: { type: "array", items: { allOf: [ref("CandidateResult"), obj({ rank: { type: "integer", minimum: 1 } })] } },
    incomplete: { type: "array", items: ref("CandidateResult") }, excluded: { type: "array", items: ref("CandidateResult") },
    meta: obj({ page: integer, pageSize: integer, topN: integer, totalCandidates: integer, rankedCount: integer, incompleteCount: integer, excludedCount: integer, rankedPages: integer, totalPages: integer }),
  }),
  SquadRequest: obj({ playerId: id, season, configId: id, roleIds, options: obj({ dataMode: { type: "string", enum: ["PROTOTYPE", "OBSERVED_ONLY"] }, allowPositionShift: { type: "boolean" } }, [], true) }, ["playerId", "season"], true),
  RebuildRequest: obj({ season, configId: id, dataMode: { type: "string", enum: ["PROTOTYPE", "OBSERVED_ONLY"] } }, ["season"], true),
  Template: obj({ engineVersion: text, implementationStage: integer, scoringAvailable: { type: "boolean" }, roleScoringAvailable: { type: "boolean" }, matrixVersion: text, config: json, options: ref("Options"), roles: { type: "array", items: obj({ id: text, name: text, description: text, group: text, weights: json }) }, strategies: json, inputMetrics: json, policies: strings }),
  RequirementInput: obj({ clubId: id, position: { type: "string", enum: ["ST","LW","RW","CAM","CDM","CM","CB","RB","LB","GK"] }, minAge: integer, maxAge: integer, budget: money, salaryLimit: money, priority: { type: "integer", minimum: 1 } }, undefined, true),
  QuoteInput: { description: quotePolicy, ...obj({ playerId: id, requirementId: id, estimatedFee: nullableMoney, expectedSalaryPerYear: nullableMoney, feeSource: { ...text, maxLength: 255, nullable: true }, salarySource: { ...text, maxLength: 255, nullable: true } }, ["playerId", "requirementId"], true), anyOf: [
    { required: ["estimatedFee", "feeSource"], properties: { estimatedFee: money, feeSource: { type: "string", minLength: 1, maxLength: 255 } } },
    { required: ["expectedSalaryPerYear", "salarySource"], properties: { expectedSalaryPerYear: money, salarySource: { type: "string", minLength: 1, maxLength: 255 } } },
  ] },
  ShortlistInput: obj({ playerId: id, requirementId: { ...id, nullable: true }, shortlistId: id, priority: { type: "integer", minimum: 1 }, note: { ...text, maxLength: 255, nullable: true } }, ["playerId"], true),
};
const paths: Record<string, unknown> = {
  "/matching/v3/openapi": { get: operation("matchingV3OpenApi", "Hợp đồng OpenAPI JSON nguyên bản, không có envelope", json) },
  "/matching/v3/template": { get: operation("matchingV3Template", "Đọc cấu hình, roleIds và chiến lược", envelope(ref("Template"))) },
  "/matching/v3/squad/preview": { post: operation("matchingV3SquadPreview", "Thử điểm vai trò; không tạo MatchResult", envelope(json), ref("SquadRequest")) },
  "/matching/v3/roles/rebuild": { post: { ...operation("matchingV3Rebuild", "Admin xây cache vai trò; không lưu lịch sử Matching", envelope(json), ref("RebuildRequest")), "x-roles": ["ADMIN"] } },
  "/matching/v3/evaluate": { post: operation("matchingV3Evaluate", "Tính một cầu thủ; save=true chỉ lưu COMPLETE", envelope(ref("Evaluation")), ref("EvaluateRequest")) },
  "/matching/v3/rank": { post: operation("matchingV3Rank", "Xếp hạng 1–100 ID với tập tham chiếu cố định; không lưu", envelope(ref("Ranking")), ref("RankRequest")) },
  "/matching/v3/search": { post: operation("matchingV3Search", "Tự tìm cohort top 5 của mùa; không lưu", envelope(ref("Ranking")), ref("SearchRequest")) },
  "/auth/login": { post: { ...operation("login", "Đăng nhập lấy token 8 giờ", envelope(obj({ accessToken: text, tokenType: { type: "string", enum: ["Bearer"] }, expiresAt: date, user: json })), obj({ email: { type: "string", format: "email", maxLength: 100 }, password: { type: "string", minLength: 1, maxLength: 128 } }, undefined, true)), security: [], tags: ["FE workflow"] } },
  "/auth/me": { get: { ...operation("me", "Kiểm tra phiên hiện tại", envelope(json)), tags: ["FE workflow"] } },
  "/auth/logout": { post: { ...operation("logout", "Hủy token hiện tại", json, undefined, 204), responses: { "204": { description: "Đăng xuất, không có body" }, ...errors }, tags: ["FE workflow"] } },
  "/clubs": { get: { ...operation("clubs", "Đọc CLB để chọn trong form", envelope({ type: "array", items: json })), tags: ["FE workflow"] } },
  "/club-requirements": {
    get: { ...operation("requirements", "Đọc nhu cầu trong phạm vi tài khoản", envelope({ type: "array", items: json })), tags: ["FE workflow"] },
    post: { ...operation("createRequirement", "Tạo nhu cầu; userId lấy từ token", envelope(json), ref("RequirementInput"), 201), tags: ["FE workflow"] },
  },
  "/club-requirements/{id}": { parameters: [pathId],
    get: operation("requirement", "Đọc nhu cầu; Scout khác chủ trả 404", envelope(json)),
    patch: operation("updateRequirement", "Sửa nhu cầu; cần gọi Matching lại, lịch sử cũ giữ nguyên", envelope(json), obj(schemas.RequirementInput!.properties as Record<string, Schema>, [], true)),
  },
  "/matching-inputs": { get: { ...operation("quotes", "Đọc phí/lương dự kiến theo nhu cầu và cầu thủ", { ...envelope({ type: "array", items: json }), properties: { ...(envelope(json).properties as object), data: { type: "array", items: json }, meta: json } }), parameters: [...paging, { name: "playerId", in: "query", schema: id }, { name: "requirementId", in: "query", schema: id }] },
    post: operation("createQuote", "Tạo báo giá theo nhu cầu; một bản ghi cho mỗi cặp", envelope(json), ref("QuoteInput"), 201) },
  "/matching-inputs/{id}": { parameters: [pathId], patch: operation("updateQuote", "Sửa phí/lương dự kiến theo ID báo giá", envelope(json), { description: quotePolicy, minProperties: 1, ...obj({ estimatedFee: nullableMoney, expectedSalaryPerYear: nullableMoney, feeSource: { ...text, maxLength: 255, nullable: true }, salarySource: { ...text, maxLength: 255, nullable: true } }, [], true) }) },
  "/match-results": { get: { ...operation("history", "Lịch sử; điểm Decimal là chuỗi, dữ liệu có thể thuộc V1 hoặc V3", envelope({ type: "array", items: json })), parameters: [...paging, { name: "playerId", in: "query", schema: id }, { name: "requirementId", in: "query", schema: id }] } },
  "/match-results/{id}": { parameters: [pathId], get: operation("historyDetail", "Snapshot của lần tính; xem inputSnapshot.engineVersion", envelope(json)) },
  "/shortlists": { get: operation("shortlistItems", "Đọc các mục đã lưu trong phạm vi tài khoản", envelope({ type: "array", items: json })), post: operation("addShortlistItem", "Lưu cầu thủ khi người dùng chọn; trùng trong cùng danh sách trả 409", envelope(json), ref("ShortlistInput"), 201) },
  "/shortlists/{id}": { parameters: [pathId], patch: operation("updateShortlistItem", "Sửa ghi chú/ưu tiên/nhu cầu của mục", envelope(json), obj({ requirementId: { ...id, nullable: true }, note: { ...text, nullable: true, maxLength: 255 }, priority: { type: "integer", minimum: 1 } }, [], true)), delete: { operationId: "removeShortlistItem", summary: "Xóa mục shortlist", responses: { "204": { description: "Đã xóa, không có body" }, ...errors } } },
};

export const matchingV3OpenApi = {
  openapi: "3.0.3", info: { title: "Football Transfer — Matching V3 & FE workflow", version: ENGINE_VERSION,
    description: "Hợp đồng của sáu API Matching V3 và các bước kết nối FE. Không phải danh mục CRUD toàn bộ backend. Bearer token dạng opaque, không phải JWT. Điểm live là number/null; Decimal trong CRUD/lịch sử là string. Null là chưa biết, không phải 0. Chọn nguồn giá nếu có nhiều nguồn; dữ liệu thiếu vẫn HTTP 200. Bản mô tả được sinh từ mã nguồn, không chứa token hay tài khoản mẫu thật." },
  servers: [{ url: "http://localhost:3000/api", description: "Đổi URL này thành backend của bạn" }],
  security: [{ bearerAuth: [] }], tags: [{ name: "Matching V3" }, { name: "FE workflow" }], paths,
  components: { responses: errorResponses, securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "accessToken từ POST /auth/login" } }, schemas },
  "x-engine-version": ENGINE_VERSION, "x-matrix-version": matrixVersion,
};
