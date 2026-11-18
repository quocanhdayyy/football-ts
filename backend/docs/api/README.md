# API backend

Chọn mục để đọc đúng phần cần dùng:

- [Xác thực và phân quyền](#access)
- [API quản lý thực thể](#entities)
- [Matching V3 — F/S/R, xếp hạng và lịch sử](#matching-v3)
- [Bàn giao FE, OpenAPI và thứ tự gọi](#fe-handoff)

## Access

Xác thực và phân quyền.

Đăng nhập bằng `POST /api/auth/login` với `{ "email": "...", "password": "..." }`.
Gửi `Authorization: Bearer <accessToken>` cho mọi API dữ liệu. Token có hiệu lực 8 giờ.
`GET /api/auth/me` trả tài khoản; `POST /api/auth/logout` hủy token.
`GET /api/health` và đăng nhập không cần token. Chưa có đăng ký công khai.

| Nhóm API | SCOUT | ADMIN |
| --- | --- | --- |
| clubs, players, contracts, player-stats, injury-history | Chỉ GET | CRUD |
| users | Không truy cập; dùng auth/me xem mình | CRUD |
| club-requirements, shortlists | CRUD dữ liệu của mình | CRUD tất cả |

POST nhu cầu và Shortlist tự lấy chủ sở hữu từ token, kể cả khi Admin tạo mới.
**Không gửi `userId` trong body**. Nếu gửi, API trả 400.
PATCH không đổi chủ sở hữu. API danh sách của Scout chỉ trả dữ liệu của Scout đó.
ID cá nhân của người khác trả 404 để không tiết lộ sự tồn tại của dữ liệu.
401 = thiếu/sai token; 403 = không có quyền; 404 = không tìm thấy bản ghi trong phạm vi được phép.

API `/api/player-stats/:id` dùng **ID thống kê**, trả `playerId` và `playerName` để nhận diện cầu thủ. Thống kê quan sát giữ nguyên; `estimate` chứa ước tính cơ bản cũ và `metrics` chứa [đầu vào V3](../data/README.md#v3-metrics). Mỗi `metrics.values.<chỉ_số>` có `value`, `unit`, `status`, `basis` và căn cứ. `metrics.stale=true` khi hồ sơ/thống kê nền thay đổi; cần chạy lại bước chuẩn bị trước khi dùng. Sửa thống kê qua API xóa cả hai bộ suy luận cũ. Engine V3 dùng metrics còn hợp lệ theo chế độ dữ liệu đã chọn.

API danh sách `/api/player-stats` giữ dữ liệu cơ bản và `estimate`; phần `metrics` chỉ trả trong API chi tiết để tránh tải bằng chứng của toàn bộ cầu thủ cùng lúc.

V3 có namespace riêng `/api/matching/v3`; template hiện trả `implementationStage:4`, `scoringAvailable:true`, `roleScoringAvailable:true`. [Hợp đồng V3](#matching-v3) bên dưới. Admin có thể nhập `positionMinutes` kèm `positionMinutesSource` qua CRUD thống kê, và `bodyRegion` qua `/api/injury-history`. Chỉ sửa phút theo vị trí không xóa metrics; sửa thống kê nền sẽ xóa bộ suy luận. Engine V1 đã được gỡ; endpoint Matching duy nhất là `/api/matching/v3/*`. URL cũ trả 404.

### Admin đầu tiên

Trong thư mục backend chạy `npm run admin:create`, nhập username, email và mật khẩu.
Mật khẩu không hiển thị trên Terminal. Lệnh chỉ tạo Admin đầu tiên và không sửa tài khoản có sẵn.
Sau đó Admin có thể tạo tài khoản khác qua POST /api/users.

### Bảo vệ tài khoản quản trị

PATCH `/api/users/:id` và DELETE `/api/users/:id` trả HTTP 409 nếu thao tác xóa/hạ quyền Admin cuối cùng. Admin cũng không được tự xóa hoặc tự hạ quyền ngay cả khi còn admin khác. Sửa username/email/password của chính mình và gửi role ADMIN để giữ nguyên quyền vẫn được phép.

Các thao tác ghi qua API quản lý user lấy khóa transaction chung trong PostgreSQL, sau đó đọc lại role của người thao tác và đếm admin trên dữ liệu vừa commit. Hai admin đồng thời hạ quyền/xóa nhau không thể cùng làm mất quyền quản trị: sau thao tác đầu, người đã bị hạ quyền hoặc xóa sẽ bị từ chối với 403 khi request đang chờ tiếp tục. Đây là kiểm tra quyền trong transaction, ngoài middleware xác thực.

Bootstrap `npm run admin:create` vẫn tạo admin đầu tiên khi chưa có admin. Các lỗi 404 (không có user), 409 (email/username trùng hoặc user còn được tham chiếu) giữ nguyên. Response không trả passwordHash.


### Ví dụ body mới

POST /api/club-requirements:
```json
{"clubId":1,"position":"CM","minAge":18,"maxAge":25,"budget":"30000000","salaryLimit":"2000000","priority":1}
```

POST /api/shortlists:
```json
{"playerId":4,"requirementId":3,"note":"Theo dõi"}
```

Phải dùng nhu cầu thuộc cùng chủ sở hữu Shortlist. Frontend chỉ hiển thị chức năng theo role;
backend luôn kiểm tra quyền, không dựa vào việc frontend ẩn nút.


### API mở rộng

- /api/transfers: Scout đọc; Admin CRUD.
- /api/shortlist-lists: quản lý danh sách có tên theo chủ sở hữu.
- /api/shortlist-items: alias rõ nghĩa cho /api/shortlists, hỗ trợ chọn shortlistId khi tạo.
- /api/notifications: chủ sở hữu đọc/đánh dấu đã đọc/xóa; Admin được tạo.
- /api/scoring-configs: Admin quản lý; Scout đọc cấu hình active.
- /api/match-results: đọc/xóa lịch sử theo chủ sở hữu, không tự nhập điểm.
- /api/audit-logs: chỉ Admin đọc.
- /api/market-value-history: Scout đọc; Admin CRUD lịch sử định giá.
- /api/matching-inputs: Scout CRUD theo chủ yêu cầu CLB; Admin quản lý tất cả. Chủ dữ liệu lấy từ yêu cầu, không nhận userId trong body.
- /api/player-data-verifications: Scout đọc; Admin PATCH tạo/cập nhật hoặc DELETE xác minh, ID trên đường dẫn là ID cầu thủ.
- /api/players: Admin có thể tạo/sửa thêm secondaryPositions; body cũ vẫn tương thích.

Chi tiết request/response và giới hạn ở [API các thực thể](README.md#entities).

- POST /api/matching/search: tự lấy ứng viên thuộc bộ dữ liệu nhập 5 giải mùa 2025/2026, chấm và phân trang. Không yêu cầu playerIds, không lưu lịch sử; chưa thêm điều kiện loại theo vị trí/tuổi/phí/lương. Xem [hướng dẫn](README.md#search).

## Entities

API quản lý thực thể.

Tất cả endpoint cần `Authorization: Bearer <accessToken>` từ POST /api/auth/login.
Response thành công: `{ "status": "success", "data": ... }`.
Danh sách mới có `meta: { page, pageSize, total }`, page mặc định 1, pageSize mặc định 20/tối đa 100.
401 thiếu/sai token; 403 sai role; 404 không có dữ liệu trong phạm vi được phép;
400 sai đầu vào; 409 trùng, tham chiếu sai hoặc thao tác xung đột.
Các example là dữ liệu minh họa, phải dùng ID có thật.

### Transfer

GET /api/transfers — Scout/Admin, lọc playerId, clubId, page, pageSize.
GET /api/transfers/:id — Scout/Admin.
POST /api/transfers — Admin.
PATCH /api/transfers/:id — Admin, chỉ gửi trường cần sửa.
DELETE /api/transfers/:id — Admin, trả 204.

```json
{
  "playerId": 4,
  "fromClubId": null,
  "toClubId": 1,
  "transferDate": "2026-07-01",
  "type": "FREE",
  "fee": "0",
  "reliability": "OFFICIAL",
  "source": "Nguồn xác nhận thương vụ"
}
```

- type: PERMANENT, LOAN, FREE. CLB đi có thể null, CLB đến bắt buộc.
- fee: chuỗi/số không âm, tối đa 2 số thập phân, đơn vị EUR; null = chưa biết.
- Có fee thì phải có source và reliability khác UNKNOWN.
- reliability: UNKNOWN, RUMOR, REPUTABLE_PRESS, OFFICIAL, FINANCIAL_REPORT.
- FREE không có fee dương; CLB đi/đến không được giống nhau.
- Ngày YYYY-MM-DD. Tạo Transfer chưa tự sửa Contract/Player hay phát thông báo.

### Shortlist và ShortlistItem

GET /api/shortlist-lists — danh sách có tên, kèm _count.items.
GET /api/shortlist-lists/:id — thông tin danh sách.
GET /api/shortlist-lists/:id/items — các mục, phân trang và sắp ưu tiên tăng dần.
POST /api/shortlist-lists — `{ "name": "Tiền vệ hè 2027" }`.
PATCH /api/shortlist-lists/:id — `{ "name": "Tên mới" }`.
DELETE /api/shortlist-lists/:id — chỉ xóa khi không còn mục; còn mục trả 409.

Scout chỉ truy cập danh sách của mình, Admin truy cập tất cả; POST luôn tạo cho User từ token.

API các mục: /api/shortlist-items có GET danh sách, GET /:id, POST, PATCH /:id, DELETE /:id.
/api/shortlists là alias cũ, giữ tương thích. Danh sách item toàn cục hiện chưa phân trang;
frontend ưu tiên GET /api/shortlist-lists/:id/items khi hiển thị theo danh sách.

POST item:
```json
{"shortlistId": 1, "playerId": 4, "requirementId": 3, "note": "Theo dõi", "priority": 1}
```

Không gửi userId. Bỏ shortlistId thì dùng danh sách mặc định. priority >= 1,
số nhỏ hơn có ưu tiên trước; note tối đa 255 ký tự, cho phép null.
requirementId có thể null; nếu có phải thuộc cùng chủ sở hữu.
Không trùng cầu thủ/nhu cầu trong cùng danh sách; cùng cầu thủ có thể nằm ở các danh sách khác.
PATCH item chỉ nhận note, priority, requirementId, không đổi danh sách/cầu thủ/chủ sở hữu.

### Notification

GET /api/notifications — danh sách của mình; Admin xem tất cả. Lọc unread=true/false, page, pageSize.
GET /api/notifications/:id — trong phạm vi sở hữu hoặc Admin.
POST /api/notifications — chỉ Admin tạo thủ công.
PATCH /api/notifications/:id — `{ "isRead": true }` hoặc false.
DELETE /api/notifications/:id — chủ sở hữu/Admin, trả 204.

```json
{"userId":6,"playerId":4,"type":"CONTRACT_EXPIRING","title":"Hợp đồng sắp hết hạn","content":"Thông báo mẫu","eventKey":"contract:123:6months"}
```

Các type: CONTRACT_RENEWED, CONTRACT_TERMINATED, CONTRACT_EXPIRING,
MARKET_VALUE_CHANGED, RELEASE_CLAUSE_CHANGED, INJURY_RECORDED.
eventKey bắt buộc; cùng User/eventKey không được tạo hai lần. playerId có thể null.
Không cho client tự sửa nội dung/người nhận/ngày gửi. Chưa có Scheduler, FCM hoặc APNs.

### ScoringConfig

GET /api/scoring-configs/active — Scout/Admin, 404 khi chưa kích hoạt cấu hình.
Các endpoint sau chỉ Admin:
- GET /api/scoring-configs — phân trang.
- GET /api/scoring-configs/:id.
- POST /api/scoring-configs.
- PATCH /api/scoring-configs/:id — sửa bản chưa có kết quả.
- POST /api/scoring-configs/:id/activate — chuyển active trong transaction.
- DELETE /api/scoring-configs/:id — chỉ khi không active và không có kết quả.

Tạo cấu hình từ `data.config` của GET `/api/matching/v3/template`, đổi name/version rồi POST. Chỉ nhận `parameters.engineVersion = "matching-v3.0.0"` và ma trận hiện hành. Cấu hình unversioned/V1 bị từ chối. Trọng số S dùng `{ "role": 1 }`; các quy tắc V3 được kiểm tra đầy đủ trước khi lưu/kích hoạt.

Không gửi isActive; dùng endpoint activate. Chỉ một cấu hình V3 được active; endpoint danh sách/chi tiết/active chỉ trả V3. Cấu hình cũ được giữ nếu cần đọc snapshot lịch sử nhưng không thể kích hoạt lại. Phiên bản đã có MatchResult không được sửa; tạo version mới thay vì ghi đè.

### MatchResult

GET /api/match-results — lịch sử của mình, Admin xem tất cả; lọc playerId, requirementId, page, pageSize.
GET /api/match-results/:id — chủ sở hữu/Admin.
DELETE /api/match-results/:id — chủ sở hữu/Admin, trả 204.
POST/PATCH không hỗ trợ, trả 405. Không cho client nhập/sửa điểm.
Engine tạo kết quả qua POST /api/matching/evaluate khi gửi save=true và đủ dữ liệu. Danh sách vẫn rỗng nếu chưa có lần chấm đủ điểm được lưu.

### AuditLog

Chỉ Admin:
GET /api/audit-logs — lọc entityType, entityId, actorId, from, to, page, pageSize.
GET /api/audit-logs/:id.
from/to là YYYY-MM-DD, bao gồm cả ngày to, thời gian lọc chuẩn UTC.
Không có API tạo/sửa/xóa log; các method đó trả 405.

Hiện tự ghi log nguyên tử với thay đổi Transfer, Shortlist (danh sách có tên), ScoringConfig,
Player qua API và ba nhóm dữ liệu Matching bên dưới.
Chưa gắn Audit vào toàn bộ các API master cũ hoặc các mục ShortlistItem.
Chưa chuyển các thao tác DELETE hiện có sang xóa mềm.
Không ghi mật khẩu/token vào log.

### Vị trí phụ của cầu thủ

API `/api/players` hiện nhận thêm `secondaryPositions`, không bắt buộc khi tạo.
Scout đọc; chỉ Admin tạo/sửa/xóa như trước.

PATCH /api/players/4:

```json
{"secondaryPositions":["CDM","CAM"]}
```

- Bỏ trường khi POST thì mặc định `[]`; PATCH gửi `[]` để xóa toàn bộ vị trí phụ.
- Mã được trim và chuyển thành chữ hoa; không được trùng nhau hoặc vị trí chính.
- Khi đổi vị trí chính sang vị trí đang nằm trong danh sách phụ, gửi cả hai trường trong một PATCH, ví dụ `{"position":"CDM","secondaryPositions":["CM"]}`.
- Không mặc định cầu thủ đá được các vị trí khác chỉ vì cùng nhóm.
- GET danh sách/chi tiết trả thêm mảng vị trí phụ. Body cũ không có trường này vẫn dùng được.

### Lịch sử giá trị thị trường

GET /api/market-value-history — Scout/Admin, lọc playerId, page, pageSize.
GET /api/market-value-history/:id — Scout/Admin.
POST /api/market-value-history — Admin.
PATCH /api/market-value-history/:id — Admin.
DELETE /api/market-value-history/:id — Admin, trả 204.

POST example:

```json
{
  "playerId":4,
  "valuedAt":"2025-10-01",
  "marketValue":"20000000",
  "source":"Dữ liệu mô phỏng phục vụ đồ án",
  "reliability":"UNKNOWN"
}
```

- Giá trị EUR không âm, tối đa 2 số thập phân; source bắt buộc, tối đa 255 ký tự.
- valuedAt là YYYY-MM-DD hợp lệ, không nằm trong tương lai.
- reliability nhận cùng enum với Transfer; có thể bỏ qua để mặc định UNKNOWN, không tự coi là nguồn đã kiểm chứng.
- Không trùng playerId/valuedAt/source; cùng ngày nhưng nguồn khác được lưu riêng.
- PATCH không đổi playerId/recordedAt; ngày sửa không được sau ngày ghi nhận ban đầu. Lần định giá mới phải POST một bản ghi mới.
- Không tự sửa `Player.marketValue`, chọn giá dùng cho Matching hoặc gửi thông báo. Cần quy tắc chọn nguồn/ngày đối chiếu trước khi triển khai Engine.

### Phí và lương dự kiến cho Matching

GET /api/matching-inputs — lọc playerId, requirementId, page, pageSize.
GET /api/matching-inputs/:id.
POST /api/matching-inputs.
PATCH /api/matching-inputs/:id.
DELETE /api/matching-inputs/:id — trả 204.

Scout chỉ truy cập dữ liệu thuộc yêu cầu CLB của mình. Admin được quản lý tất cả.
Khi Admin tạo cho một yêu cầu, chủ dữ liệu là chủ yêu cầu lấy từ DB, không phải tự gán cho Admin.
Không gửi userId trong body. ID ngoài phạm vi Scout trả 404.

POST example, dùng requirementId thuộc tài khoản đang đăng nhập hoặc Admin:

```json
{
  "playerId":4,
  "requirementId":3,
  "estimatedFee":"70000000",
  "feeSource":"Ước tính mô phỏng cho thương vụ",
  "expectedSalaryPerYear":"11000000",
  "salarySource":"Yêu cầu lương mô phỏng"
}
```

- Phí là EUR; lương là EUR/năm; không âm, tối đa 2 số thập phân.
- Phải biết ít nhất phí hoặc lương. Khoản đã biết phải có nguồn tương ứng không rỗng, tối đa 255 ký tự.
- `0` là đã ước tính bằng 0; `null` là chưa biết. Không tự thay null bằng lương hiện tại hoặc giá trị thị trường.
- Vượt budget/salaryLimit vẫn được lưu để Engine chấm theo công thức đã bàn.
- Duy nhất một bản ghi cho mỗi cặp requirementId/playerId; tạo trùng trả 409.
- PATCH chỉ sửa số tiền/nguồn; không đổi cầu thủ, yêu cầu hoặc chủ sở hữu.
- Khi xóa một khoản, gửi cả khoản đó và nguồn bằng null; nếu xóa cả hai khoản thì dùng DELETE.
- updatedAt do server quản lý. Các lần sửa ghi audit; đây chưa phải kết quả chấm điểm.

Ví dụ bỏ phí, giữ lương đã có:

```json
{"estimatedFee":null,"feeSource":null}
```

### Xác minh hồ sơ cầu thủ

GET /api/player-data-verifications — Scout/Admin, lọc playerId, page, pageSize.
GET /api/player-data-verifications/:playerId — Scout/Admin; chưa có hồ sơ trả 404.
PATCH /api/player-data-verifications/:playerId — Admin, tạo nếu chưa có hoặc cập nhật hồ sơ.
DELETE /api/player-data-verifications/:playerId — Admin, xóa xác minh, trả 204.

ID trên đường dẫn là **ID cầu thủ**, không phải một ID xác minh riêng.
PATCH trả 200. Mỗi phần được gửi phải đầy đủ; phần bỏ qua giữ nguyên. Không gửi body rỗng.

```json
{
  "injuryHistory":{
    "coveredFrom":"2024-10-01",
    "coveredThrough":"2026-10-01",
    "source":"Hồ sơ đã đối chiếu; ví dụ minh họa"
  },
  "registration":{
    "status":"CONTRACTED",
    "asOf":"2026-10-01",
    "source":"Xác nhận hợp đồng; ví dụ minh họa"
  }
}
```

- injuryHistory xác nhận dữ liệu đầy đủ trong khoảng coveredFrom–coveredThrough, không khẳng định cầu thủ không từng chấn thương. Các đợt nghỉ vẫn nằm trong InjuryHistory.
- registration nhận CONTRACTED hoặc FREE_AGENT tại ngày asOf. Không gửi UNKNOWN; dùng `registration: null` để xóa xác nhận và về UNKNOWN.
- `injuryHistory: null` xóa riêng xác minh lịch sử chấn thương.
- Ngày phải tồn tại, không nằm trong tương lai hoặc trước ngày sinh; coveredThrough không trước coveredFrom.
- Người xác minh và thời điểm xác minh do server lấy từ Admin/token và thời gian hiện tại; client không được gán.
- FREE_AGENT xung đột hợp đồng ACTIVE có khoảng ngày bao phủ asOf trả 409, không tự xóa hay chấm dứt hợp đồng để hợp thức hóa xác nhận.
- Không tự sửa Contract, tạo InjuryHistory, thay đổi trạng thái tương lai hoặc sinh điểm Matching.
- Xác nhận cũ không bảo đảm tình trạng vẫn đúng sau này. Engine cần xét ngày xác nhận, hợp đồng và phạm vi hồ sơ khi sử dụng.

### Thử và kiểm tra

Trang `/login` đã thêm ba lựa chọn GET mới vào mục Thử API backend, dùng phiên đăng nhập hiện tại.
Chọn Xác minh hồ sơ thì ô ID phải là ID cầu thủ. Danh sách rỗng là chưa có dữ liệu, không phải lỗi.
Trang thử hiện chỉ đọc; dùng HTTP client/Terminal để gửi các request tạo/sửa/xóa trong ví dụ.

Trong thư mục backend, `npm run test:matching-api` kiểm tra các endpoint mới bằng tài khoản và dữ liệu tạm, rồi dọn fixture.
`npm run test:matching-data` kiểm tra ràng buộc database bằng transaction rollback.

<a id="matching-v3"></a>

## Matching V3 — giai đoạn 3

Tất cả cần `Authorization: Bearer <accessToken>`; dùng ID cầu thủ, không dùng ID thống kê. [Công thức, chính sách thiếu dữ liệu và snapshot](../data/README.md#v3-stage-3).

| Endpoint | Công dụng |
| --- | --- |
| GET `/api/matching/v3/template` | Cấu hình mẫu, 35 roleIds, bốn chiến lược, options mặc định |
| POST `/api/matching/v3/squad/preview` | Điểm vai trò riêng; không cần nhu cầu CLB |
| POST `/api/matching/v3/roles/rebuild` | Admin xây cache vai trò theo mùa |
| POST `/api/matching/v3/evaluate` | F/S/R một cầu thủ, tùy chọn lưu lịch sử |
| POST `/api/matching/v3/rank` | Xếp hạng danh sách 1–100 ID |
| POST `/api/matching/v3/search` | Tự tìm ứng viên import top 5 trong mùa |

Body evaluate mẫu (thay requirementId bằng nhu cầu ST thuộc quyền mình):

```json
{
  "playerId": 1700,
  "requirementId": 42,
  "season": "2025/2026",
  "roleIds": ["POACHER"],
  "strategy": "BALANCED",
  "options": {
    "dataMode": "PROTOTYPE",
    "feeTolerance": 0.2,
    "wageTolerance": 0.5,
    "minMinutes": 900,
    "minimumRoleScore": 70
  },
  "save": false
}
```

`season` bắt buộc là YYYY/YYYY liên tiếp đã kết thúc. `roleIds` bắt buộc, lấy mã từ template và thuộc nhóm vị trí của nhu cầu. Có thể thêm `configId`, `valuationSource`; bỏ configId dùng cấu hình V3 active nếu có, nếu không dùng mặc định đã công bố. Admin được thử cấu hình V3 riêng, Scout dùng cấu hình active hoặc bản mặc định đúng template. Lưu lịch sử cần cấu hình đã tồn tại trong DB; chuẩn bị bằng `npm run matching:v3:prepare -- --actor-id <ADMIN_ID>` nếu chưa có. Không tự kích hoạt cấu hình.

Chọn `MONEYBALL`, `BALANCED`, `LONG_TERM`, `IMMEDIATE_ROLE`; hoặc bỏ strategy và gửi `pillarWeights:{"financial":30,"squad":50,"risk":20}`. Backend chuẩn hóa về tổng 1. Không gửi cả hai; bỏ cả hai dùng trọng số cấu hình. Không gửi `userId`.

Các options còn lại (không gửi thì dùng mặc định): `allowPositionShift:false`, `contractMinYears:2`, `contractMaxYears:4`, `holdingYears:3`, `minimumAge:null`, `maximumAge:null`, `preferredFoot:null`, `leagues:[]`, `topN:10`. Giải nhận đúng tên Premier League, La Liga, Bundesliga, Serie A, Ligue 1. Tuổi chỉ lọc khi gửi options tương ứng. Dung sai dùng tỷ lệ: 0.2 = 20%, không phải 20.

Rank dùng body chung nhưng bỏ `playerId`/`save`, thêm `playerIds:[1700,369]`, `page:1`, `pageSize:20` (tối đa 100). Search bỏ thêm `playerIds`; chỉ tìm trong cohort import của mùa. Không lọc lại tập percentile theo danh sách ID hay options giải. Rank/search không nhận save.

Response có envelope `{status:"success",data:...}`. Evaluate trả `status` COMPLETE/INCOMPLETE/EXCLUDED, `player` (ID/tên/vị trí/tuổi), điểm F/S/R/tổng, `precision`, `criteria`, `missing`, `excluded`, `prosCons`, `saved`, `resultId`; kèm config/weights/options/reference hash. Thiếu dữ liệu hoặc bị loại vẫn HTTP 200, tổng null, không lưu.

Rank/search trả `ranked`, `incomplete`, `excluded`, `meta`. Xếp hạng toàn bộ rồi mới giới hạn topN và phân trang. Ba danh sách phân trang độc lập cùng page/pageSize; `rankedPages` cho danh sách xếp hạng, `totalPages` cho trang xa nhất của cả ba; `rankedCount` là tổng người đủ điểm trước topN. `meta.totalCandidates` là số ứng viên được xét. Mở chi tiết từng người để giải thích thiếu/loại, không coi null là 0.

`save:true` chỉ lưu COMPLETE vào MatchResult + AuditLog; đọc lại qua GET `/api/match-results/:id` theo phân quyền hiện có. Snapshot có `engineVersion`, nguồn, cấu hình và trọng số thực của lần tính. Thay dữ liệu hiện tại không sửa lịch sử cũ. Không tự thêm shortlist. Form `/login` chỉ còn Matching V3 và bản thử vai trò V3.


<a id="fe-handoff"></a>

## Bàn giao FE — giai đoạn 4

Hợp đồng máy đọc: [matching-v3.openapi.json](matching-v3.openapi.json). Import file này vào Postman hoặc công cụ hỗ trợ OpenAPI 3.0; đổi server URL thành backend đang chạy. File bao gồm sáu API chấm điểm/cấu hình V3 và các thao tác đăng nhập, nhu cầu CLB, báo giá, lịch sử, shortlist cần cho luồng FE; **không phải tài liệu mọi CRUD**. Admin chuẩn bị hồ sơ/hợp đồng/y tế theo các mục thực thể ở trên.

`GET /api/matching/v3/openapi` cũng trả cùng tài liệu JSON nguyên bản, không có envelope `status/data`, cần Bearer token như các route V3 khác. File không chứa mật khẩu/token. Sinh lại bằng `npm run matching:v3:openapi`; kiểm tra file không bị cũ bằng `npm run matching:v3:openapi -- --check`. Registry vai trò, chiến lược và phiên bản lấy từ mã nguồn; kiểm thử kiểm tra file export khớp route thực.

### Thứ tự gọi trong ứng dụng FE

| Bước | API | ID cần giữ / cách xử lý |
| --- | --- | --- |
| 1. Đăng nhập | POST `/api/auth/login` | Giữ accessToken và expiresAt; token là chuỗi opaque, không giải mã JWT |
| 2. Nạp form | GET `/api/clubs`, GET `/api/matching/v3/template` | Chọn clubId, vị trí, roleIds và chiến lược |
| 3. Lưu nhu cầu | POST `/api/club-requirements` | Lấy `data.id` làm **requirementId**; owner lấy từ token |
| 4. Báo giá, nếu đã có | POST `/api/matching-inputs` | Gắn requirementId + playerId; giữ ID báo giá để PATCH |
| 5. Tìm ứng viên | POST `/api/matching/v3/search` | Gửi requirementId, season, roleIds, strategy/options; hiển thị ba nhóm ranked/incomplete/excluded |
| 6. Xem/chấm riêng | POST `/api/matching/v3/evaluate` | Gửi playerId; xem điểm, tiêu chí, cảnh báo và phần thiếu |
| 7. Lưu lần tính | evaluate với save:true | Chỉ COMPLETE mới saved:true và có resultId; không tự thêm shortlist |
| 8. Chọn cầu thủ | POST `/api/shortlists` | user chọn thì gửi playerId, requirementId, note; trùng cùng danh sách trả 409 |
| 9. Xem lại | GET `/api/match-results/:id`, GET `/api/shortlists` | Snapshot giữ đầu vào cũ. Sửa nhu cầu hoặc báo giá phải gọi Matching lại |

Các API CRUD dùng envelope `{status:"success",data:...}`. Live Matching trả điểm number/null; lịch sử và các trường tiền của Prisma Decimal trả chuỗi. Không dùng `Number(null)` để hiển thị điểm vì sẽ thành 0. HTTP 200 chưa chắc đủ điểm: kiểm tra `data.status`, `complete`, `missing`, `excluded` và `saved`.

**Không nhầm các ID:** `/players/:id` nhận playerId; `/player-stats/:id` nhận ID thống kê; requirementId là ID nhu cầu, không phải clubId. Ví dụ Haaland playerId 1700, ID thống kê 1621 trong dữ liệu local này; máy khác cần tra theo response, không hardcode ID vào FE.

Khi tạo nhu cầu, gửi đủ clubId/position/minAge/maxAge/budget/salaryLimit/priority. Với V3, bộ lọc tuổi chỉ bật khi gửi thêm options.minimumAge/maximumAge khi gọi Matching; FE có thể chuyển hai giá trị người dùng nhập sang options nếu muốn lọc cứng. Các vai trò phải thuộc nhóm vị trí cần: CB → CB; RB/LB → FULLBACK; CM/CDM → MIDFIELD; CAM → CAM; LW/RW → WING; ST → ST; GK → GK. Lọc menu vai trò từ `template.roles` theo nhóm này.

Báo giá phải biết ít nhất phí hoặc lương dự kiến và **mỗi số tiền phải có nguồn đi kèm**. Ví dụ:

```json
{
  "playerId": 1700,
  "requirementId": 42,
  "estimatedFee": "60000000",
  "feeSource": "Báo giá do scout cung cấp",
  "expectedSalaryPerYear": "10000000",
  "salarySource": "Yêu cầu lương do scout cung cấp"
}
```

Các con số trên chỉ minh họa payload, không phải dữ liệu thật của Haaland. Khi bỏ lương ở PATCH, gửi cả `expectedSalaryPerYear:null` và `salarySource:null`; không thể bỏ cả phí và lương cùng lúc (muốn bỏ cả bản ghi dùng DELETE matching-inputs/:id). Đây là đầu vào do người dùng cung cấp, không tự được xác minh bởi engine.

### Gọi API từ FE

Ví dụ helper tối thiểu (truyền token từ state phiên của ứng dụng):

```js
const API_BASE = "http://localhost:3000/api";
async function api(path, { token, method = "GET", body } = {}) {
  const response = await fetch(API_BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return null;
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || "Không gọi được API");
    error.status = response.status;
    throw error;
  }
  return payload.data;
}
```

Helper này dùng cho API envelope, không dùng cho route OpenAPI trả JSON nguyên bản. 401: xóa phiên trong FE và về đăng nhập; 403: thiếu quyền; 404: ID không tồn tại hoặc ngoài phạm vi; 409: cấu hình/xung đột cần xử lý theo message. INCOMPLETE/EXCLUDED là kết quả nghiệp vụ HTTP 200, không phải lỗi mạng. Lịch sử chỉ giữ khi saved:true. Khi chuyển trang search, dùng page/pageSize trên cùng điều kiện; ba danh sách phân trang độc lập và totalPages có thể lớn hơn rankedPages.

Các mã thường gặp: `wageForEligibility`/`financial.salary` = thiếu lương dự kiến; `financial.contract` = thiếu thời hạn hợp đồng hợp lệ; `risk.injuryCoverage24Months` = chưa xác minh đủ lịch sử; `feeAboveTolerance`/`wageAboveTolerance` = vượt dung sai; `positionNotEligible` = không đủ điều kiện chuyển nhóm; `roleScoreBelowMinimum` = điểm vai trò thấp hơn ngưỡng. Mã `squad.<role>.<metric>:<reason>` nêu chỉ số và lý do cụ thể; FE giữ chi tiết/cảnh báo, không thay dữ liệu thiếu bằng 0.

FE ở máy khác cần một backend URL truy cập được hoặc database/dữ liệu của riêng máy đó. Clone Git chỉ lấy mã nguồn/migration, không mang PostgreSQL trên máy tác giả theo. Không cần FE kết nối thẳng vào database; FE gọi backend API.


### Chuyển từ backend cũ sang chỉ dùng V3

Chạy `npx prisma migrate deploy --config prisma7.config.ts` rồi khởi động lại backend. Migration `20261118090000_retire_matching_v1` tắt active của cấu hình cũ, giữ V3 active nếu đã có; nếu chưa có thì tạo/chọn cấu hình mặc định V3 trong DB. CHECK `scoring_configs_active_v3_only` chặn kích hoạt engine khác qua SQL. Unique index hiện tại tiếp tục bảo đảm một active duy nhất.

Đã xóa engine, preview/demo, route, form và test tính điểm V1. FE gọi các API V3 trong OpenAPI; không có alias âm thầm chuyển payload V1 sang V3. Lịch sử MatchResult/snapshot cũ và các migration đã chạy vẫn giữ nguyên; không tính lại hay đổi nghĩa điểm lịch sử.
