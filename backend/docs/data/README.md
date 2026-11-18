# Dữ liệu cầu thủ và phương pháp bổ sung

Chọn mục để đọc đúng phần cần dùng:

- [Phạm vi và dữ liệu hiện tại](#overview)
- [Nguồn thống kê bổ sung](#sources)
- [Ước tính theo bằng chứng cá nhân](#estimation)
- [Đầu vào thống kê V3](#v3-metrics)
- [V3 giai đoạn 3: F/S/R và tìm ứng viên](#v3-stage-3)
- [V3 giai đoạn 4: kiểm chứng và bàn giao](#v3-stage-4)

## Overview

Phạm vi và dữ liệu hiện tại.

**Cập nhật 19/10/2026:** đã loại dữ liệu của Süper Lig (Thổ Nhĩ Kỳ), Primeira Liga (Bồ Đào Nha) và Eredivisie (Hà Lan) khỏi database hiện tại theo quyết định thu phạm vi. Giữ Premier League, La Liga, Bundesliga, Serie A và Ligue 1. Không chỉ ẩn trên giao diện.

**Cập nhật 21/10/2026:** đã xóa 2 cầu thủ và 4 CLB mẫu, bổ sung 191 ô có nguồn cho 39 người và lưu 2.107 ô ước tính riêng cho 499 người. Xem [báo cáo sửa dữ liệu và ước tính](../archive/data-history-2026-10-21.md#repair).

### Số lượng hiện tại

| Giải | Mã | Trận trong snapshot | Cầu thủ từng có phút mùa 25/26 |
|---|---|---:|---:|
| Premier League | GB1 | 380 | 537 |
| La Liga | ES1 | 380 | 600 |
| Bundesliga | L1 | 306 | 497 |
| Serie A | IT1 | 380 | 585 |
| Ligue 1 | FR1 | 306 | 547 |

Tổng duy nhất: **2.684 cầu thủ nguồn, 96 CLB, 2.684 dòng thống kê mùa và 53.352 mốc định giá**. Không cộng số cầu thủ từng giải để suy ra số người duy nhất: một người có thể chuyển giữa hai giải trong mùa.

Tổng vật lý hiện cũng là **2.684 cầu thủ, 96 CLB và 2.684 dòng thống kê**, sau khi xóa các hồ sơ/CLB mẫu cùng bản ghi mẫu tham chiếu. Tài khoản và phiên đăng nhập được giữ. ID nhu cầu mẫu 3/87 không còn tồn tại; cần tạo nhu cầu mới để test.

Phạm vi là **người đã thi đấu trong năm giải mùa 2025/2026**, không phải danh sách đăng ký đội một hiện tại, cầu thủ chưa ra sân hoặc bảo đảm người đó vẫn ở giải ngày hôm nay. Không cộng cúp quốc nội, châu Âu hoặc ĐTQG.

### Dữ liệu có gì và lấy từ đâu?

| Nhóm | Nguồn / cách xử lý |
|---|---|
| Hồ sơ cầu thủ | [dcaribou/transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets): tên, ngày sinh, quốc tịch, vị trí, chiều cao, chân thuận và giá có ngày. |
| CLB | Transfermarkt: tên, quốc gia, giải theo mùa 25/26. Không có năm thành lập thì giữ null. |
| Thống kê cơ bản | Tổng hợp bảng appearances của Transfermarkt: số trận có phút, tổng phút, bàn thắng, kiến tạo, thẻ vàng/đỏ. Mỗi cầu thủ một dòng/mùa; chỉ cộng trận trong năm giải. |
| Thống kê chi tiết | Snapshot SofaScore và Football Today sau đối chiếu danh tính, CLB, mùa, trận/phút/bàn. Chỉ điền ô chưa biết; có nguồn cho từng trường trong AuditLog. |
| Lịch sử giá | 53.352 mốc Transfermarkt có ngày; giá gần nhất không được coi là giá hôm nay. |
| Hợp đồng/lương | Nguồn hồ sơ chỉ có ngày hết hạn ở một số người, thiếu ngày bắt đầu, lương và chứng cứ hiệu lực. Chưa tự tạo Contract thật hoặc lương giả. |
| Chấn thương thật | Không có trong bộ Transfermarkt đã tải. Không có dòng chấn thương chưa chứng minh cầu thủ khỏe mạnh; điểm thiếu giữ null. |
| Chấn thương DEMO | [10 tình huống tự tạo](../testing/README.md#injury-demo), nằm riêng trong mã nguồn, không ghi vào lịch sử/xác minh thật. Chỉ mục test R DEMO sử dụng. |
| Dữ liệu người dùng | Nhu cầu CLB, phí/lương đề nghị và shortlist do người dùng tạo; không tự sinh cho cả 96 CLB. |

Trong 2.684 cầu thủ nguồn, mức độ có **năm trường bổ sung** (tắc bóng, cắt bóng, tạo cơ hội, chuyền thành công/tổng chuyền):

- **2.185 người đủ cả năm trường quan sát.**
- **120 người có một phần.**
- **379 người chưa có cả năm trường.**

Ô quan sát chưa biết giữ `null`, không đổi thành 0. API thống kê trả thêm `estimate` riêng cho 499 người; đây là 2.107 giá trị ước tính, không phải thống kê thật ; engine V1 giữ cách tính cũ, còn V3 dùng metrics có nhãn theo chế độ dữ liệu. Có đủ thống kê không có nghĩa đủ mọi đầu vào F/S/R. Trong nhóm này còn 121 người chưa có giá có ngày, 36 người thiếu chiều cao và 33 người thiếu chân thuận.

### Xem và test

Mở `http://localhost:3000/login`, dùng phiên đăng nhập hiện có.

| Cầu thủ | ID cầu thủ | ID thống kê 25/26 |
|---|---:|---:|
| Haaland | 1700 | 1621 |
| Mbappé | 1263 | 1184 |
| Van Dijk | 369 | 290 |
| Salah | 390 | 311 |
| Saka | 1768 | 1689 |
| Vinicius Junior | 1447 | 1368 |
| Bellingham | 2440 | 2361 |

ID các hồ sơ còn lại giữ nguyên sau thu phạm vi. Các số này thuộc máy hiện tại. API Cầu thủ và mục test S/R dùng ID cầu thủ; API Thống kê cầu thủ dùng ID thống kê.

- [Test S / phong độ](../testing/README.md#squad-fit).
- [Test R thật / giả lập](../testing/README.md#risk-future).
- [Bộ chấn thương DEMO riêng](../testing/README.md#injury-demo).
- [Báo cáo dữ liệu nguồn hiện tại](../archive/reports/transfermarkt-import-report.json).

Trong pgAdmin:

```sql
SELECT p.id AS player_id, p.name, p.position,
       s.id AS stats_id, s.season, s.minutes_played, s.goals,
       s.assists, s.tackles_won, s.interceptions, s.key_passes,
       s.passes_completed, s.passes_attempted
FROM players p
JOIN player_stats s ON s.player_id = p.id
WHERE p.transfermarkt_id IS NOT NULL AND s.season = '2025/2026'
ORDER BY p.name;
```

### Nhập lại dữ liệu

Chạy trong `backend`:

```sh
npm run data:fetch
npm run data:prepare
npm run data:import -- --actor-id 15
npm run data:stats:prepare
npm run data:enrich:prepare
npm run data:enrich:import -- --actor-id 15
# Xem dry-run, rồi mới áp dụng các ô null phù hợp:
npm run data:enrich:import -- --actor-id 15 --apply
```

Dùng ID admin của máy tương ứng. Transfermarkt raw vẫn là bộ snapshot rộng của nhà cung cấp nhưng bước prepare chỉ chọn năm giải. Importer từ chối bundle tám giải để tránh nhập lại các giải đã loại. Football Today chỉ tải năm giải; cache của ba giải cũ được bỏ qua khi chuẩn bị dữ liệu.

Nguồn thông báo ngừng cập nhật ở tháng 7/2026; từng bảng có mốc dừng khác nhau. Giữ checksum snapshot và độ tin cậy `UNKNOWN`, không gắn `OFFICIAL`. Không dùng FPL-Core-Insights hoặc giá Fantasy. Vị trí tiếp tục được chuẩn hóa thành ST/LW/RW/CDM/CAM/CM/CB/RB/LB/GK; Form V1 chưa có công thức phong độ GK; V3 đã có hai vai trò thủ môn theo ma trận.

### Việc thu phạm vi đã thực hiện

[Báo cáo chuyển phạm vi](../archive/reports/top5-scope-report.json) ghi nhận đã loại **1.593 hồ sơ cầu thủ, 54 CLB, 1.593 dòng thống kê và 27.682 mốc định giá** ngoài phạm vi. **51 dòng thống kê giữ lại đã được tính lại** để không cộng phút/trận ở ba giải đã loại. Chỉ số chi tiết của dòng đổi phạm vi được trả về null nếu không còn đúng phạm vi, không giữ tổng mùa cũ để chấm /90 sai.

Không đổi ERD/schema, không đánh lại ID. Không xóa dây chuyền dữ liệu người dùng; script dừng nếu hồ sơ ngoài phạm vi có hợp đồng/yêu cầu/shortlist hoặc tham chiếu nghiệp vụ cần xử lý.

Trước khi xóa đã tạo bản PostgreSQL custom dump, kiểm tra đọc được bằng pg_restore và SHA256. Bản sao lưu cùng bundle/báo cáo trước đó nằm trong **`backend/data/scope-top5/`**, được gitignore, thư mục riêng và file chỉ cho chủ máy đọc. Backup đầy đủ có tài khoản/phiên đăng nhập nên **không dùng làm bộ dữ liệu chia sẻ hoặc đưa lên GitHub**. Khôi phục vào database riêng để kiểm tra trước; không dùng lệnh xóa/ghi đè database hiện tại.

`npm run data:scope:top5 -- --actor-id 15` chỉ xem kế hoạch; thêm `--apply` mới áp dụng. Đây là tiện ích chuyển database cũ từ tám về năm giải, không phải bước cài đặt bắt buộc cho máy mới. Chạy lại sau chuyển trả 0 thay đổi. Các báo cáo tám giải trong tài liệu khảo sát/bổ sung là lịch sử, không đại diện database hiện tại.

### Kiểm tra

```sh
npm run test:data-prepare
npm run verify:top5-scope
npm run verify:data-import
npm run verify:data-stats
npm run verify:data-enrich
npm run test:matching
npm run test:squad-preview
npm run test:risk-preview
npx tsc --noEmit
```

Kiểm tra phạm vi xác nhận ID/hồ sơ giữ nguyên, số lượng và tổng mùa khớp nguồn năm giải, toàn bộ dữ liệu nghiệp vụ được bảo toàn, bản backup có checksum đúng và các API vẫn đọc được bằng Scout. Test lịch sử nhập đã tính đến lần thu phạm vi có báo cáo/audit; không bỏ qua sai khác ngoài những bản ghi được phép loại hoặc tính lại.

## Sources

Nguồn thống kê bổ sung.

### Supplemental Stats

Đợt bổ sung SofaScore.

**Phạm vi hiện tại đã thu về 5 giải ngày 19/10/2026:** 2.684 cầu thủ nguồn, 96 CLB; thống kê chi tiết có 2.148 người đủ năm trường, 118 người có một phần, 418 người thiếu cả năm. Các con số tám giải bên dưới là lịch sử trước khi thu phạm vi. Xem [dữ liệu hiện tại](README.md#overview) và [báo cáo chuyển phạm vi](../archive/reports/top5-scope-report.json).

**Cập nhật 19/10/2026:** nội dung dưới đây mô tả lần nhập đầu tiên ngày 16/10. Hai đợt bổ sung tiếp đã điền 7.513 giá trị cho 1.665 người ở tám giải; hiện 2.980 người đủ năm trường và 429 người có một phần. Xem [kết quả và quy tắc bổ sung mới](README.md#enrichment).

Đã nhập ngày **16/10/2026** từ [m-mahadi/top5-football-dataset](https://github.com/m-mahadi/top5-football-dataset), snapshot commit `8940299c2c56c2c0932d3caf292336f5e1689893`. Dùng riêng [bảng SofaScore theo mùa](https://github.com/m-mahadi/top5-football-dataset/blob/8940299c2c56c2c0932d3caf292336f5e1689893/data/clean/sofascore_player_seasons.csv), không lấy bảng ghép master hoặc các cột EA/SoFIFA. Không chạy mã nguồn của tác giả, không cần API token. Đây là dữ liệu bên thứ ba công bố, giữ reliability `UNKNOWN`, không coi là dữ liệu CLB đã xác minh.

#### Kết quả thực tế

**1.744 dòng PlayerStats có sẵn được bổ sung đủ 5 trường, tương đương 8.720 giá trị.** Tổng vẫn là 4.279 cầu thủ và 4.279 dòng thống kê; không tạo hồ sơ/thống kê trùng.

| Giải | Cầu thủ được bổ sung |
|---|---:|
| Premier League | 316 |
| La Liga | 407 |
| Serie A | 393 |
| Bundesliga | 298 |
| Ligue 1 | 330 |

| Cột nguồn (tổng mùa) | Cột database |
|---|---|
| `tacklesWon` | `tackles_won` |
| `interceptions` | `interceptions` |
| `keyPasses` | `key_passes` |
| `accuratePasses` | `passes_completed` |
| `totalPasses` | `passes_attempted` |

Giữ nguyên ID, hồ sơ, số trận/phút, bàn thắng, kiến tạo, thẻ, giá thị trường, hợp đồng và các dữ liệu riêng của ứng dụng. Không thay đổi schema/ERD, công thức matching hoặc giao diện.

#### Quy tắc đối chiếu

Chọn `season=2526`, loại mùa cũ, kiểm tra đúng tournament/season ID và tổng hợp `overall`. Bảng gốc có **2.691 dòng** thuộc 5 giải ở mùa này; con số này khác số dòng có thống kê trong bảng master do tác giả đã ghép các bảng với nhau. Không dùng số dòng master để suy ra số cầu thủ đã nhập.

Chính sách `EXACT_NAME_CLUB_COUNTS_MINUTES_V1`:

1. Tên đầy đủ trùng sau chuẩn hóa dấu, chữ hoa/thường, dấu câu. Phải duy nhất trong danh sách Transfermarkt đã chọn; không ghép theo tên viết tắt, họ hoặc tên gần giống.
2. Cầu thủ thuộc đúng giải và CLB trong mùa 25/26. Tên CLB khác nhau giữa hai nguồn chỉ được nối khi ít nhất 3 cầu thủ có tên duy nhất, số trận/bàn/phút phù hợp cùng xác nhận một CLB Transfermarkt, không có bằng chứng mâu thuẫn. Toàn bộ bằng chứng nằm trong `review.json`.
3. Số trận và bàn thắng phải trùng. Số phút lệch tối đa **1 phút mỗi lần ra sân**, đồng thời không vượt **1% tổng phút**, làm tròn giới hạn xuống. Đây là ngưỡng kiểm tra bảo thủ, không phải quy tắc bóng đá hay chứng minh nguyên nhân chênh lệch.
4. Không nối thống kê một giải vào tổng của cầu thủ chuyển qua nhiều giải trong phạm vi 8 giải. Không nhân tỷ lệ, cộng lặp hoặc tự điền số còn thiếu.
5. Chỉ điền các trường đang `null`. Nếu dữ liệu nền đã được sửa hoặc một chỉ số có sẵn mâu thuẫn nguồn, bỏ qua để đối chiếu, không ghi đè.

**810 dòng được nhận có chênh lệch phút nhỏ.** Database tiếp tục dùng số phút Transfermarkt và 5 chỉ số bổ sung của SofaScore; do đó chỉ số/90 là dữ liệu phối hợp hai nguồn, có sai khác mẫu số tối đa theo giới hạn 1% trên. AuditLog giữ cả hai số phút và độ lệch để truy xuất. Không gọi đây là một bảng thống kê hoàn toàn đồng nhất nhà cung cấp.

947 dòng nguồn chưa nhập: 149 tên thiếu/không duy nhất, 672 lệch phút vượt giới hạn, 125 lệch số trận/bàn và 1 CLB chưa đủ bằng chứng. Ví dụ Foden có 2.085 phút trong Transfermarkt, 2.107 trong nguồn bổ sung: lệch 22 phút vượt giới hạn 20 phút, nên chưa điền 5 chỉ số cho cầu thủ này. Không tự sửa số phút để vượt kiểm tra.

#### Xem và test ngay

Dùng phiên đăng nhập hiện có tại `http://localhost:3000/login`, chọn API thống kê cầu thủ rồi nhập **ID thống kê**, khác với ID cầu thủ:

| Cầu thủ | ID cầu thủ | ID thống kê mùa 25/26 |
|---|---:|---:|
| Haaland | 1700 | **1621** |
| Mbappé | 1263 | **1184** |
| Van Dijk | 369 | **290** |
| Salah | 390 | **311** |
| Saka | 1768 | **1689** |
| Vinícius | 1447 | **1368** |
| Bellingham | 2440 | **2361** |

Ví dụ GET `/api/player-stats/1621` (cần đăng nhập) có `tacklesWon=9`, `interceptions=5`, `keyPasses=25`, `passesCompleted=252`, `passesAttempted=384`. Số phút Haaland giữ 2.959; nguồn bổ sung ghi 2.958. ID trong bảng thuộc database local hiện tại.

Trong pgAdmin:

```sql
SELECT p.id AS player_id, p.name, s.id AS stats_id, s.season,
       s.minutes_played, s.tackles_won, s.interceptions, s.key_passes,
       s.passes_completed, s.passes_attempted
FROM player_stats s JOIN players p ON p.id = s.player_id
WHERE s.season = '2025/2026' AND p.transfermarkt_id = 418560;
```

Phong độ các cầu thủ ngoài sân đã bổ sung có thể tính bằng công thức hiện có. **Chưa có nghĩa tất cả cầu thủ đã tính được trọn F/S/R**: còn thiếu hợp đồng, phí/lương đề nghị và xác minh chấn thương. GK vẫn chưa có công thức phong độ. Thổ Nhĩ Kỳ, Bồ Đào Nha, Hà Lan chưa có thống kê chi tiết từ nguồn này. Trong 4.277 cầu thủ Transfermarkt, **2.533 người vẫn thiếu 5 trường** sau lần bổ sung bảo thủ này.

#### Nhập lại và truy xuất

```sh
# Chạy từ backend; chuẩn bị file và báo cáo các dòng bị bỏ qua.
npm run data:stats:prepare
# Chỉ đọc database và xem kế hoạch.
npm run data:stats:import -- --actor-id 15
# Áp dụng kế hoạch đã đối chiếu.
npm run data:stats:import -- --actor-id 15 --apply
```

File CSV được tải từ commit cố định, kiểm tra SHA256. Dữ liệu local ở `data/supplemental-stats/` được gitignore: `raw/`, `prepared.json`, `review.json`, `before-import.json`, `import-report.json`, `last-noop.json`. Giữ checkpoint trước lần nhập; script dừng nếu cần ghi lại một checkpoint đã có, để tránh mất bằng chứng trước khi đối chiếu thủ công.

Chỉ admin được chạy nhập; transaction Serializable và khóa chung với importer Transfermarkt bảo vệ khỏi nhập đồng thời. UPDATE so sánh lại toàn bộ dòng cũ để phát hiện sửa đồng thời. AuditLog lưu old/new, nguồn, commit, checksum, ID nguồn và quy tắc đối chiếu từng dòng; thêm một sự kiện `SupplementalStatsImport` tóm tắt. Xem [báo cáo gọn](../archive/reports/supplemental-stats-import-report.json).

Đã chạy lại cùng snapshot: **0 dòng được sửa, 0 giá trị ghi thêm**. Không tạo trùng và không ghi đè số đã có.

Kiểm tra đã chạy: 7 fixture kiểm tra ghép dữ liệu; kiểm tra bảo vệ giá trị có sẵn/NULL; đối chiếu đủ 1.744 dòng nguồn và audit tương ứng; xác nhận thống kê khác cùng 14 bảng nghiệp vụ không đổi; đọc thống kê các cầu thủ mẫu qua service/API; kiểm tra công thức phong độ và TypeScript.

### Enrichment

Đợt bổ sung Football Today.

**Phạm vi hiện tại đã thu về 5 giải ngày 19/10/2026:** 2.684 cầu thủ nguồn, 96 CLB; thống kê chi tiết có 2.148 người đủ năm trường, 118 người có một phần, 418 người thiếu cả năm. Các con số tám giải bên dưới là lịch sử trước khi thu phạm vi. Xem [dữ liệu hiện tại](README.md#overview) và [báo cáo chuyển phạm vi](../archive/reports/top5-scope-report.json).

Mục tiêu: lấy tối đa các **tổng thống kê có bằng chứng** cho tám giải đã chọn. Không yêu cầu cầu thủ có đủ cả năm trường mới được nhập. Thiếu giữ `null`; số 0 chỉ nhập khi nguồn ghi rõ 0. Không đổi schema, công thức matching hoặc tự tạo hợp đồng/chấn thương.

#### Kết quả ngày 19/10/2026

Đợt đầu bổ sung **6.164 giá trị cho 1.366 cầu thủ**. Đợt tìm tiếp đã bổ sung thêm **1.349 giá trị cho 299 cầu thủ** sau khi kiểm tra 301 hồ sơ công khai; hai trường hợp khác ngày sinh bị loại. Cộng hai đợt ngày 19/10: **7.513 giá trị cho 1.665 cầu thủ**.

Trong 4.277 cầu thủ Transfermarkt đã nhập: **2.980 người đủ cả năm trường**, **429 người có một phần**, **868 người vẫn thiếu cả năm**. Tổng cầu thủ và dòng thống kê của ứng dụng vẫn là 4.279, gồm hai hồ sơ mẫu cũ.

| Giải | Đợt đầu 19/10 | Đợt tìm tiếp |
|---|---:|---:|
| Premier League | 101 | 31 |
| La Liga | 45 | 54 |
| Bundesliga | 102 | 25 |
| Serie A | 61 | 12 |
| Ligue 1 | 74 | 17 |
| Süper Lig | 243 | 85 |
| Primeira Liga | 468 | 28 |
| Eredivisie | 272 | 47 |

Đã tải 1.200 bảng thống kê theo CLB của 150 CLB. Đây là số bảng đã kiểm tra, không phải cam kết mọi cầu thủ đều có đủ chỉ số. Kiểm tra sau nhập xác nhận toàn bộ giá trị cũ và 14 bảng nghiệp vụ khác giữ nguyên.

#### Nguồn

- Snapshot SofaScore đã tải: bổ sung cách nối ID qua [REEP](https://github.com/withqwerty/reep/tree/0ec59faa5d81615b7a8200ae6121023a3bc14ce3), kiểm tra ngày sinh trùng trước khi dùng cầu nối. REEP chỉ giúp nhận diện, không cung cấp chỉ số cho lần nhập này.
- [Football Today](https://www.footballtoday.net): bảng mùa 2025/2026 theo từng CLB ở Anh, Tây Ban Nha, Đức, Ý, Pháp, Thổ Nhĩ Kỳ, Bồ Đào Nha và Hà Lan. Lấy cột **TOTAL** nguyên gốc; không nhân ngược cột trung bình đã làm tròn. Các bảng công khai chỉ trả tối đa 25 người mỗi loại thống kê; vắng tên không có nghĩa là 0.
- [Forensics xG — Primeira Liga](https://github.com/jczpineda/Forensics-xG-Intelligence-Unit-/tree/8cb0f85be1eafeb25bc228ed5eb2d724ebc80b10/Primeira%20Liga): CSV tổng mùa 25/26, nối Opta ID qua REEP và ngày sinh. Ô trống vẫn để thiếu. Không dùng snapshot Hà Lan của repo này vì chưa xác nhận đủ vòng cuối.

Đây là các nguồn bên thứ ba, giữ độ tin cậy `UNKNOWN`. Thống kê của các nhà cung cấp có thể khác định nghĩa, nhất là đường chuyền. Lưu nguồn theo từng trường; không gắn `OFFICIAL` hoặc tự coi chúng hoàn toàn tương đương.

#### Quy tắc ghép và bảo toàn

1. Đúng mùa và giải. Ghép bằng cầu nối ID đã đối chiếu ngày sinh, hoặc tên đầy đủ/alias đầy đủ duy nhất; không ghép mờ bằng họ.
   Bước tìm tiếp ngày 19/10 bổ sung alias từ hồ sơ Football Today: phải có đúng một `Person` trong JSON-LD, `mainEntityOfPage` trùng URL hồ sơ và ngày sinh trùng chính xác. Chỉ đề xuất hồ sơ khi CLB và bộ trận/phút/bàn xác định được duy nhất một ứng viên. Ngày sinh khác hoặc không có ngày sinh thì bỏ qua; không dùng kết quả đề xuất làm bằng chứng tự thân.
2. CLB nguồn phải được xác nhận bởi ít nhất ba cầu thủ có ánh xạ nhất quán về một CLB Transfermarkt. Bỏ qua cầu thủ có nhiều CLB trong mùa để tránh ghép một phần mùa thành tổng mùa.
3. Số lần ra sân phải trùng; chênh số phút tối đa bằng `min(số trận, floor(1% số phút Transfermarkt))`. Nếu nguồn có bàn thắng thì cũng phải trùng; nếu thiếu bàn thắng, ghi rõ thiếu trong bằng chứng, không thay bằng 0.
4. Chỉ điền năm trường đang `null`: `tacklesWon`, `interceptions`, `keyPasses`, `passesCompleted`, `passesAttempted`. Giữ nguyên toàn bộ giá trị đã biết và sáu thống kê cơ bản.
5. Hai số chuyền bóng lấy cùng nguồn, không tạo tỷ lệ bằng cách ghép tử/mẫu khác nguồn. Không nhận số chuyền thành công lớn hơn số lần chuyền.
6. Mỗi thay đổi có AuditLog, checksum nguồn, thông số đối chiếu và nguồn cho từng trường. Có checkpoint trước nhập; nhập lại cùng bundle không tạo thay đổi.

Chỉ số/90 tiếp tục tính từ tổng và số phút đã lưu. Chưa đủ dữ liệu không đồng nghĩa đủ điều kiện tính trọn matching; lương, hợp đồng và chấn thương vẫn cần nguồn riêng.

#### Chạy và kiểm tra

Chạy từ thư mục `backend`:

```sh
npm run data:enrich:fetch
npm run data:enrich:prepare
# Tìm tiếp alias từ các hồ sơ công khai, chỉ nhắm những trường còn thiếu:
npm run data:enrich:identities
npm run data:enrich:prepare
npm run data:enrich:import -- --actor-id 15
# Xem dry-run trước khi áp dụng:
npm run data:enrich:import -- --actor-id 15 --apply
npm run test:data-enrich
npm run verify:data-enrich
```

ID admin trên là ID máy hiện tại. Raw HTML/CSV, bundle, checkpoint và báo cáo chi tiết nằm trong `data/stats-enrichment/` và được gitignore. [Báo cáo đã nhập](../archive/reports/stats-enrichment-report.json) chứa số lượng thực tế; API PlayerStats hiện có đọc trực tiếp các trường vừa bổ sung.

Đã chạy thành công `test:data-enrich`, `verify:data-enrich`, `verify:data-import` (gồm kiểm tra HTTP với Scout), `verify:data-stats`, `test:matching` và `tsc --noEmit`. Nhập lại cùng bundle: **0 thay đổi**.

## Estimation

Ước tính theo bằng chứng cá nhân.

Đã nâng bản ước tính sang `PERSONAL_EVIDENCE_PER90_V2`. Vẫn có 499 người và 2.107 ô ước tính riêng; không thay tổng mùa quan sát hoặc đưa dữ liệu 2024/2025 vào bảng thống kê 2025/2026.

### Thứ tự sử dụng dữ liệu

1. Có thống kê của chính cầu thủ ở mùa 2025/2026 nhưng lệch cách đếm phút: đối chiếu danh tính, CLB, giải, số trận/bàn/kiến tạo; chỉ nhận lệch phút trong ngưỡng đề xuất `max(15 phút, 25%)`. Đổi về /90 và quy về số phút đã lưu, giữ nhãn ước tính. Ngưỡng này rộng hơn importer dữ liệu quan sát vì kết quả chỉ là estimate.
2. Thiếu bằng chứng mùa hiện tại: dùng mùa 2024/2025 của cùng người (ít nhất 450 phút) và kéo về trung vị nhóm cùng vai trò/giải. Trọng số cá nhân là `min(0.65, phút_mùa_trước / (phút_mùa_trước + 900))`. Đây là quy tắc dự án đề xuất, chưa hiệu chuẩn thành tiêu chuẩn bóng đá.
3. Không có bằng chứng cá nhân phù hợp: giữ baseline trung vị cùng vị trí/giải. Không bù theo danh tiếng hoặc tự gán chỉ số cao cho cầu thủ nổi tiếng.

SofaScore ID được nối bằng REEP với ngày sinh khớp; trường hợp không có cầu nối dùng tên đầy đủ duy nhất, CLB đã đối chiếu và baseline phù hợp. Mùa trước yêu cầu cầu nối ID/ngày sinh hoặc ID nhà cung cấp được xác nhận qua hàng mùa hiện tại. Hàng mơ hồ nhiều CLB/giải không được tự chọn. Cặp chuyền vẫn giữ ràng buộc thành công không vượt tổng chuyền.

Nguồn CSV gốc có cả hai mùa: [top5-football-dataset, snapshot đã ghim commit](https://github.com/m-mahadi/top5-football-dataset/tree/8940299c2c56c2c0932d3caf292336f5e1689893). File được đối chiếu SHA256 trước khi chuẩn bị bằng chứng.

### Độ phủ sau điều chỉnh

| Căn cứ | Số ô ước tính |
|---|---:|
| Chính cầu thủ, mùa 2025/2026, quy đổi phút | 1.404 |
| Chính cầu thủ, mùa 2024/2025, kết hợp nhóm tham chiếu | 343 |
| Chỉ có nhóm cùng vị trí/giải | 360 |
| Tổng | 2.107 |

Không gọi 1.404 ô đầu là số liệu thật đã xác minh: khác nhà cung cấp và định nghĩa phút vẫn cần giữ riêng. Các sai số MAE ghi trong báo cáo cũ chỉ thuộc baseline V1, không phải kiểm định độ chính xác của V2. Cần tập đối chứng độc lập để đánh giá V2.

### Một số đối chiếu bên ngoài đã đọc

- [Opta: Kovačić, lịch sử mùa](https://theanalyst.com/players/4146/mateo-kovacic/career): Premier League 2025/2026 có 6 trận, 126 phút, khớp tổng phút/trận đang lưu. [Man City xác nhận phẫu thuật Achilles](https://www.mancity.com/news/mens/mateo-kovacic-injury-fitness-update-63884454): giải thích bối cảnh ít thi đấu, không cung cấp tổng ngày nghỉ hai năm hay xác nhận tình trạng hiện tại.
- [Opta: Džeko, lịch sử mùa](https://theanalyst.com/players/6432/edin-dzeko/career): phần Serie A 2025/2026 ghi 11 trận/238 phút, trong khi nguồn đang dùng là 236 phút. Tách riêng số liệu ở Schalke/giải hạng hai; không cộng vào phạm vi 5 giải VĐQG.
- [Real Madrid, báo cáo Alaba ngày 27/06/2025](https://www.realmadrid.com/en-US/news/football/first-team/medical-reports/parte-medico-de-alaba-27-06-2025): có chấn thương cơ dép chân trái. Không có ngày hồi phục đầy đủ để tự tính tổng ngày nghỉ hoặc kết luận còn chấn thương ngày 21/10/2026.
- [Barcelona, cập nhật Ter Stegen ngày 29/07/2025](https://www.fcbarcelona.com/en/news/4327634/ter-stegen-medical-update): có phẫu thuật lưng; thời điểm trở lại phụ thuộc hồi phục. Không tự gán một ngày kết thúc hoặc xác minh trọn hai năm từ bài này.

Các bài trên dùng đối chiếu bối cảnh và phạm vi, không biến thành InjuryHistory giả hoặc đưa tổng ngày nghỉ dự đoán vào PlayerDataVerification. Việc kiểm tra web trực tiếp mới thực hiện ở một số trường hợp; không khẳng định đã tra cứu riêng từng người trong 499 hồ sơ.

### Ví dụ ước tính mới

Tổng mùa 2025/2026 sau quy đổi, **không phải thống kê quan sát**:

| Cầu thủ | Phút đã lưu | Tắc bóng | Cắt bóng | Key passes | Chuyền thành công | Tổng chuyền |
|---|---:|---:|---:|---:|---:|---:|
| Mateo Kovačić | 126 | 1 | 2 | 4 | 127 | 139 |
| Edin Džeko | 236 | 1 | 1 | 2 | 56 | 76 |

Alaba: chỉ ba ô còn thiếu được ước tính thành tắc bóng 4, cắt bóng 0, key passes 0 theo bằng chứng mùa của chính anh; các số chuyền đã có giữ nguyên. Một giá trị ước tính 0 vẫn được ghi nhãn ước tính, không đồng nghĩa đã quan sát chắc chắn 0 sự kiện.

### Chạy lại

Trong backend:

```sh
npm run data:estimate:prepare
npm run data:estimate -- --actor-id 15
# Xem kế hoạch rồi mới áp dụng:
npm run data:estimate -- --actor-id 15 --apply
```

Thay 15 bằng admin thực tế. Bằng chứng cá nhân nằm trong `data/maintenance/personal-stat-evidence.json`; bản cũ của bảng estimate được backup trước khi cập nhật. API thống kê trả phương pháp V2 và căn cứ từng trường trong `estimate.evidence.fields`. Matching vẫn chưa tự dùng estimate; hợp đồng, lương và số ngày chấn thương vẫn chưa được giả lập trong lần này.

<a id="v3-metrics"></a>

## Đầu vào thống kê V3

Bộ chuẩn bị ngày 11/11/2026, kiểm tra lại ngày 12/11/2026, gồm **2.684 cầu thủ mùa 2025/2026**, trong phạm vi 5 giải hiện có. Lưu ở bảng `player_stats_metrics`, không thay thống kê quan sát và 499 hồ sơ estimate cơ bản. Bản thử điểm vai trò V3 giai đoạn 2 đã dùng các đầu vào này; engine V1 hiện có vẫn giữ cách tính cũ. Chưa bổ sung hợp đồng, lương hoặc lịch sử chấn thương trong bước này.

| Độ phủ | Số lượng |
| --- | ---: |
| Cầu thủ ngoài sân, 18 chỉ số/người | 2.490 |
| Thủ môn, 6 chỉ số/người | 194 |
| Hồ sơ đủ giá trị và mẫu số cần thiết để thử V3, có bao gồm ước tính | 2.580 |
| Hồ sơ còn thiếu ít nhất một tỷ lệ do thi đấu rất ít | 104 |
| Giá trị /90 hoặc tỷ lệ tính từ dữ liệu nguồn (`DERIVED`) | 26.699 |
| Giá trị /90 đọc trực tiếp từ nguồn, phút gần khớp (`OBSERVED`) | 6 |
| Giá trị ước tính, proxy hoặc giả định (`ESTIMATED`) | 19.137 |
| Giá trị giữ `null` (`MISSING`) | 142 |

`OBSERVED`/`DERIVED` mô tả cách tạo giá trị từ snapshot bên thứ ba, không phải xác minh chính thức. **Đủ giá trị không có nghĩa đủ số liệu đo thật hoặc đủ toàn bộ F/S/R.** Trong 142 ô null có 95 tỷ lệ thắng không chiến, 46 tỷ lệ pressing thành công và 1 tỷ lệ bắt bóng tạt: số lần thử mô phỏng làm tròn về 0 nên không thực hiện phép chia. Ngày 12/11, 95 tỷ lệ không chiến của người chỉ đá 1–18 phút được chuyển từ ước tính sang null vì không đủ mẫu số. Căn cứ dự đoán cũ vẫn lưu ở `prediction`; không thay số liệu quan sát.

### Nguồn và cách suy luận

- [Bảng player seasons](https://github.com/m-mahadi/top5-football-dataset/blob/master/data/master/player_seasons.csv) cung cấp xG/xA, không chiến, hoạt động thu hồi bóng, chạy và thống kê thủ môn. Không lấy các cột EA/SoFIFA làm thống kê thi đấu. Đối chiếu được 2.430 cầu thủ với mùa hiện tại; mùa cũ giữ nhãn ước tính khi sử dụng.
- [DataMB](https://datamb.football/guide/) cung cấp chuyền/kéo bóng tịnh tiến từ các bảng vị trí mùa 25/26, ghép được 1.412 cầu thủ. Đây là tập có ngưỡng số phút của nhà cung cấp. Các tập nguồn có giao nhau, không cộng hai con số để tính số người duy nhất.
- Ghép bằng ID nhà cung cấp/ngày sinh hoặc tên duy nhất, kết hợp CLB, tuổi/năm sinh, số trận/bàn và phút. Alias CLB mới cần ít nhất 3 cầu thủ độc lập cùng xác nhận. Lưu URL, SHA256, dòng nguồn và căn cứ ghép; không tự chọn hàng mơ hồ nhiều CLB.
- Giữ mẫu số phút của chính nguồn khi tính /90. Phút lệch khỏi ngưỡng gần khớp `max(2 phút, 1%)` được ghi `ESTIMATED`, không thay số phút trong database. Nguồn có lệch trên `max(20 phút, 25%)` không được ghép vào mùa hiện tại.
- Ưu tiên số gốc đã có, rồi bằng chứng cá nhân mùa hiện tại. Khi thiếu, kết hợp mùa trước với nhóm gần về chỉ số cơ bản, cùng vị trí/giải. Nhóm tham chiếu cần ít nhất 12 người, mỗi người ít nhất 900 phút; không dùng giá trị suy luận của người này để suy luận tiếp cho người khác.
- Chuyền tịnh tiến của ST thiếu mẫu: dùng tỷ lệ trung vị trên chuyền thành công từ 7 ST có nguồn, yêu cầu ít nhất 5 mẫu. Mẫu này thiên về người đa năng và có thể phối hợp mẫu số giữa nguồn, nên vẫn là ước tính chưa hiệu chuẩn.

Những mục chưa có nguồn đo cần lưu ý:

- Pressing: số lần và tỷ lệ thành công được mô phỏng từ mức nền theo vị trí và hoạt động phòng ngự, **không phải số liệu pressing quan sát**.
- PAdj: proxy của dự án là `/90 × 0,5 / (1 − tỷ_lệ_kiểm_soát_bóng_của_đội)`, với tỷ lệ kiểm soát ở dạng 0–1. Không phải định nghĩa PAdj của DataMB và không có possession riêng trong phút cầu thủ có mặt. Thiếu một CLB xác định dùng giả định 50%, ghi `ESTIMATED`.
- Thủ môn: `saves / (saves + goalsConceded)` chỉ là proxy tỷ lệ cản phá, có thể lệch do bàn phản lưới. Runs out không chứng minh toàn bộ sự kiện diễn ra ngoài vòng cấm. Chuyền tịnh tiến thiếu nguồn dùng giả định 12% chuyền thành công, tối đa 6/90. Bắt bóng tạt dùng giả định theo chiều cao và 12 quả tạt đối mặt/90; không coi high claims là toàn bộ mẫu số.
- Tỷ lệ được suy luận lưu cả số lần thử/thành công mô phỏng khi cần làm mượt. Cả hai vẫn là ước tính; không đưa chúng vào tập tham chiếu đo thật hoặc dùng để xác minh hồ sơ.

Kiểm tra nội bộ che một chỉ số của 40 người cho mỗi mục, loại chính người đó khỏi nhóm dự đoán, so với số nguồn còn giữ. Ví dụ MAE xG/90 khoảng 0,058 và chuyền tịnh tiến/90 khoảng 1,049. Thu hồi bóng 1/3 sân đối phương có MAE 0,182, kém baseline trung vị vị trí 0,177. Đây là kiểm tra trên cùng mùa và nhà cung cấp; chưa chứng minh độ chính xác ngoài mẫu, chưa kiểm định các giả định pressing/bắt bóng tạt hay mẫu ST nhỏ. Báo cáo chi tiết nằm trong `data/v3-metrics/import-report.json`.

### Nhập lại và xem qua API

Chạy trong `backend`, thay 15 bằng ID admin trên máy:

```sh
npm run data:metrics:fetch
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run data:metrics -- --actor-id 15
# Sau khi xem dry-run:
npm run data:metrics -- --actor-id 15 --apply
npm run test:metrics
npm run test:estimation-api
```

Nguồn tải được ghim checksum trong script fetch; thay đổi nội dung phải đối chiếu lại. Import có transaction, backup bảng metrics cũ và AuditLog; chạy lại cùng đầu vào trả 0 thay đổi. Cache/báo cáo trong `data/v3-metrics/` được gitignore. Sửa hồ sơ nền sẽ khiến `metrics.stale=true`; sửa thống kê qua API xóa bộ suy luận để tránh dùng giá trị cũ.

Trong mục test API hiện có, chọn **Thống kê cầu thủ**, nhập **1621** để xem Haaland. JSON trả `data.metrics.values`, ví dụ `expectedGoalsPer90.value`, `progressivePassesPer90.status` và `basis`. ID cầu thủ của Haaland vẫn là **1700**. Form S cũ dùng V1; form **Matching V3** riêng đã dùng metrics, percentile và ma trận vai trò.


<a id="v3-stage-1"></a>

## Triển khai V3 — giai đoạn 1 hoàn thành

Mục này ghi lại phạm vi ngày 12/11/2026: **cấu hình và dữ liệu đầu vào**. Trạng thái hiện tại đã sang giai đoạn 3 bên dưới; các form F/S/R V1 vẫn giữ phiên bản cũ.

| Giai đoạn | Phạm vi | Trạng thái |
| --- | --- | --- |
| 1 | Ma trận, cấu hình có phiên bản, cấu trúc và kiểm kê đầu vào | Hoàn thành |
| 2 | Tập tham chiếu, percentile, làm mượt và điểm 35 vai trò | Hoàn thành, xem phần giai đoạn 2 bên dưới |
| 3 | F/R V3, điểm tổng, lọc và xếp hạng | Hoàn thành; có API, lưu lịch sử và form test |
| 4 | Bàn giao FE, kiểm thử toàn luồng và audit độ phủ | Hoàn thành phần kỹ thuật; dữ liệu thật và kiểm định tuyển trạch độc lập còn giới hạn ở mục giai đoạn 4 |

### Những phần đã có

- Ma trận đọc đúng workbook được cung cấp: **33 vai trò ngoài sân + 2 thủ môn**, mỗi vai trò tổng trọng số 100%. Registry `src/config/matching-v3-matrix.ts` ghim SHA256; runtime không phụ thuộc Excel hay đường dẫn Downloads.
- Khai báo **18 chỉ số ngoài sân, 6 chỉ số thủ môn**, đơn vị /90 hoặc phần trăm. `goalsPreventedPer90` được phép âm. Hai tỷ lệ không chiến và pressing phải có cả số thành công/tổng lần thử, nhất quán với giá trị tỷ lệ.
- Cấu hình V3 và bốn chiến lược được kiểm tra qua ScoringConfig hiện có. Bản mặc định ID **54** trên máy hiện tại, **chưa active**; máy khác có ID riêng. Không thay cấu hình đang chạy.
- Ở thời điểm giai đoạn 1, API kích hoạt V3 trả 409. Từ giai đoạn 3 Admin có thể kích hoạt cấu hình V3 hợp lệ; không tự chuyển cấu hình active.
- Hai chế độ đã khai báo: `PROTOTYPE` cho phép ước tính có nhãn; `OBSERVED_ONLY` dành cho dữ liệu quan sát/derived. Việc thực thi chế độ khi chấm điểm thuộc giai đoạn 2.
- `PlayerStats.positionMinutes` và `positionMinutesSource`: map phút của 10 vị trí dự án, số nguyên không âm, tổng không vượt `minutesPlayed`, bắt buộc có nguồn khi có map. Không tự biến vị trí phụ thành tỷ lệ phút.
- `InjuryHistory.bodyRegion`: vùng cơ thể tùy chọn; chuỗi được trim, viết hoa và nối khoảng trắng bằng `_`, không tự suy từ tên chấn thương. Khi chưa biết để null.
- Có bảng cache `role_score_snapshots`; lúc chốt giai đoạn 1 bảng để trống, giai đoạn 2 đã xây cache. Các cột điểm thành phần MatchResult cho phép null để chuẩn bị trường hợp trọng số bằng 0; giai đoạn 1 không ghi kết quả Matching.

Một số lựa chọn kỹ thuật còn mở trong báo cáo được khai báo rõ ở `parameters.settings` và `policies`, chưa thực thi: trung bình tỷ lệ theo số lần thử; tối thiểu 10 người tham chiếu; thiếu Sprints chuyển sang Press, thiếu Dist chuyển sang PrgC; mốc giá lấy lần gần nhất trước mốc, không quá 180 ngày; độ lệch chuẩn mẫu. Không coi các lựa chọn này là mô hình đã hiệu chuẩn.

### API cấu hình và nhập trường bổ sung

Ở thời điểm giai đoạn 1, template trả `implementationStage: 1`, `scoringAvailable: false`. Hiện tại template trả **4 / true**; xem hợp đồng chấm điểm giai đoạn 3 bên dưới.

Trang `/login` có mục **Matching V3 — Giai đoạn 1** ngay dưới nút kiểm tra phiên. Sau khi đăng nhập, trang tự tải bốn chiến lược từ API; chọn chiến lược sẽ hiển thị trọng số F/S/R tương ứng. Có nút tải lại cấu hình và lựa chọn đọc JSON trong mục thử API. Lựa chọn này chỉ để xem cấu hình, chưa ghi vào database hoặc áp dụng cho các form tính điểm cũ. Làm mới trang nếu đang mở bản UI trước đó.

Admin dùng API thống kê sẵn có để nhập phút theo vị trí:

```http
PATCH /api/player-stats/1621
Authorization: Bearer <token>
Content-Type: application/json

{
  "positionMinutes": {"ST": 2500, "CAM": 459},
  "positionMinutesSource": "Nguồn nhật ký vị trí đã đối chiếu"
}
```

Đây chỉ là ví dụ cấu trúc, **không phải phút theo vị trí thật của Haaland**. Muốn xóa gửi cả hai trường bằng null. Sửa phút theo vị trí không xóa bộ metrics hiện có; sửa thống kê nền làm mất hiệu lực metrics/estimate và cache liên quan. Admin có thể gửi thêm `bodyRegion`, ví dụ `LEFT_THIGH`, qua API `/api/injury-history` hiện có.

PATCH gửi lại giá trị không đổi giữ nguyên estimate, metrics và cache, kể cả khi thứ tự các khóa trong `positionMinutes` khác nhau. Kiểm kê đầu vào dùng cùng quy tắc phút theo vị trí với API để phát hiện cả bản ghi nhập trực tiếp sai. Cầu thủ có 0 phút vẫn được giữ trong database và được liệt kê là chưa đủ đầu vào thống kê để chấm.

### Kiểm kê dữ liệu thực tế

- 2.684 cầu thủ, tất cả có nguồn trong phạm vi 5 giải và có bản ghi metrics; không có hồ sơ stale hoặc vị trí lạ.
- **2.580 người đủ đầu vào thống kê để thử nghiệm có ước tính**, 104 người còn thiếu tổng cộng 142 ô. Danh sách có tên, playerId và statsId trong báo cáo máy sinh.
- Chưa có ai đủ toàn bộ bộ chỉ số chỉ từ quan sát/derived, vì còn các giả định pressing/thủ môn. Không thể gọi bộ dữ liệu hiện tại là dữ liệu đo đầy đủ.
- Hiện chưa có báo giá phí/lương theo nhu cầu CLB, hợp đồng ACTIVE, lịch sử chấn thương hoặc xác minh độ phủ chấn thương. Có **53.352 dòng lịch sử định giá**, nhưng chưa xác nhận đủ chuỗi và mốc cho từng người; phần này kiểm tra khi triển khai R.
- Chưa có phút thi đấu theo vị trí. Giai đoạn 2 không được tự coi cầu thủ đã có >=25% phút ở nhóm lân cận.

Vì vậy **xong nền tảng đầu vào không đồng nghĩa đã đủ dữ liệu để tính toàn bộ F/S/R**. Các mục chưa biết giữ null, không tự coi không có chấn thương là khỏe mạnh.

### Chạy lại kiểm tra giai đoạn 1

Chạy trong `backend`, thay 15 bằng Admin thực tế:

```sh
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run matching:v3:prepare -- --actor-id 15
npm run test:matching-v3
npm run test:matching-v3-inputs-api
npm run test:metrics
npm run build
```

Lệnh `matching:v3:prepare` tạo cấu hình mặc định nếu chưa có và xuất `data/v3-metrics/stage-1-readiness.json`; không ghi đè cấu hình khác, không active cấu hình, không suy luận thêm dữ liệu, không tính điểm. Mùa chưa có bản ghi sẽ báo lỗi, không xác nhận sẵn sàng và không thay báo cáo cũ. Chạy lại cùng đầu vào không tạo thêm cấu hình. Báo cáo chứa độ phủ từng chỉ số và danh sách thiếu; không đưa thông tin đăng nhập vào báo cáo. File nằm trong vùng dữ liệu được gitignore.

<a id="v3-stage-2"></a>

## V3 giai đoạn 2 — điểm vai trò

Đã triển khai percentile cùng nhóm vị trí/mùa/phạm vi 5 giải, làm mượt tỷ lệ, điểm phút và ma trận 35 vai trò. Ngưỡng tham chiếu mặc định 450 phút, ít nhất 10 người cho từng chỉ số; không lấy danh sách ứng viên của yêu cầu làm tập tham chiếu. Thủ môn dùng nhóm và bộ chỉ số riêng; `goalsPreventedPer90` âm được giữ nguyên.

```text
P_i = 100 × (số người thấp hơn + 0,5 × số người bằng) / số người tham chiếu
Q_role = tổng(w_i × P_i)
S_minute = min(100, 100 × minutesPlayed / 2000)
Score_role = min(0,2 × S_minute + 0,8 × Q_role, S_minute + 20, 100)
```

Không chiến và tỷ lệ pressing được làm mượt bằng `(successes + 30 × groupMean) / (attempts + 30)` trước percentile. Mặc định groupMean tính bằng tổng thành công/tổng lần thử. Thiếu số lần thử không được thay bằng 0. Thiếu tracking chỉ chuyển trọng số nếu chỉ số nhận đủ đầu vào và đủ mẫu tham chiếu. Các quy tắc kỹ thuật này nằm trong settings có kiểm tra, vẫn là giả định khởi đầu.

Nhóm lân cận có hướng theo V3; chỉ đủ điều kiện nếu đã xác nhận >=25% phút ở nhóm đích hoặc người dùng bật `allowPositionShift`. Vị trí phụ không thay thế bằng chứng phút. Percentile dùng nhóm đích. Vector có 33 vai trò cho cầu thủ ngoài sân, 2 cho GK; `eligible` phân biệt kết quả số học với vai trò cầu thủ thực sự được xét. Hai vai trò đầu cách nhau dưới 3 điểm có cờ cảnh báo.

### API và cache

`POST /api/matching/v3/squad/preview`, cần token Scout/Admin:

```json
{
  "playerId": 1700,
  "season": "2025/2026",
  "roleIds": ["POACHER"],
  "options": {"dataMode": "PROTOTYPE", "allowPositionShift": false}
}
```

`roleIds` không bắt buộc. Khi bỏ trống, trả vector và top 5 vai trò đủ điều kiện; chưa tự chọn S cho yêu cầu CLB. Khi gửi danh sách, `squadScore` là điểm cao nhất chỉ trong các vai trò được yêu cầu, với điều kiện toàn bộ danh sách đủ dữ liệu và đủ điều kiện vị trí; nếu chưa đủ giữ null. Không thay bằng vai trò khác ngoài yêu cầu. Preview chưa áp dụng min_minutes/s_min, bộ lọc phí/lương hay tính F/R.

Response có tên cầu thủ, phút, `roles`, `metricsByGroup` chứa từng percentile/trọng số, counts/mean tham chiếu, lý do thiếu, `estimatedWeight`, cờ vị trí, cap và cache. `PROTOTYPE` cho phép ước tính trong cả đầu vào và tập tham chiếu, luôn có cảnh báo; `OBSERVED_ONLY` loại ước tính theo từng chỉ số. Số người tham chiếu tổng không phải số người dùng cho từng percentile: xem `referenceCount` ở mỗi chỉ số. Các giá trị số giữ đủ độ chính xác; UI mới làm tròn để hiển thị.

Cấu hình mặc định đã công bố dùng được khi chưa active. Admin có thể thử cấu hình V3 riêng bằng configId; Scout chỉ dùng bản mặc định đúng template hoặc cấu hình active được phép. Từ giai đoạn 3, `scoringAvailable=true`, `roleScoringAvailable=true`; Admin có thể kích hoạt V3. Khi không chỉ định configId, engine ưu tiên cấu hình V3 active, nếu không có thì dùng bản mặc định đã công bố.

Cache `RoleScoreSnapshot` gắn thống kê, chế độ, chính sách tính, ma trận thật và fingerprint dữ liệu của toàn mùa. Fingerprint kiểm tra cả JSON thực tế, không chỉ sourceHash. Sửa chỉ số, hồ sơ, nguồn hoặc tập tham chiếu sẽ làm cache cũ không hợp lệ. Cache không phải MatchResult; preview và rebuild không ghi lịch sử Matching, không sửa các quan sát gốc.

Admin xây lại cache bằng `POST /api/matching/v3/roles/rebuild` với body `{"season":"2025/2026","dataMode":"PROTOTYPE"}` hoặc:

```sh
cd backend
npm run matching:v3:roles -- --actor-id 15
npm run test:matching-v3-performance
npm run test:matching-v3-squad-api
npm run test:login
```

Thay 15 bằng Admin thực tế. Ngày 17/11/2026: 2.684 cầu thủ trong phạm vi, 1.972 người đạt ngưỡng phút tham chiếu; 2.673 người tính được ít nhất một vai trò thuộc nhóm vị trí chính ở PROTOTYPE, 11 người còn thiếu. Con số này khác 2.580 hồ sơ đủ toàn bộ 18/6 chỉ số vì mỗi vai trò chỉ dùng các chỉ số có trọng số dương. Chưa chứng minh chất lượng dữ liệu đo, chưa áp dụng ngưỡng điểm hoặc điều kiện tuyển dụng/chuyển nhượng.

Trên `/login`, mục **Matching V3 → Thử điểm vai trò V3** cho nhập ID cầu thủ, mùa, chế độ, vai trò và lựa chọn chuyển nhóm. Ví dụ ID Haaland 1700, Van Dijk 369, Alisson 262. Xem bảng điểm và mở chi tiết JSON để đọc percentile, ước tính và dữ liệu thiếu. Các ví dụ này là điểm thử của mô hình, không phải đánh giá chính thức. Giai đoạn 3 bên dưới đã bổ sung F/R V3 và ghép theo bốn chiến lược.


<a id="v3-stage-3"></a>

## V3 giai đoạn 3 — F/S/R, lọc và xếp hạng

Hoàn thành ngày 17/11/2026. Engine `matching-v3.0.0` có namespace riêng `/api/matching/v3`; không đổi công thức V1, không tự active cấu hình và không sinh thêm dữ liệu cầu thủ. API và form test cơ bản được làm cùng giai đoạn này để kiểm chứng toàn luồng.

### Financial F

Đặt u = phí dự kiến / ngân sách, v = lương năm dự kiến / trần lương năm; hai trần phải dương, cùng tiền tệ.

| Thành phần | Trong trần (tỷ lệ 0–1) | Vượt trần đến 1 + dung sai τ |
| --- | --- | --- |
| Phí | `100 × (0,90 − 0,30 × u)` | `60 × (1 − (u − 1) / τ_fee)` |
| Lương | `100 × (0,96 − 0,36 × v)` | `60 × (1 − (v − 1) / τ_wage)` |

Phí dùng 50% ngân sách được 75; lương dùng 50% trần được 78; đúng trần đều 60. Đúng giới hạn dung sai được 0 nhưng chưa loại; cao hơn thì loại. τ = 0 không cho vượt trần. So sánh giới hạn bằng Decimal để tránh sai số tại biên.

Với c là số năm hợp đồng còn lại với CLB cũ: `d = max(c_min − c, 0, c − c_max)`, `F_contract = max(0, 100 − 30d)`. Khoảng ưu tiên mặc định 2–4 năm theo báo cáo; c = 0 → 40, c = 1 → 70, c = 2–4 → 100, c = 5 → 70.

`F = 45% phí + 35% lương + 20% hợp đồng`. Phí/lương lấy MatchingInput của đúng cầu thủ và nhu cầu CLB. Không lấy lương hợp đồng hiện tại thay lương yêu cầu. Chỉ PROTOTYPE mới được ước tính phí = giá trị thị trường × 1,15 khi cấu hình cho phép; kết quả nêu nguồn, ngày và nhãn ước tính. Báo giá MatchingInput là dữ liệu người dùng cung cấp, không tự được chứng nhận là dữ liệu quan sát. OBSERVED_ONLY loại đầu vào thống kê ước tính và không dùng fallback phí/chấn thương.

Thời hạn lấy hợp đồng ACTIVE có hiệu lực tại ngày tính; nhiều hợp đồng chồng lấn làm thời hạn chưa biết. Cầu thủ tự do phải được xác minh đúng ngày tính và không có hợp đồng ACTIVE; khi đó thời hạn 0 và phí 0 nếu không có báo giá.

### Risk & Future R

Ngày tính lấy lịch Việt Nam. Cửa sổ chấn thương 24 tháng: 12 tháng gần nhất hệ số 1, 12 tháng trước hệ số 0,6. Gộp khoảng nghỉ chồng lấn, chỉ đếm ngày đã qua, không đếm tương lai.

- `D_w = min(180, ngày gần + 0,6 × ngày cũ)`.
- Phạt tái phát: `min(24, 8 × tổng số đợt lặp lại theo vùng cơ thể)`.
- Phạt nặng: `min(20, 10 × số đợt kéo dài ít nhất 90 ngày đã qua)`.
- `R_injury = max(0, 100 × (1 − D_w/180) − phạt tái phát − phạt nặng)`.

Chính sách triển khai: các bản ghi cùng vùng cơ thể chồng lấn hoặc tiếp nối được gộp thành một đợt khi tính phạt; vẫn giữ bản ghi gốc trong snapshot. Cần xác minh bao phủ đủ 24 tháng và vùng cơ thể của các đợt liên quan. Không có bản ghi không có nghĩa khỏe mạnh. Mặc định thiếu thì null; điểm tạm 70 chỉ dùng khi cấu hình chủ động bật và chế độ PROTOTYPE.

Điểm tuổi bán lại dùng tuổi hiện tại + thời gian giữ H (mặc định 3 năm): ≤26 → 100; 29 → 70; 32 → 30; ≥35 → 0; nội suy tuyến tính giữa các mốc.

Giá phải dương, cùng nguồn, không dùng bản ghi tương lai; ít nhất 4 ngày định giá khác nhau trong 24 tháng. g là hệ số hồi quy log(giá) theo thời gian thực tính bằng năm. Năm mốc −24/−18/−12/−6/0 tháng lấy giá gần nhất **tại hoặc trước mốc**, cũ tối đa 180 ngày (cấu hình được); không lấy giá tương lai hay tự nội suy thành quan sát. σ là độ lệch chuẩn mẫu của bốn log-return liên tiếp; cấu hình có thể chọn tổng thể.

```text
T = 50 + 50 × clamp(g/0,30, −1, 1)
V = 100 × (1 − min(σ/0,35, 1))
R_price = 60% T + 40% V
R_resale = 60% điểm tuổi bán lại + 40% R_price
R = 50% R_injury + 50% R_resale
```

Có nhiều nguồn giá thì phải chọn `valuationSource`; không trộn chuỗi. `criteria.risk.resale.price` trả quan sát, reliability và mốc carry-forward để kiểm tra. Reliability không tự đổi thành hệ số phạt; nguồn chưa xác minh vẫn cần được người dùng đánh giá. Thiếu chuỗi không giả định g = 0 hay σ = 0.

### Ghép điểm, bộ lọc và lịch sử

`Total = wF × F + wS × S + wR × R`. S là điểm tốt nhất trong các vai trò **được yêu cầu và đủ điều kiện**, không chọn vai trò khác ngoài yêu cầu. Các roleIds phải cùng nhóm vị trí nhu cầu CLB. Thiếu điểm của một vai trò yêu cầu đủ điều kiện thì S chưa biết.

Dùng bốn chiến lược của template hoặc `pillarWeights` tùy chỉnh; tổng dương được chuẩn hóa và trả lại trong response. Không gửi cả hai. Đổi chiến lược không đổi F/S/R khi các đầu vào khác giữ nguyên.

Bộ lọc gồm dung sai phí/lương, nhóm vị trí, phút tối thiểu (900), điểm vai trò tối thiểu (70); tuổi/chân thuận/giải là tùy chọn. **Tuổi chỉ lọc theo options.minimumAge/maximumAge gửi lên; không ngầm áp dụng minAge/maxAge cũ trong nhu cầu CLB.** 900 phút vẫn bị trần vai trò 65, nên không qua mức 70 mặc định; API không tự sửa quy tắc này. Thiếu phí/lương vẫn chưa thể xác nhận qua bộ lọc dù trọng số F bằng 0.

- COMPLETE: đủ dữ liệu có trọng số và qua bộ lọc; có điểm tổng.
- INCOMPLETE: còn thiếu dữ liệu; tổng null, kèm `missing`.
- EXCLUDED: có điều kiện loại đã xác định; tổng null, kèm `excluded`, vẫn giữ lý do thiếu nếu có.

Không thay null bằng 0 hoặc tự chia lại trọng số. Trụ có trọng số 0 có thể giữ null và lưu nguyên null. Điểm thành phần/tổng trình bày làm tròn 2 chữ số; `precision` và tiêu chí giữ số chưa làm tròn. Xếp hạng theo tổng giảm, S giảm, F giảm, phí tăng, ID tăng. Pros/Cons hiện dùng mốc mô tả 70 và đóng góp điểm; đây là quy tắc giải thích của mô hình, chưa phải kết luận tuyển trạch đã kiểm định.

Search đọc toàn bộ cầu thủ import trong phạm vi top 5 của mùa; tập tham chiếu không đổi theo danh sách ứng viên. Rank nhận tối đa 100 ID. Cả hai không tự lưu MatchResult. Chỉ evaluate với `save:true` và COMPLETE mới lưu một kết quả cùng snapshot đầu vào, nguồn, công thức, ma trận, cấu hình, tùy chọn, trọng số thực, hash dataset và AuditLog. Không tự thêm shortlist. Cấu hình đã được dùng trong lịch sử không được sửa để đổi ý nghĩa kết quả cũ.

Cần token. Scout chỉ dùng nhu cầu của mình, Admin được mọi nhu cầu. Thiếu dữ liệu vẫn HTTP 200 với trạng thái trên; sai body 400, thiếu token 401, ngoài phạm vi 404, cấu hình không dùng được 409.

### Kiểm chứng

Ví dụ M trong báo cáo cho F = 74,102; S = 81,408; R = 80,233333…; BALANCED = **78,98**. Các test API tạo dữ liệu riêng có nhãn TEST, kiểm tra bốn chiến lược, biên dung sai, phân quyền, rank/search và snapshot rồi dọn dữ liệu. Không dùng fixture để lấp thiếu trong dữ liệu thật.

```bash
npm run build
npm run test:matching-v3-financial-risk
npm run test:matching-v3-engine-api
npm run test:login
```


Kiểm tra trên dữ liệu local ngày 17/11/2026: 2.684 cầu thủ, 96 CLB, 2.684 bộ thống kê và metrics; chưa có MatchingInput, hợp đồng, lịch sử/xác minh chấn thương. Search nhu cầu ST với điều kiện mặc định xét 2.684 người: 51 INCOMPLETE, 2.633 EXCLUDED, 0 COMPLETE. Haaland S = 93,13; thiếu lương, thời hạn hợp đồng và xác minh y tế nên tổng null. Search + evaluate trong lần smoke test khoảng 0,9 giây; đây là phép đo local đơn lẻ, chưa phải kiểm thử tải. Nhu cầu/tài khoản thử được xóa và số bản ghi dữ liệu gốc/lịch sử trước sau giữ nguyên.


<a id="v3-stage-4"></a>

## V3 giai đoạn 4 — kiểm chứng và bàn giao

Ngày 17/11/2026, hoàn tất phần kỹ thuật: hợp đồng OpenAPI có thể export/import; luồng FE được kiểm thử qua HTTP; bộ kiểm thử V3 và hồi quy V1 có một lệnh chạy tuần tự; audit dữ liệu chỉ đọc PostgreSQL. Template hiện `implementationStage:4`, engine vẫn `matching-v3.0.0`, công thức và ma trận giữ phiên bản đã chốt. [Hướng dẫn bàn giao FE](../api/README.md#fe-handoff).

### Chạy audit dữ liệu thật

```bash
npm run matching:v3:audit -- --season 2025/2026
```

Lệnh chỉ SELECT trong transaction `READ ONLY`, không seed hay ghi cache/cấu hình/MatchResult. Xuất `data/v3-metrics/stage-4-readiness.json` (gitignore); lỗi mùa/không có dữ liệu sẽ không ghi đè báo cáo cũ. Report ghi ngày đánh giá, hash tập dữ liệu, cấu hình V3 mặc định, phạm vi/nguồn, trạng thái ước tính, tỷ lệ thiếu và số người chấm được theo từng vai trò. Dùng cấu hình mặc định để đối chiếu, không tự dùng cấu hình active tùy chỉnh. Chạy lại sau khi bổ sung dữ liệu.

Kết quả audit local ngày 17/11/2026:

| Chỉ tiêu | Kết quả |
| --- | ---: |
| Cầu thủ top 5 / bộ thống kê / metrics | 2.684 / 2.684 / 2.684 |
| Metrics cũ hoặc sai định dạng | 0 |
| Có ít nhất một vai trò nhóm chính tính được — PROTOTYPE | 2.673 |
| Có ít nhất một vai trò nhóm chính tính được — OBSERVED_ONLY | 176 |
| Qua ngưỡng phút 900 và vai trò 70 — PROTOTYPE | 581 |
| Qua ngưỡng phút 900 và vai trò 70 — OBSERVED_ONLY | 39 |
| Đủ chuỗi giá theo chính sách V3 | 2.281 |
| Có một hợp đồng ACTIVE hợp lệ | 0 |
| Xác minh đầy đủ chấn thương 24 tháng | 0 |
| Cặp nhu cầu/cầu thủ có phí hoặc lương dự kiến | 0 |

Chỉ tiêu vai trò xét nhóm chính, không bật chuyển vị trí, **chưa tính điều kiện tài chính/y tế**. Quote đếm theo cặp nhu cầu/cầu thủ, không cộng với số người. Cùng một cầu thủ có thể xuất hiện ở nhiều giải trong mùa.

Có 26.699 ô DERIVED, 19.137 ô ESTIMATED, 6 ô OBSERVED và 142 ô MISSING trong metrics đầu vào. Thống kê cơ bản gốc được engine chuẩn hóa /90 riêng; nhãn DERIVED không có nghĩa mọi đầu vào đã được kiểm chứng ngoài thực tế. Kiểm kê đủ toàn bộ đầu vào OBSERVED_ONLY là 0, nhưng 176 người vẫn chấm được ít nhất một vai trò vì mỗi vai trò chỉ cần tập con chỉ số; hai con số đo hai điều khác nhau.

### Đã kiểm chứng được gì?

- Ma trận 35 vai trò, quy tắc percentile/ratio/minutes/tracking và provenance.
- Công thức F/R và ví dụ M của báo cáo; kiểm tra tính đơn điệu và giới hạn điểm.
- API/template/OpenAPI đồng bộ phiên bản, roleIds và tùy chọn.
- Toàn bộ migration và bộ test cũng qua trên database PostgreSQL trống; database tạm đã được xóa.
- HTTP đăng nhập → nhu cầu → báo giá → tính/lưu → lịch sử → shortlist; chống trùng và giới hạn chủ sở hữu.
- Sửa nhu cầu làm tính lại theo đầu vào mới; snapshot lịch sử cũ giữ nguyên. Thiếu dữ liệu không tạo tổng hoặc lưu kết quả.
- Audit không đổi số bản ghi nghiệp vụ/cache; test tạo fixture TEST riêng và dọn sau khi chạy.

**Chưa được xác nhận:** độ đúng của xếp hạng so với nhãn tuyển trạch độc lập, độ chính xác thực của các chỉ số suy luận, khả năng chịu tải nhiều người dùng và độ đầy đủ tài chính/y tế. Kiểm thử công thức qua không biến dữ liệu ước tính thành dữ liệu thật. Đây là phần giới hạn dữ liệu/đánh giá thực nghiệm cần xử lý khi đưa vào sử dụng; không mô tả hệ thống là đã đủ dữ liệu cho mọi cầu thủ.


### Rà soát sau bàn giao

Các kiểm tra đối chiếu snapshot import nằm trong `scripts/verification/`, chạy bằng `verify:data-import`, `verify:data-stats`, `verify:data-enrich`, `verify:top5-scope`. Chúng chỉ dùng khi có đúng bộ dữ liệu/checkpoint của lần import tương ứng; không chạy trong `npm test` hoặc trên DB trống. Báo cáo JSON lịch sử vẫn giữ trong archive; audit V3 mới là lệnh đọc độ phủ hiện tại.

Đã chặn việc suy ra phí 0 từ định giá 0: giá trị thị trường không dương không xác nhận cầu thủ tự do. Fallback phí dùng Decimal và vẫn chỉ cho phép PROTOTYPE. Cầu thủ tự do cần nguồn đăng ký, ngày xác minh hợp lệ và không có hợp đồng ACTIVE. Công thức điểm đã chốt giữ nguyên.
