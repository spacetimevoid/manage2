# Quy tắc sản phẩm và thiết kế

## 1. Mục đích sản phẩm

Lưu trữ file đề và bài tập hay, khó từ hai nguồn: trích xuất từ đề và thu thập ở bên ngoài. Đây là định hướng sản phẩm, không phải danh sách tính năng được phép tự triển khai.

## 2. Triết lý thiết kế

**Less is more.** Giao diện phải đơn giản hết sức có thể, theo phong cách Apple và bám sát thiết kế người dùng đã cung cấp.

Phong cách Apple không phải sự cho phép tự thiết kế lại. Giữ nguyên bố cục, khoảng cách, màu sắc, kiểu chữ và các thành phần hiện có trừ khi người dùng yêu cầu thay đổi cụ thể.

## 3. Không tự thêm

Không tự thêm bất kỳ tính năng, nội dung hoặc chi tiết giao diện nào ngoài yêu cầu. Bao gồm:

- Ô tìm kiếm, bộ lọc, nút, menu, thanh công cụ hoặc khu vực mới.
- Banner, thông báo giới thiệu, nhãn Demo, hướng dẫn và văn bản giải thích.
- Biểu tượng, trang trí, màu sắc, hiệu ứng hoặc CSS thay đổi thiết kế.
- Thao tác xuất file, tự tải file, chuyển mục hoặc luồng thao tác mới.
- Giới hạn dung lượng, số ký tự hoặc quy tắc nghiệp vụ chưa được yêu cầu.

Danh sách trên là ví dụ, không giới hạn phạm vi cấm. Các thành phần đã có trong thiết kế gốc vẫn được giữ; không xóa chúng chỉ vì thuộc những nhóm này.

## 4. Ranh giới khi sửa logic

Được sửa lỗi trong chức năng hiện có đúng theo phạm vi người dùng giao, chẳng hạn số đếm sai, phân trang sai, trạng thái không nhất quán hoặc dữ liệu không được lưu đúng.

Không dùng việc sửa logic để thêm tính năng, đổi cách sử dụng sản phẩm hoặc thay đổi thiết kế. Chỉ thay đổi mã trình bày khi bắt buộc để sửa lỗi hiển thị được giao; nếu ảnh hưởng đến thiết kế đã duyệt, cần hỏi người dùng trước.

## 5. Khi chưa rõ phạm vi

Không tự suy diễn hoặc triển khai phần mở rộng. Hỏi ngắn gọn về điểm chưa rõ và tiếp tục phần công việc độc lập đã được cho phép. Không cần hỏi lại cho các thao tác đã nằm trong yêu cầu.

## 6. Điều kiện hoàn thành

- Thay đổi đáp ứng đúng yêu cầu.
- Không có phần tự thêm ngoài phạm vi.
- Thiết kế và chức năng không liên quan được giữ nguyên.
- Các kiểm tra phù hợp đã được thực hiện; phần chưa kiểm tra được phải nêu rõ.

## 7. Bắt buộc commit sau thay đổi lớn

- Sau mỗi thay đổi lớn, bắt buộc tạo Git commit khi phần công việc đó đã hoàn thành và vượt qua các kiểm tra phù hợp. Commit trước khi bắt đầu công việc khác hoặc báo hoàn tất; không chờ người dùng nhắc.
- Thay đổi lớn gồm thêm tính năng, sửa lỗi ảnh hưởng hành vi hoặc dữ liệu, thay đổi đáng kể về giao diện, kiến trúc hay cấu trúc dự án. Đánh giá theo tác động, không chỉ số dòng mã.
- Mỗi commit ghi nhận một nhóm thay đổi liên quan, có thông điệp mô tả rõ nội dung. Chỉ đưa vào commit các file thuộc công việc được giao, không gộp thay đổi không liên quan của người dùng.
- Commit là ghi nhận cục bộ. Push lên remote theo yêu cầu của người dùng.
- Nếu không thể commit, phải báo rõ nguyên nhân và phần thay đổi còn chưa được commit; không được tuyên bố đã commit khi chưa thực hiện thành công.

## 8. Làm việc tỉ mỉ, cẩn thận và đúng yêu cầu

- Bắt buộc hoàn thành đầy đủ yêu cầu được giao một cách tỉ mỉ, cẩn thận và chính xác. Ưu tiên chất lượng và tính đúng đắn hơn tốc độ; được dành thời gian cần thiết để làm chuẩn.
- Đọc kỹ yêu cầu và phần mã liên quan, xác định nguyên nhân trước khi sửa; rà soát từng mục yêu cầu và các ảnh hưởng liên quan trước khi báo hoàn tất.
- Kiểm chứng phù hợp với thay đổi, bao gồm luồng sử dụng thực tế và kiểm tra trực quan khi thay đổi có liên quan. Nếu phát hiện lỗi thuộc phạm vi công việc, tiếp tục sửa và kiểm tra lại cho đến khi đạt yêu cầu.
- Không dừng ở bản sửa tạm, bỏ sót yêu cầu hoặc báo hoàn tất khi còn công việc cần làm chỉ để tiết kiệm thời gian. Không khẳng định đã kiểm tra hoặc đã sửa đúng khi chưa có bằng chứng.
- Nếu bị chặn bởi quyền truy cập, công cụ hoặc thông tin còn thiếu, nêu rõ phần đã làm, phần chưa thể kiểm chứng và điều cần người dùng cung cấp; không che giấu giới hạn hoặc coi phần bị chặn là đã hoàn thành.
- Quy tắc này không mở rộng phạm vi công việc và không cho phép tự thêm tính năng hoặc thay đổi thiết kế ngoài yêu cầu.

Yêu cầu trực tiếp mới nhất của người dùng được ưu tiên khi có khác biệt với file này.
