# DSH — plugin đang cài & cách dựng lại

Snapshot: **2026-11-25** · **DSH Desktop 0.2.2.0** (channel `nightly`) · profile **`desktop`**
Máy nguồn: Windows · `%USERPROFILE%\.dsh\profiles\desktop`

> Cài vào DSH cùng dòng 0.2.2.x. Plugin khai `engines.dsh`; lệch version có thể bị từ chối cài.

## 1. Plugin index (nhanh nhất)

File [`dsh-plugins-index.json`](dsh-plugins-index.json) — index format 1, 15 plugin, **liệt kê toàn bộ 969 version đã publish** (kèm `engines.dsh` của từng bản). DSH tự chọn bản cao nhất mà máy đó chạy được → luôn cài bản mới nhất, vẫn còn bản cũ làm fallback. Plugin git pin commit HEAD hiện tại. Đã validate bằng `parseMarketIndex` thật của DSH, không phải kiểm tay.

Đẩy file lên repo `phucnd0604/setup-agent-guide` (nhánh `main`), URL để dán:

```text
https://raw.githubusercontent.com/phucnd0604/setup-agent-guide/main/dsh-plugins-index.json
```

Máy mới:

1. **Plugins → Experimental plugins → bật "Custom plugin indexes"** (mặc định tắt).
2. Tab **Discover** → **Add index source** → dán URL trên.
3. Mỗi card đề xuất bản mới nhất tương thích → **Install**; vào trang plugin chọn **Versions** nếu muốn hạ bản.

Repo public nhưng chưa bật Pages: `raw.githubusercontent.com` trả 2xx trực tiếp nên dùng được. Nếu thích content-type `application/json` thì bật Pages (thêm `index.json` vào `gh-pages`) hoặc dùng `https://cdn.jsdelivr.net/gh/phucnd0604/setup-agent-guide@main/dsh-plugins-index.json`.

### Cập nhật index

```powershell
node build-dsh-plugin-index.mjs            # đọc profile đang cài, kéo version mới từ npm/GitHub
node build-dsh-plugin-index.mjs --profile web --out other-index.json
```

Script đọc `dependencies` của profile, nên cài thêm plugin là lần generate sau tự có. File index là JSON tĩnh: "mới nhất" = mới nhất tại lần chạy — thêm plugin/upgrade xong thì chạy lại rồi đẩy file lên repo.

## 2. Cài lại bằng CLI

`dsh plugin --profile desktop add <spec>` → forward sang pnpm trong thư mục profile và **append** package vào `dsh.profile.bundles`. Vì vậy **chạy đúng thứ tự** dưới đây: thứ tự này chính là load order của các bundle (patch của bundle sau đè bundle trước).

```powershell
$plugins = @(
  'dshmarket@1.84.1',
  'dsh-better-sidebar@0.33.0',
  '@michengai/dsh-skills-manager@1.5.5',
  '@wenaixi/dsh-ponytail@5.6.6',
  'github:phucnd0604/dsh-pua-en#d3f5116a44433088dd7144f13f7bcc9aa990824a',
  'github:phucnd0604/dsh-delegate#289bd0343b776ed99eaa393254c9dc76348eaeca',
  '@wenaixi/dsh-superpower@8.1.2',
  'dsh-context@0.87.1',
  'github:phucnd0604/dsh-mcp-connector#986140a8ac4d084380d0fbd92c69cc44e701d0ec',
  '@opencode2dsh/dsh-plugin@0.3.14',
  'dsh-brand-studio@0.0.4',
  'dsh-claude-style@0.22.2',
  'dsh-mnemon@0.5.55',
  'dsh-vision-router@3.4.0'
)
foreach ($p in $plugins) { dsh plugin --profile desktop add $p }
```

Không có CLI thì dán từng spec vào GUI: **Plugins → Install** (nhận package name, URL GitHub, hoặc đường dẫn local).

## 3. Danh sách

