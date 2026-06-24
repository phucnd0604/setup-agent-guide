# Hướng dẫn: Cài đặt và Cấu hình Superpowers Plugin cho Antigravity CLI

Tài liệu này hướng dẫn cách cài đặt plugin `superpowers` và cấu hình Hook khởi động (`session-start`) tương thích hoàn toàn với định dạng PreInvocation (`injectSteps`) của Antigravity CLI.

---

## 1. Cài đặt hoặc Cập nhật Superpowers Plugin

### Cài đặt lần đầu
Chạy lệnh dưới đây để tải và cài đặt plugin trực tiếp từ repository GitHub chính thức:
```bash
gemini extensions install https://github.com/obra/superpowers
```

### Cập nhật lên bản mới nhất
Khi có bản cập nhật mới từ upstream, chạy lệnh:
```bash
gemini extensions update superpowers
```

*Lưu ý: Antigravity CLI sẽ tự động tải các file plugin vào thư mục nguồn của nó tại: `~/.gemini/config/plugins/superpowers/`.*

---

## 2. Thiết lập Hook Script `session-start`

Do định dạng JSON mặc định của plugin `superpowers` nguyên bản không tương thích với Antigravity CLI (Antigravity yêu cầu định dạng `injectSteps` thay vì `additionalContext`), chúng ta cần ghi đè hoặc tạo file hook script này.

1. Đảm bảo thư mục hooks đã được tạo:
   ```bash
   mkdir -p ~/.gemini/config/plugins/superpowers/hooks
   ```

2. Tạo hoặc ghi đè nội dung file **`~/.gemini/config/plugins/superpowers/hooks/session-start`** bằng script dưới đây:
   ```bash
   #!/usr/bin/env bash
   # SessionStart hook for superpowers plugin — Antigravity CLI version
   # Inject using-superpowers context before EVERY model call (ephemeral)
   set -euo pipefail

   # Tự xác định đường dẫn thư mục gốc của plugin
   SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
   PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

   # Đọc nội dung skill 'using-superpowers'
   SKILL_FILE="${PLUGIN_ROOT}/skills/using-superpowers/SKILL.md"
   if [ -f "$SKILL_FILE" ]; then
     using_superpowers_content=$(cat "$SKILL_FILE")
   else
     using_superpowers_content="Error: using-superpowers skill not found at ${SKILL_FILE}"
   fi

   # Hàm escape ký tự đặc biệt để đảm bảo an toàn cho chuỗi JSON
   escape_for_json() {
       local s="$1"
       s="${s//\\/\\\\}"
       s="${s//\"/\\\"}"
       s="${s//$'\n'/\\n}"
       s="${s//$'\r'/\\r}"
       s="${s//$'\t'/\\t}"
       printf '%s' "$s"
   }

   using_superpowers_escaped=$(escape_for_json "$using_superpowers_content")

   session_context="<EXTREMELY_IMPORTANT>\nYou have superpowers.\n\n**Below is the full content of your 'superpowers:using-superpowers' skill - your introduction to using skills. For all other skills, use the 'Skill' tool:**\n\n${using_superpowers_escaped}\n</EXTREMELY_IMPORTANT>"

   # Trả về định dạng JSON đúng chuẩn PreInvocation của Antigravity
   printf '{\n  "injectSteps": [\n    {\n      "ephemeralMessage": "%s"\n    }\n  ]\n}\n' "$session_context"

   exit 0
   ```

3. Phân quyền thực thi cho file script vừa tạo:
   ```bash
   chmod +x ~/.gemini/config/plugins/superpowers/hooks/session-start
   ```

---

## 3. Đăng ký Hook trong `hooks.json`

Để Antigravity CLI tự động gọi hook script trên trước mỗi lượt prompt, bạn cần đăng ký nó trong file cấu hình hooks của CLI.

Tạo hoặc cập nhật file **`~/.gemini/config/hooks.json`** với cấu hình sau:

```json
{
  "superpowers-session-start": {
    "PreInvocation": [
      {
        "type": "command",
        "command": "bash \"${HOME}/.gemini/config/plugins/superpowers/hooks/session-start\"",
        "timeout": 15
      }
    ]
  }
}
```

> **Lưu ý:** Biến môi trường `${HOME}` được khai báo trong `command` sẽ được Antigravity CLI tự động phân giải thành đường dẫn thư mục gốc cá nhân của bạn (ví dụ: `/Users/<username>`).

---

## 4. Kiểm tra (Verification)

Sau khi thiết lập, bạn có thể kiểm tra xem hook hoạt động bình thường và xuất ra JSON hợp lệ hay không bằng cách chạy:

```bash
bash ~/.gemini/config/plugins/superpowers/hooks/session-start | python3 -m json.tool
```

**Kết quả mong đợi:**
Lệnh trên sẽ in ra định dạng JSON được format đẹp, chứa mảng `injectSteps` với dữ liệu skill `using-superpowers` đã được escape hoàn chỉnh mà không gặp bất kỳ lỗi cú pháp nào. Khi bắt đầu phiên chat mới với Antigravity CLI, bạn sẽ thấy nội dung hướng dẫn sử dụng skill tự động được inject vào ngữ cảnh.
