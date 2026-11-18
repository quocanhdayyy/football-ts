# Hướng dẫn thử API và DEMO

Chọn mục để đọc đúng phần cần dùng:

- [Thử F S R](#scoring)
- [Các bộ DEMO](#demo)
- [Xem bốn chiến lược V3](#v3-strategies)

## Scoring

Các mục F/S/R trong phần này là form V1 còn giữ để tương thích. Dùng phần **Matching V3** phía dưới cho mô hình mới.

### Financial Fit

Financial Fit.

Phạm vi: chỉ tính F trên thang 0–100, với trọng số 45% phí mua, 35% lương và 20% thời hạn hợp đồng còn lại. Chưa tính S/R, điểm Matching tổng, xếp hạng, mức khuyến nghị hoặc ghi MatchResult. Không thay đổi dữ liệu đầu vào.

#### 1. Xem ngay trên trình duyệt

Mở lại `/login`, dùng phiên đăng nhập hiện tại, mở mục **Thử Financial Fit — chỉ tính F** bên dưới bộ thử GET.

- Bấm **Tính F từ các số trên** với số điền sẵn: phí 180 triệu/ngân sách 200 triệu, lương 27 triệu/trần 30 triệu euro/năm, hợp đồng còn 48 tháng. Kết quả F = 79, điểm phí 92, điểm lương 96, điểm hợp đồng 20.
- Các số điền sẵn là giả lập để minh họa Haaland, không phải dữ liệu thực tế và không tạo cầu thủ trong DB.
- Có thể sửa số, nhập tháng lẻ, hoặc để trống phí/lương/tháng để thử thiếu dữ liệu.
- Hoặc nhập ID cầu thủ và ID yêu cầu CLB, bấm **Tính F từ dữ liệu đã lưu**.
- Hai chế độ đều dùng token hiện tại. Đăng xuất hoặc hết phiên sẽ xóa kết quả đang hiển thị.

#### 2. Công thức đang dùng

```text
clamp(x) = max(0, min(100, x))

Điểm phí      = clamp(200 − 120 × estimatedFee / budget)
Điểm lương    = clamp(160 × (1,5 − expectedSalaryPerYear / salaryLimit))
Điểm hợp đồng = clamp(100 − 100 × remainingMonths / 60)

F = 0,45 × Điểm phí + 0,35 × Điểm lương + 0,20 × Điểm hợp đồng
```

Ngân sách/trần lương phải lớn hơn 0. Phí/lương/tháng không âm. Phí mua và lương vượt giới hạn vẫn được chấm; không tự loại cầu thủ. Tính bằng Decimal, cộng theo độ chính xác đầy đủ và làm tròn hai chữ số khi trả kết quả.

Bản thử dùng cấu hình cố định có tên `financial-trial-v1` trong `src/config/financial-scoring.ts`. Chưa đọc cấu hình active từ `ScoringConfig`; thay đổi cấu hình active qua API chưa thay đổi phép tính F thử này. Không tự tạo/kích hoạt một cấu hình đầy đủ với trọng số S/R chưa chốt.

#### 3. API thử số trực tiếp

```http
POST /api/matching/financial/preview
Authorization: Bearer <accessToken>
Content-Type: application/json
```

Scout và Admin đều được dùng. Body:

```json
{
  "budget":"200000000",
  "estimatedFee":"180000000",
  "salaryLimit":"30000000",
  "expectedSalaryPerYear":"27000000",
  "remainingMonths":48
}
```

- Tiền: euro; lương: euro/năm. Nhận chuỗi hoặc số, tối đa 13 chữ số nguyên và 2 số thập phân.
- remainingMonths là số JSON không âm, cho phép số lẻ, không nhận chuỗi.
- budget và salaryLimit bắt buộc. Ba đầu vào còn lại có thể bỏ qua hoặc null nếu chưa biết; 0 là giá trị đã biết bằng 0.
- Không nhận điểm, trọng số, userId hoặc tùy chọn ghi kết quả từ client.

Response rút gọn (thực tế có thêm inputs và missing):

```json
{
  "status":"success",
  "data":{
    "mode":"preview",
    "configVersion":"financial-trial-v1",
    "complete":true,
    "financialScore":79,
    "components":{
      "fee":{"score":92,"weight":0.45,"contribution":41.4},
      "salary":{"score":96,"weight":0.35,"contribution":33.6},
      "contract":{"score":20,"weight":0.2,"contribution":4}
    },
    "saved":false
  }
}
```

score là điểm thành phần; contribution là phần đóng góp vào F, không phải điểm Matching tổng. Tổng contribution hiển thị có thể lệch rất nhỏ do làm tròn; F luôn tính từ số chưa làm tròn.

#### 4. API dùng dữ liệu database

```http
POST /api/matching/financial/evaluate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{"playerId":4,"requirementId":3}
```

Phải dùng ID có thật. Scout chỉ dùng yêu cầu CLB thuộc mình; Admin dùng tất cả. Ngoài phạm vi trả 404, không tiết lộ dữ liệu riêng của người khác.

Nguồn đầu vào:

| Đầu vào | Nguồn |
|---|---|
| budget/salaryLimit | ClubRequirement |
| estimatedFee/expectedSalaryPerYear | MatchingInput của đúng cặp cầu thủ/yêu cầu |
| remainingMonths | Hợp đồng ACTIVE bao phủ ngày hiện tại, tính từ endDate |
| Cầu thủ tự do khi không có hợp đồng phù hợp | PlayerDataVerification FREE_AGENT với registrationAsOf đúng ngày hiện tại |

Ngày đánh giá là ngày hiện tại theo Asia/Ho_Chi_Minh do server lấy; không nhận ngày lịch sử/tương lai hoặc ghi đè số tiền/tháng trong body.

- Không tự thay phí dự kiến bằng marketValue, releaseClause hoặc phí thương vụ cũ.
- Không tự thay lương dự kiến thiếu bằng lương hợp đồng hiện tại.
- Thiếu hợp đồng không tự coi là cầu thủ tự do. Với bản thử, xác nhận tự do từ ngày cũ chưa đủ để kết luận trạng thái hôm nay; cần xác minh lại.
- Xác nhận tự do không tự điền phí/lương bằng 0; hai khoản vẫn phải có giá trị ước tính rõ ràng.
- Không truy vấn thống kê phong độ hoặc tính S/R.

Response có thêm player, requirementId, evaluatedOn, nguồn dữ liệu và notes giải thích phần thiếu.

##### Quy ước tháng lẻ

Tính số tháng lịch nguyên từ ngày đánh giá đến endDate, sau đó cộng phần ngày còn lại chia số ngày của khoảng tháng lịch kế tiếp. Ngày cuối tháng được chặn về ngày cuối hợp lệ khi tháng đích ngắn hơn. Ví dụ 31/01/2025 đến 28/02/2025 là 1 tháng; không mặc định mọi tháng đều có 30 ngày. Không làm tròn số tháng trước khi chấm.

#### 5. Dữ liệu thiếu và mã lỗi

Thiếu bất kỳ phí, lương hoặc thời hạn nào: trả HTTP 200 với `complete: false`, `financialScore: null`, danh sách `missing`. Các điểm thành phần tính được vẫn trả về; thành phần thiếu có score/contribution null. Không tự gán 0/50 hoặc chia lại trọng số.

Đây là chính sách an toàn của bản thử F; chính sách cho toàn bộ Matching sau này vẫn cần thống nhất.

- 400: body sai, số âm, ngân sách/trần lương bằng 0, trường không được phép.
- 401: chưa đăng nhập hoặc hết phiên.
- 404: cầu thủ/yêu cầu không tồn tại hoặc ngoài phạm vi sở hữu.

Không tạo lịch sử Matching ở cả hai API, kể cả khi tính được F đầy đủ. Không cần migration mới.

#### 6. Kiểm thử

Trong thư mục backend:

```sh
npm run test:financial
npm run test:financial-api
```

Kiểm tra ví dụ 79 điểm, các ngưỡng và số lẻ, giới hạn 0–100, giá tăng điểm không tăng, tháng lịch, dữ liệu thiếu/0, phân quyền/ownership, không thay đầu vào bằng dữ liệu khác và không ghi MatchResult. Test API dùng fixture được dọn sau khi chạy; test công thức không cần PostgreSQL.

### Squad Fit

Squad Fit và phong độ.

Mở `/login`, dùng phiên hiện có, mở **Thử điểm S — phong độ từ thống kê**. ID điền sẵn `1700` là **ID cầu thủ Haaland**, không phải ID thống kê `1621`. Bấm **Tính từ thống kê đã lưu** để xem tên, vị trí, điểm tuổi, điểm khớp vị trí và bảng tổng mùa → /90 phút → điểm từng chỉ số → trọng số phong độ → điểm trước/sau giới hạn số phút.

Mùa hỗ trợ: **2025/2026**, đã kết thúc trong phạm vi năm giải đang sử dụng sau khi thu phạm vi ngày 19/10/2026. Phong độ luôn chấm theo **vị trí chính** của cầu thủ, dùng lại `scoreForm` và `matchingRules` của engine. Đây là bản thử các mốc khởi đầu trong đặc tả, không đọc hoặc thay cấu hình active.

**Điểm phong độ chỉ là một thành phần của S.** Để trống ba trọng số sẽ trả điểm phong độ và các điểm thành phần, `squadScore=null`. Muốn thử ghép S, điền đủ trọng số vị trí/tuổi/phong độ, mỗi số từ 0 đến 100 và tổng 100%. Những số nhập chỉ có tác dụng cho lần thử. Không tự chọn trọng số còn chưa chốt, không tạo yêu cầu CLB, không lưu MatchResult.

Vị trí yêu cầu mặc định trùng vị trí chính. Có thể chọn vị trí khác để thử khớp vị trí; công thức phong độ vẫn theo vị trí chính. Trường hợp cần bảng nhóm vị trí chưa khai báo trả thiếu cấu hình thay vì tự cho 0/50. Tuổi tính theo ngày đánh giá ở Việt Nam. Thiếu chỉ số cần cho vai trò, không có phút thi đấu hoặc GK chưa có công thức thì phong độ là `null`; không đổi thành 0 hay chia lại trọng số.

#### API

`POST /api/matching/squad/preview` — cần đăng nhập, cả Scout và Admin đều được đọc dữ liệu cầu thủ. Không nhận `userId`, `save`, điểm tự khai báo hoặc dữ liệu thống kê thay thế.

```json
{
  "playerId": 1700,
  "season": "2025/2026"
}
```

Có thể thêm `requiredPosition` và `weights` (đơn vị %). Ví dụ **trọng số thử do người gọi lựa chọn**, không phải mặc định sản phẩm:

```json
{
  "playerId": 1700,
  "season": "2025/2026",
  "requiredPosition": "ST",
  "weights": { "position": 20, "age": 20, "form": 60 }
}
```

Response có `player.name`, `statsId`, `formRole`, `scores`, `formScore`, `squadScore`, `missing`, `stats`, `form` và `saved=false`. `form` gồm các tổng đã quy đổi /90, mốc A/B, điểm chỉ số, trọng số, trần theo phút và lý do thiếu. `complete` chỉ nói điểm S của bản thử đã tính được, không có nghĩa đủ toàn bộ F/S/R.

Kiểm tra: `npm run test:squad-preview`, `npm run test:matching`, `npx tsc --noEmit`, `node --check public/login.js`. Test API có đăng nhập, điểm số xác định, trọng số thử, null/GK/0 phút, dữ liệu thật Haaland và xác nhận không thay đổi cấu hình/kết quả đã lưu. Fixture được dọn sau chạy.

### Risk Future

Risk and Future.

Tải lại `/login`, mở **Thử điểm R — chấn thương và bán lại**, bên dưới S. Không cần yêu cầu CLB hay cấu hình active. R càng cao nghĩa là lịch sử chấn thương và triển vọng bán lại càng thuận lợi.

Đã thêm [bộ DEMO chấn thương cho 10 cầu thủ](README.md#injury-demo): chọn theo tên ngay trên form, tính với chấn thương giả lập và lịch sử giá đã lưu. Kết quả ghi rõ DEMO; không trộn mẫu vào lịch sử thật.

#### Hai cách thử

**Dữ liệu đã lưu:** nhập ID cầu thủ (Haaland `1700`), nguồn định giá có thể để trống nếu chỉ có một nguồn phù hợp. Hiện tên, tuổi, hai điểm thành phần, cửa sổ chấn thương và hai mốc giá kèm ngày/nguồn thực tế. Chưa xác minh đủ lịch sử chấn thương hai năm thì giữ điểm chấn thương `null`; không có bản ghi không đồng nghĩa không từng chấn thương. Nếu giá có nhiều nguồn phù hợp, chọn rõ nguồn thay vì tự ghép.

**Số giả lập:** mở mục **Hoặc thử công thức bằng số giả lập**. Ví dụ điền sẵn tuổi 23, nghỉ 45 ngày trong hai năm, không đang chấn thương, giá cũ 20 triệu và giá mới 24 triệu EUR. Kết quả: điểm chấn thương 80, biến động giá +20% → điểm biến động 90, điểm tuổi bán lại 90 → điểm bán lại 90. Đây không phải dữ liệu của Haaland hay hồ sơ thật nào và không được lưu. Số ngày nghỉ giả định đã gộp trùng; hai mốc giá giả định cùng nguồn, đơn vị EUR, cách nhau 12 tháng.

Để trống cả hai trọng số thì chỉ xem hai điểm thành phần. Muốn ghép R, điền chấn thương/bán lại có tổng 100%. Ví dụ thử 50/50 cho bộ giả lập trên: **R = 85**. Đây là lựa chọn cho lần thử, không phải trọng số đã chốt của hệ thống. Cặp 60/40 bên trong điểm bán lại vẫn là trọng số biến động/tuổi đã chốt, khác hai trọng số ghép R.

#### API (Scout/Admin đăng nhập)

`POST /api/matching/risk/evaluate` — đọc dữ liệu thật:

```json
{ "playerId": 1700, "weights": { "injury": 50, "resale": 50 } }
```

`weights` không bắt buộc. Có thể thêm `valuationSource` để chọn nguồn cụ thể. Tuổi/cửa sổ chấn thương tính tại ngày đánh giá ở Việt Nam. Quy tắc lấy giá giữ nguyên engine: gần nhất không sau ngày đánh giá và gần nhất không sau ngày lùi 12 tháng, cùng nguồn, khác ngày, được ghi nhận trước thời điểm tính. Hiện rõ ngày nguồn, độ cũ và kỳ đối chiếu thực tế; không giả định giá gần nhất là giá hôm nay.

`POST /api/matching/risk/preview` — tính số giả lập:

```json
{
  "age": 23,
  "daysMissed": 45,
  "ongoing": false,
  "priorValue": "20000000",
  "currentValue": "24000000",
  "weights": { "injury": 50, "resale": 50 }
}
```

Tuổi/ngày nghỉ/giá có thể để `null` nếu chưa biết. Giá cũ 0 không tính được biến động; giá mới 0 vẫn là số liệu hợp lệ và được chấm theo công thức. Đang chấn thương thì trần điểm chấn thương là 50. Thiếu điểm có trọng số dương thì R giữ `null`; không chia lại trọng số. Tổng hai trọng số phải chính xác 100%. Response ghi rõ `mode=DATABASE` hoặc `SIMULATION`, `saved=false`, `riskScore`, `scores`, chi tiết chấn thương/bán lại và cảnh báo. `complete` chỉ nói tính đủ R, không đại diện toàn bộ F/S/R.

Hai API dùng lại công thức của engine, không ghi hồ sơ/xác minh/định giá, không lưu MatchResult và không thay cấu hình active. Không nhận `save`, điểm tự khai báo hoặc số giả lập ở API đọc dữ liệu thật.

#### Kiểm tra

Đã chạy `npm run test:risk-preview`, `npm run test:squad-preview`, `npm run test:matching`, `npx tsc --noEmit`, `node --check public/login.js`.

Test R bao gồm đăng nhập Scout, các ranh giới ngày nghỉ/trần đang chấn thương, gộp ngày trùng, dữ liệu thiếu so với 0, hai mốc giá cùng nguồn và nguồn mơ hồ, trọng số thử, đọc Haaland, không lưu kết quả/cấu hình. Fixture được dọn sau chạy.

## Demo

Các bộ DEMO.

<a id="matching-demo"></a>

### Matching Demo cũ

Bộ demo PostgreSQL cũ đã bị xóa ngày 21/10/2026. Đã bỏ manifest ID, script seed và test chỉ trả SKIP để tránh hướng dẫn dùng dữ liệu không còn tồn tại. Muốn kiểm tra đầy đủ công thức và luồng V3, chạy `npm run test:matching-v3-engine-api`: fixture TEST riêng được tạo và tự dọn. Cách dùng form V3 ở phần dưới.

### Injury Demo

Chấn thương giả lập.

**Toàn bộ số ngày nghỉ và trạng thái chấn thương trong bảng dưới là tự tạo để thử công thức, không phải lịch sử thật hoặc đánh giá y tế của cầu thủ.** Không dùng làm bằng chứng xác minh dữ liệu. Bộ mẫu chỉ có tổng ngày nghỉ giả định trong hai năm, không có các đợt chấn thương thật hay ngày hồi phục thật.

| Cầu thủ | Mã demo | Tổng ngày nghỉ GIẢ LẬP | Đang chấn thương GIẢ LẬP | Điểm chấn thương DEMO |
|---|---|---:|---|---:|
| Erling Haaland | haaland | 45 | Không | 80 |
| Kylian Mbappé | mbappe | 20 | Không | 100 |
| Mohamed Salah | salah | 75 | Không | 80 |
| Virgil van Dijk | van-dijk | 110 | Không | 60 |
| Bukayo Saka | saka | 155 | Có | 50 |
| Jude Bellingham | bellingham | 95 | Không | 60 |
| Vinicius Junior | vinicius | 35 | Không | 80 |
| Rodri | rodri | 280 | Có | 20 |
| William Saliba | saliba | 0 | Không | 100 |
| Bruno Fernandes | bruno-fernandes | 190 | Không | 40 |

Các tình huống được đặt để thử các mức điểm và trần đang chấn thương, không suy luận từ phong độ hay tin tức của những người này. Tuổi và lịch sử định giá vẫn đọc từ database như API R thật, kèm nguồn/ngày thực tế. Vì vậy đây là **kết quả kết hợp đầu vào thật và chấn thương giả lập**, không phải điểm R thật của cầu thủ.

#### Cách dùng

1. Tải lại `/login`, mở **Thử điểm R — chấn thương và bán lại**.
2. Nhập hai trọng số thử tổng 100%, ví dụ chấn thương 50 / bán lại 50. Đây không phải mặc định đã chốt.
3. Trong **Bộ DEMO chấn thương — 10 cầu thủ**, chọn theo tên rồi bấm **Tính R với chấn thương DEMO**.

Với snapshot local ngày 19/10/2026, Haaland DEMO có điểm chấn thương 80, bán lại 75,33 và R theo trọng số thử 50/50 là **77,67**. Bộ số giả lập nhập tay 23 tuổi/20→24 triệu trước đây là một tình huống khác nên cho kết quả khác.

#### Lưu trữ và API

Nguồn mẫu là `src/config/risk-injury-demo.ts`, nằm trong mã nguồn để người tải repo dùng lại sau khi nhập hồ sơ và lịch sử giá. Ghép hồ sơ bằng `transfermarktId`, không phụ thuộc ID local của máy. Không ghi mẫu vào `injury_histories` hay `player_data_verifications`, không đánh dấu verified, không cần migration hoặc lệnh seed.

- `GET /api/matching/risk/demo`: danh sách 10 tình huống, tên/ID local khi có, `available=false` nếu chưa nhập hồ sơ nguồn.
- `POST /api/matching/risk/demo`: body `{"demoId":"haaland","weights":{"injury":50,"resale":50}}`. `weights` không bắt buộc; có thể chỉ rõ `valuationSource` như API thật. Không cho body sửa ngày nghỉ, ID cầu thủ hoặc gửi `save`.
- Hai API cần đăng nhập Scout/Admin. Response đánh dấu `mode=DEMO`, `injury.simulated=true`, `coverageVerified=false`, `saved=false`, có cảnh báo dữ liệu giả.
- `/risk/evaluate` và Matching Engine chính vẫn đọc dữ liệu thật; không tự sử dụng bộ demo, không nhận cờ demo hoặc tự lấp phần thiếu.
- Không lưu điểm R demo vào MatchResult hoặc thay cấu hình active. Thiếu dữ liệu bán lại vẫn giữ null, không tự tạo giá giả.

`npm run test:risk-preview` đã thử đủ 10 mẫu trên database local, kiểm tra nhãn demo/nguồn giá, đối chiếu với API thật và so sánh toàn bộ lịch sử chấn thương/xác minh trước và sau để xác nhận không bị ghi đè.

<a id="v3-strategies"></a>

## Xem bốn chiến lược V3 trên trang test

Mở `/login`, đăng nhập rồi xem mục **Matching V3 — Giai đoạn 4** ngay dưới thông tin tài khoản. Chọn **Chiến lược chuyển nhượng** để xem trọng số lấy từ backend:

| Chiến lược | F | S | R |
| --- | ---: | ---: | ---: |
| Tiết kiệm / Moneyball | 50% | 30% | 20% |
| Cân bằng | 30% | 50% | 20% |
| Đầu tư dài hạn | 20% | 30% | 50% |
| Cần ngay vai trò | 20% | 70% | 10% |

Chọn chiến lược rồi bấm **Tính Matching V3** hoặc **Tìm và xếp hạng V3** để áp dụng trọng số. Chỉ đổi lựa chọn chưa gọi tính/lưu. Các form F/S/R cũ bên dưới vẫn dùng phiên bản V1. **Tải lại cấu hình V3** đọc lại API bằng phiên đăng nhập hiện tại; nếu phiên hết hạn, trang yêu cầu đăng nhập lại.


### Thử điểm vai trò V3

Trong Matching V3, mở **Thử điểm vai trò V3**, nhập cầu thủ 1700 và mùa 2025/2026, giữ PROTOTYPE, bấm tính. Bảng hiển thị các vai trò đủ điều kiện, Q chuyên môn, điểm cuối và tỷ trọng đầu vào ước tính. Chọn Poacher rồi tính lại để xem riêng vai trò. Đổi OBSERVED_ONLY để xem các mục chưa đủ số liệu quan sát; không được coi null là điểm 0. Van Dijk dùng ID 369, Alisson ID 262. Mở phần chi tiết để xem P_i, mean/counts tham chiếu, trọng số và lý do thiếu.

Lựa chọn chiến lược F/S/R không áp dụng cho điểm vai trò riêng. [Đặc tả điểm vai trò](../data/README.md#v3-stage-2).


### Thử Matching V3 tổng hợp

1. Mở `/login`, đăng nhập và tải lại trang nếu còn giao diện cũ. Chọn chiến lược trong **Matching V3 — Giai đoạn 4**.
2. Mở **Tính Matching V3 — F, S, R**. Nhập ID cầu thủ (ví dụ 1700 là Haaland), ID nhu cầu CLB **đã tồn tại và thuộc tài khoản của bạn**, mùa 2025/2026. Hai ID này khác loại, không cần cùng số.
3. Chọn vai trò đúng nhóm nhu cầu: ví dụ nhu cầu ST chọn Poacher. Giữ PROTOTYPE để cho phép các thống kê có nhãn ước tính. Chọn dung sai phí/lương theo phần trăm nếu muốn; mặc định 0 là không vượt trần.
4. Bấm **Tính Matching V3**. Xem F/S/R, đóng góp trọng số, lý do thiếu/loại và JSON. Đổi chiến lược rồi bấm lại: F/S/R giữ nguyên khi đầu vào giữ nguyên, chỉ tổng thay đổi.
5. Bấm nút tìm và xếp hạng để xét toàn bộ cohort import của mùa. API trả riêng người đủ điểm, thiếu dữ liệu và bị loại; tìm kiếm không lưu lịch sử.
6. Chỉ bật **Lưu lịch sử nếu đủ điểm và qua bộ lọc** khi muốn lưu phép tính một cầu thủ. Đủ điểm sẽ hiện resultId; đọc lại qua API lịch sử kết quả Matching. INCOMPLETE/EXCLUDED không lưu.

Dữ liệu cầu thủ hiện có không đồng nghĩa đã có báo giá, lương dự kiến và xác minh chấn thương đầy đủ. Chưa đủ thì engine phải trả null và lý do; không điền số ngẫu nhiên để làm tổng hiện lên. Muốn kiểm chứng bộ công thức đầy đủ, chạy `npm run test:matching-v3-engine-api`: test dùng fixture có nhãn TEST riêng rồi tự xóa, không sửa hồ sơ cầu thủ thật. Ví dụ hồi quy trong báo cáo được kiểm tra bằng `npm run test:matching-v3-financial-risk`.

Nếu chỉ muốn xem năng lực theo thống kê hiện có mà chưa chuẩn bị tài chính/y tế, dùng **Thử điểm vai trò V3** bên dưới. [Hợp đồng endpoint để bàn giao FE](../api/README.md#matching-v3).


### Kiểm tra toàn bộ V3 trước khi bàn giao

Trong backend, cần PostgreSQL đang chạy và `.env` đúng DB của bạn:

```bash
npm run test:matching-v3:all
npm run matching:v3:audit -- --season 2025/2026
```

Lệnh test build sạch, kiểm tra OpenAPI không cũ, chạy các suite công thức/đầu vào/vai trò/hợp đồng, API V3, luồng FE, trang test và hồi quy V1 **tuần tự**. Các suite dùng fixture TEST riêng, khôi phục cấu hình active và dọn fixture sau test; không chạy nhiều suite API đồng thời vì chúng tạm kích hoạt cấu hình thử. Lệnh audit tách riêng, chỉ đọc cohort thật, không yêu cầu tài khoản Admin và không dùng fixture để lấp dữ liệu thiếu. Nó dùng DATABASE_URL local; không xuất thông tin tài khoản.

Import [OpenAPI JSON](../api/matching-v3.openapi.json) vào Postman, chọn backend URL, đăng nhập bằng tài khoản đã được cấp rồi đặt Bearer token. Không có mật khẩu thật hoặc token được điền sẵn. [Thứ tự thao tác FE và các lỗi thường gặp](../api/README.md#fe-handoff).


Xác nhận local ngày 17/11/2026: toàn bộ lệnh test đã qua trên database hiện có và trên một database PostgreSQL trống vừa chạy `prisma migrate deploy`. Database tạm được xóa sau khi thử. Kiểm tra này chứng minh migration và fixture đủ để chạy kiểm thử từ đầu; không chứng minh dữ liệu cầu thủ nguồn sẽ tự có sau khi clone, và không thay thế kiểm thử tải hoặc đối chứng tuyển trạch.


### Test phần mềm và kiểm tra snapshot import

`npm test` chạy build, kiểm tra OpenAPI và 25 nhóm test có fixture/đầu vào tự chuẩn bị, gồm API, phân quyền, nhập/chuẩn bị dữ liệu, V1 và V3. PostgreSQL cần có schema đã migrate; nên dùng database test riêng. Mọi suite chạy tuần tự và dọn fixture.

Các kiểm tra snapshot import cũ chuyển sang `scripts/verification/` và tên lệnh `verify:*`. Chúng cần đúng dataset/checkpoint local của lần import lịch sử, không phải test chạy được trên DB trống và không chứng minh database hiện tại phải giữ nguyên mọi ID/số lượng cũ. Để xem độ phủ hiện tại dùng `npm run matching:v3:audit`. Các bộ test prepare/plan vẫn kiểm tra quy tắc fill NULL, giữ số 0, provenance và chạy lại không đổi.