| # | Package | Spec để cài | Bản đang chạy | Nguồn |
|---|---------|--------------|---------------|-------|
| 1 | `dshmarket` | `dshmarket@1.84.1` | 1.84.1 | npm |
| 2 | `dsh-better-sidebar` | `dsh-better-sidebar@0.33.0` | 0.33.0 | npm |
| 3 | `@michengai/dsh-skills-manager` | `@michengai/dsh-skills-manager@1.5.5` | 1.5.5 | npm |
| 4 | `@wenaixi/dsh-ponytail` | `@wenaixi/dsh-ponytail@5.6.6` | 5.6.6 | npm |
| 5 | `@phucnd0604/dsh-pua-en` | `github:phucnd0604/dsh-pua-en#d3f5116` | 0.2.1 | git |
| 6 | `dsh-delegate` | `github:phucnd0604/dsh-delegate#289bd03` | 0.1.0 | git |
| 7 | `@wenaixi/dsh-superpower` | `@wenaixi/dsh-superpower@8.1.2` | 8.1.2 | npm |
| 8 | `dsh-context` | `dsh-context@0.87.1` | 0.87.1 | npm |
| 9 | `dsh-mcp-connector` | `github:phucnd0604/dsh-mcp-connector#986140a` | 0.2.70 | git |
| 10 | `@opencode2dsh/dsh-plugin` | `@opencode2dsh/dsh-plugin@0.3.14` | 0.3.14 | npm |
| 11 | `dsh-brand-studio` | `dsh-brand-studio@0.0.4` | 0.0.4 | npm |
| 12 | `dsh-claude-style` | `dsh-claude-style@0.22.2` | 0.22.2 | npm |
| 13 | `dsh-mnemon` | `dsh-mnemon@0.5.55` | 0.5.55 | npm |
| 14 | `dsh-vision-router` | `dsh-vision-router@3.4.0` | 3.4.0 | npm |
| — | `dsh-genui` | `dsh-genui@0.3.4` | 0.3.4 | npm — **đã cài nhưng không enable** |

`dsh-genui` nằm trong `dependencies` nhưng không có trong `dsh.profile.bundles` nên không load. Chỉ thêm khi thực sự dùng: `dsh plugin --profile desktop add dsh-genui@0.3.4`.

## 4. Bundle do DSH cung cấp — phải bật tay

Hai cái này ship kèm DSH, không nằm trong `dependencies`:

- `@deepseek-ai/dsh-experimental-auto-review`
- `@deepseek-ai/dsh-experimental-plugin-market-bundle` (Discover tab + `plugin_market` tool)

Bật ở **Plugins → Experimental plugins**. Vị trí của chúng trong bundles là giữa `dsh-claude-style` và `dsh-mnemon`.

## 5. Trạng thái `dsh.profile.bundles` để đối chiếu

```json
[
  "@deepseek-ai/dsh-base",
  "@deepseek-ai/dsh-web-app",
  "dshmarket",
  "dsh-better-sidebar",
  "@michengai/dsh-skills-manager",
  "@wenaixi/dsh-ponytail",
  "@phucnd0604/dsh-pua-en",
  "dsh-delegate",
  "@wenaixi/dsh-superpower",
  "dsh-context",
  "dsh-mcp-connector",
  "@opencode2dsh/dsh-plugin",
  "dsh-brand-studio",
  "dsh-claude-style",
  "@deepseek-ai/dsh-experimental-auto-review",
  "@deepseek-ai/dsh-experimental-plugin-market-bundle",
  "dsh-mnemon",
  "dsh-vision-router"
]
```

## 6. Không phải plugin, nhưng thiếu là khác ngay

