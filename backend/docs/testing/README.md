# Thử backend Matching V3

Backend chỉ còn engine V3. Các API và form F/S/R của V1 đã được gỡ; URL cũ trả 404.

<a id="v3-strategies"></a>

## Chạy và đăng nhập

Trong backend, chuẩn bị DATABASE_URL rồi chạy:

```bash
npx prisma migrate deploy --config prisma7.config.ts
npm run dev
```

Mở `http://localhost:3000/login`, đăng nhập bằng tài khoản đã được cấp. Migration tạo cấu hình V3 mặc định trong DB và kích hoạt nếu chưa có cấu hình V3 active. Không có tài khoản/mật khẩu thật được điền sẵn.

## Thử chiến lược và Matching

1. Trong Matching V3, chọn chiến lược: Moneyball 50/30/20, Cân bằng 30/50/20, Dài hạn 20/30/50, Cần ngay vai trò 20/70/10 (F/S/R).
2. Nhập ID cầu thủ và ID nhu cầu CLB đã tồn tại, thuộc phạm vi tài khoản. Đây là hai loại ID khác nhau; requirementId không phải clubId.
3. Chọn mùa đã kết thúc, vai trò thuộc nhóm vị trí nhu cầu, chế độ dữ liệu và dung sai nếu cần. PROTOTYPE cho phép thống kê có nhãn ước tính; OBSERVED_ONLY loại các ước tính.
4. Bấm **Tính Matching V3**. Xem F/S/R, đóng góp trọng số, thiếu dữ liệu/bị loại và JSON. Đổi chiến lược rồi bấm lại chỉ đổi tổng khi đầu vào khác giữ nguyên.
5. Bấm **Tìm và xếp hạng cầu thủ** để xét cohort import của mùa. Ba nhóm ranked/incomplete/excluded được trả riêng; tìm kiếm không tự lưu.
6. Chỉ chọn **Lưu lịch sử nếu đủ điểm và qua bộ lọc** khi muốn lưu một lần đánh giá. COMPLETE mới có saved:true/resultId. Snapshot giữ nguyên khi sửa nhu cầu rồi tính lại.

## Thử riêng điểm vai trò

Mở **Thử điểm vai trò V3**. Trong dữ liệu local hiện tại: Haaland playerId 1700, Van Dijk 369, Alisson 262; mùa 2025/2026. Máy khác cần tra ID từ API, không hardcode.

Xem Q chuyên môn, điểm phút, trần điểm, percentile và tỷ trọng ước tính. Mở JSON để xem từng chỉ số và nhóm tham chiếu. Form này không ghép F/R hoặc lưu MatchResult; lựa chọn chiến lược không đổi điểm vai trò riêng.

## Đọc kết quả

- COMPLETE: đủ dữ liệu có trọng số và qua bộ lọc.
- INCOMPLETE: tổng null, xem missing; không thay null bằng 0.
- EXCLUDED: xem excluded; vẫn có thể kèm dữ liệu thiếu.
- 401: phiên hết hạn/sai token; 403: thiếu quyền; 404: ID ngoài phạm vi hoặc API cũ đã gỡ; 409: cấu hình chưa dùng được/xung đột.

Dữ liệu thực còn thiếu báo giá/lương dự kiến, hợp đồng và xác minh chấn thương. Có thống kê không đồng nghĩa đủ tổng F/S/R. Muốn kiểm chứng công thức toàn luồng bằng fixture tự dọn, chạy test engine; không điền ngẫu nhiên vào hồ sơ thật để làm tổng hiện lên.

## Kiểm thử

Dùng database test riêng đã migrate. Bộ test hiện chưa tự ép TEST_DATABASE_URL; cần đặt DATABASE_URL của tiến trình test đúng database riêng trước khi chạy. Việc tách DB/guard theo review mục 3 là công việc riêng, chưa thực hiện trong lần gỡ V1 này.

```bash
npm test
npm run test:matching-v3:all
npm run test:matching-v3-engine-api
npm run test:login
```

Các suite chạy tuần tự, tạo fixture TEST riêng và dọn sau test; không chạy các suite API đồng thời vì chúng tạm thay cấu hình active. Test V3 kiểm tra API cũ trả 404, cấu hình cũ bị chặn, không còn fallback ID null, lưu kết quả qua cấu hình V3 active và đọc lịch sử cũ theo đúng owner.

## Audit và bàn giao FE

```bash
npm run matching:v3:audit -- --season 2025/2026
npm run matching:v3:openapi -- --check
```

Audit chỉ đọc PostgreSQL, không seed hoặc đổi cache/cấu hình/kết quả; xuất báo cáo local được gitignore. [Độ phủ và công thức](../data/README.md#v3-stage-4). [OpenAPI để import Postman](../api/matching-v3.openapi.json) và [thứ tự gọi từ FE](../api/README.md#fe-handoff).

Các kiểm tra snapshot import cũ nằm trong scripts/verification, chạy bằng verify:*. Chúng cần đúng dataset/checkpoint lịch sử, không phải test trên DB trống. Các test prepare/plan vẫn kiểm tra fill NULL, giữ số 0 và provenance.
