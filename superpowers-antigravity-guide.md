# Hướng dẫn: Cài Superpowers Plugin cho Antigravity CLI

## 1. Install Superpowers extension (1 lần)

```bash
gemini extensions install https://github.com/obra/superpowers
```

Về sau update:

```bash
gemini extensions update superpowers
```

Phần này Antigravity tự lo — nó tải plugin vào `~/.gemini/config/plugins/superpowers/`.

---

## 2. Tạo hook script

Tạo thư mục:

```bash
mkdir -p ~/.gemini/config/plugins/superpowers/hooks
```

Tạo file **`~/.gemini/config/plugins/superpowers/hooks/session-start`** với nội dung:

```bash
#!/usr/bin/env bash
# SessionStart hook for superpowers plugin — Antigravity CLI version
# Inject using-superpowers context before EVERY model call (ephemeral)
set -euo pipefail

# Self-resolve plugin root (Antigravity không set env var cho plugin root)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read using-superpowers content
SKILL_FILE="${PLUGIN_ROOT}/skills/using-superpowers/SKILL.md"
if [ -f "$SKILL_FILE" ]; then
  using_superpowers_content=$(cat "$SKILL_FILE")
else
  using_superpowers_content="Error: using-superpowers skill not found at ${SKILL_FILE}"
fi

# Escape string for JSON embedding
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

# Output Antigravity PreInvocation format
printf '{\n  "injectSteps": [\n    {\n      "ephemeralMessage": "%s"\n    }\n  ]\n}\n' "$session_context"

exit 0
```

Phân quyền executable:

```bash
chmod +x ~/.gemini/config/plugins/superpowers/hooks/session-start
```

---

## 3. Tạo hooks.json cho Antigravity

Tạo file **`~/.gemini/config/hooks.json`**:

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

> **Lưu ý:** `${HOME}` sẽ được shell expand. Nếu Antigravity không expand biến, thay bằng path tuyệt đối, VD:
> `"command": "bash \"/Users/phucnd/.gemini/config/plugins/superpowers/hooks/session-start\""`

---

## 4. Test

```bash
# Mô phỏng PreInvocation input — phải trả về injectSteps
echo '{"invocationNum": 1, "conversationId": "test-abc", "initialNumSteps": 0}' \
  | bash ~/.gemini/config/plugins/superpowers/hooks/session-start
```

Kết quả mong đợi: JSON object với key `injectSteps` chứa `ephemeralMessage`.

---

## Kiến trúc tổng thể

```
~/.gemini/config/
├── hooks.json                    ← Antigravity đọc cấu hình hook từ đây
│
└── plugins/superpowers/
    ├── plugin.json               ← Meta: name, version (do extension install tạo)
    ├── hooks.json                ← KHÔNG dùng cho Antigravity (dành cho Claude Code)
    │
    ├── hooks/
    │   └── session-start         ← Script hook chính (chúng ta tạo)
    │
    └── skills/
        └── using-superpowers/
            └── SKILL.md          ← Nội dung skill được inject vào context
```

---

## Luồng chạy

1. User mở Antigravity, bắt đầu conversation mới
2. Model chuẩn bị được gọi → Antigravity đọc `~/.gemini/config/hooks.json`
3. Hook `superpowers-session-start` với event **`PreInvocation`** được kích hoạt
4. Antigravity gọi script `session-start` với stdin là JSON metadata
5. Script đọc file `SKILL.md`, build context message, output JSON stdout
6. Antigravity inject `ephemeralMessage` vào conversation (model thấy, user không thấy)
7. Bước 3-6 lặp lại **trước mỗi lần gọi model** → agent luôn nhớ workflow

---

## So sánh Claude Code vs Antigravity

| | Claude Code | Antigravity CLI |
|---|---|---|
| Nơi đặt hooks.json | Trong plugin dir | `~/.gemini/config/hooks.json` |
| Event hook | `SessionStart` (chạy 1 lần đầu session) | `PreInvocation` (chạy trước mỗi model call) |
| Env var plugin root | `CLAUDE_PLUGIN_ROOT` có sẵn | Không có env var → dùng `dirname $0` |
| Output format | `hookSpecificOutput.additionalContext` | `injectSteps[].ephemeralMessage` |
| Context injection | Vào system prompt | Vào conversation dạng ephemeral message |
| File cũ (Claude Code) | `.../superpowers/hooks.json` | Giữ nguyên không sao (Antigravity bỏ qua) |

---

## Troubleshooting

| Vấn đề | Cách fix |
|---|---|
| Hook không chạy | Kiểm tra `~/.gemini/config/hooks.json` tồn tại và đúng JSON syntax |
| Script không tìm thấy SKILL.md | Chạy script manual với input giả để xem lỗi |
| Permission denied | `chmod +x` script, hoặc `sudo chown phucnd:staff` nếu file bị root sở hữu |
| Không thấy context trong conversation | Kiểm tra Antigravity version có support `PreInvocation` hook không |
| `${HOME}` không expand | Thay bằng path tuyệt đối trong hooks.json |

---

*Tạo ngày: 16/06/2026*
*Dựa trên Antigravity 2.0 Hooks API (https://antigravity.google/docs/hooks)*