| Thứ | Nằm ở | Ghi chú |
|---|---|---|
| `cordis.patch.yml` | `%USERPROFILE%\.dsh\profiles\desktop\` | ~40 KB: model providers, UI prefs, tool policy, toggles, MCP connector. Copy nguyên file. Không chứa key, chỉ tên env (`OPENCODE_GO_API_KEY`). |
| `AGENTS.md` | `%USERPROFILE%\.dsh\` | rule toàn cục |
| `skills\` (49 thư mục) | `%USERPROFILE%\.dsh\` | skill tự viết + cài qua skills-manager |
| `memory`, `pet.json`, `dsh-auto-memory.json` | `%USERPROFILE%\.dsh\` | tuỳ chọn |

## 7. Kiểm tra sau khi cài

```powershell
dsh --profile desktop --dump-config   # so số layer với máy cũ
```

Mở DSH → Plugins: phải thấy đủ 14 plugin ở tab Installed, không plugin nào báo lỗi compatibility.

## 8. Quản lý index — thêm / sửa / xoá

### Phía DSH (index source)

| Việc | Cách làm |
|---|---|
| Thêm source | **Discover → Add index source** → dán URL file index. Hợp lệ khi: `http(s)`, không có user/password, không có `#`, trả 2xx **và không redirect**, ≤ 128 MiB. Dán trùng URL đang có thì bị từ chối và giữ nguyên đoạn text vừa nhập. |
| Đổi index đang xem | Menu index ở đầu toolbar trái — mỗi source một dòng, dòng cuối là **Manage index sources…**. |
| Xoá source | Menu index → **Manage index sources…** → nút remove ở dòng tương ứng. Source chỉ thuộc profile hiện tại, xoá không ảnh hưởng file trên GitHub. |
| Sửa URL | Không sửa tại chỗ: xoá rồi **Add index source** lại. Lỗi đọc lần cuối (kèm JSON path nếu sai format) hiện ngay dưới dòng đó trong dialog. |
| Đọc lại | Nút refresh trên toolbar, hoặc mở lại tab Discover. Host cũng tự đọc lại khi index đổi (`plugin-market/changed`) hoặc khi restart. |

### Phía repo (danh sách plugin)

Danh sách nằm ở [`dsh-plugins.json`](dsh-plugins.json) — mỗi dòng `"<package>": "<spec>"`. Đây là **nguồn duy nhất**: index được sinh ra từ file này, và workflow hằng ngày cũng chỉ đọc nó, nên sửa file là đủ, không phụ thuộc máy nào.

| Việc | Cách làm |
|---|---|
| **Thêm** plugin | Thêm một dòng `"<tên-package>": "<spec>"` → `node build-dsh-plugin-index.mjs` → commit. Hoặc cài plugin như bình thường rồi chạy `node build-dsh-plugin-index.mjs --refresh-manifest` để lấy lại toàn bộ danh sách từ máy. |
| **Xoá** plugin khỏi danh sách | Xoá dòng của nó → chạy script → commit. **Không cần uninstall**: plugin vẫn còn trên máy nhưng biến khỏi setup/khỏi index của mọi máy khác. Muốn gỡ luôn khỏi máy: `dsh plugin --profile desktop remove <pkg>`. |
| **Sửa** | Đổi tên hoặc spec. npm: giá trị version **không** ảnh hưởng (index liệt kê mọi bản đã publish). Git: `github:owner/repo` = commit HEAD, `github:owner/repo#<sha40>` = ghim đúng commit. |
| Đổi tên index hiển thị | Sửa hằng `title` trong `build-dsh-plugin-index.mjs` rồi chạy lại (sửa thẳng JSON cũng bị ghi đè). |
| Mô tả / tác giả / homepage | Lấy tự động từ `package.json` của plugin (npm registry hoặc repo) — đừng sửa tay trong index, lần sau bị ghi đè. |
| Sửa version / thêm bản cũ | Không cần: mọi version đã publish đều có trong index; ghim bản cụ thể thì chọn ở trang **Versions** của plugin trong Discover. |

Sau khi sửa, máy khác thấy thay đổi ở lần Discover kế tiếp (hoặc bấm refresh). Nếu vừa sửa tay mà không muốn chờ cron: `gh workflow run "Refresh plugin index"`.

> Index là nội dung bên thứ ba: DSH kiểm format nhưng không kiểm title/icon/source. Chỉ add source bạn tin, và xem source trong hộp thoại xác nhận trước khi Install.