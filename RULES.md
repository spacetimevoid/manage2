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

Yêu cầu trực tiếp mới nhất của người dùng được ưu tiên khi có khác biệt với file này.
