# Antigravity CLI: Setup Guide for 'ask-matt' Plugin

This guide explains how to install and configure the `ask-matt` plugin on another machine running the Antigravity CLI (`agy`). The plugin registers Matt Pocock's skills natively and injects the `ask-matt` meta-skill into every prompt invocation.

---

## Option 1: Automated Installation (Recommended)

You can use the following automated Bash script to set up everything automatically. 

### Installation Script (`setup-ask-matt.sh`)

Save the script below as `setup-ask-matt.sh` and run it:

```bash
#!/usr/bin/env bash
set -euo pipefail

# 1. Define paths
CONFIG_DIR="${HOME}/.gemini/config"
PLUGIN_DIR="${CONFIG_DIR}/plugins/ask-matt"
TEMP_DIR="/tmp/temp_matt_skills"

echo "=== Setting up ask-matt plugin ==="

# 2. Clone repository to temp folder
echo "Cloning mattpocock/skills..."
rm -rf "$TEMP_DIR"
git clone --depth 1 https://github.com/mattpocock/skills.git "$TEMP_DIR"

# 3. Create plugin directory structure
echo "Creating plugin structure at ${PLUGIN_DIR}..."
mkdir -p "${PLUGIN_DIR}/hooks"
cp -r "${TEMP_DIR}/skills" "${PLUGIN_DIR}/"

# 4. Flatten the skills directory (required for Antigravity discovery)
echo "Flattening nested skills..."
for dir in "${PLUGIN_DIR}/skills"/*/*; do
  if [ -d "$dir" ]; then
    mv "$dir" "${PLUGIN_DIR}/skills/"
  fi
done

# 5. Clean up category folders and temp directories
echo "Cleaning up directories..."
rm -f "${PLUGIN_DIR}/skills"/*/README.md
rmdir "${PLUGIN_DIR}/skills"/engineering 2>/dev/null || true
rmdir "${PLUGIN_DIR}/skills"/productivity 2>/dev/null || true
rmdir "${PLUGIN_DIR}/skills"/misc 2>/dev/null || true
rmdir "${PLUGIN_DIR}/skills"/deprecated 2>/dev/null || true
rmdir "${PLUGIN_DIR}/skills"/personal 2>/dev/null || true
rmdir "${PLUGIN_DIR}/skills"/in-progress 2>/dev/null || true
rm -rf "$TEMP_DIR"

# 6. Create plugin.json
echo "Writing plugin.json..."
cat << 'EOF' > "${PLUGIN_DIR}/plugin.json"
{
  "name": "ask-matt",
  "description": "Skills for Real Engineers — cloned and adapted for PreInvocation hook.",
  "skills": "./skills",
  "hooks": "./hooks"
}
EOF

# 7. Create hook script
echo "Writing pre-invocation.sh..."
cat << 'EOF' > "${PLUGIN_DIR}/hooks/pre-invocation.sh"
#!/usr/bin/env bash
set -euo pipefail

# Self-resolve plugin root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read ask-matt meta-skill content
SKILL_FILE="${PLUGIN_ROOT}/skills/ask-matt/SKILL.md"
if [ -f "$SKILL_FILE" ]; then
  using_skills_content=$(cat "$SKILL_FILE")
else
  using_skills_content="Error: ask-matt skill not found at ${SKILL_FILE}"
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

using_skills_escaped=$(escape_for_json "$using_skills_content")

# Build context message
session_context="<EXTREMELY_IMPORTANT>\nYou are using the ask-matt plugin.\n\n**Below is the full content of your 'ask-matt' meta-skill to determine what to do in this response:**\n\n${using_skills_escaped}\n</EXTREMELY_IMPORTANT>"

# Output in PreInvocation format
printf '{\n  "injectSteps": [\n    {\n      "ephemeralMessage": "%s"\n    }\n  ]\n}\n' "$session_context"
EOF

chmod +x "${PLUGIN_DIR}/hooks/pre-invocation.sh"

# 8. Register hook in ~/.gemini/config/hooks.json
echo "Registering hook in hooks.json..."
HOOKS_FILE="${CONFIG_DIR}/hooks.json"
if [ ! -f "$HOOKS_FILE" ]; then
  echo '{}' > "$HOOKS_FILE"
fi

# Register the hook in a disabled state by default using python3 (safe and cross-platform)
hook_cmd="bash \"\${HOME}/.gemini/config/plugins/ask-matt/hooks/pre-invocation.sh\""
python3 -c '
import json, sys
hooks_file = sys.argv[1]
hook_cmd = sys.argv[2]
try:
    with open(hooks_file, "r") as f:
        data = json.load(f)
except Exception:
    data = {}
data["ask-matt-pre-invocation"] = {
    "PreInvocation-disabled": [
        {"type": "command", "command": hook_cmd, "timeout": 15}
    ]
}
with open(hooks_file, "w") as f:
    json.dump(data, f, indent=2)
' "$HOOKS_FILE" "$hook_cmd"

echo "=== Setup complete! ==="
echo "The hook is registered in a disabled state ('PreInvocation-disabled') in hooks.json."
echo "To enable it, edit hooks.json and rename it to 'PreInvocation'."
```

---

## Option 2: Manual Installation Steps

If you prefer to set up the plugin manually, follow these steps:

### Step 1: Clone the Repository
Clone the `mattpocock/skills` repository to a temporary location:
```bash
git clone --depth 1 https://github.com/mattpocock/skills.git /tmp/temp_matt_skills
```

### Step 2: Create the Plugin Folder Structure
Create the target directories and copy the cloned skills folder:
```bash
mkdir -p ~/.gemini/config/plugins/ask-matt/hooks
cp -r /tmp/temp_matt_skills/skills ~/.gemini/config/plugins/ask-matt/
```

### Step 3: Flatten the Skills Subdirectories
Antigravity automatically discovers skills only **one level deep** under the `skills` directory (e.g. `skills/ask-matt/SKILL.md`). Move the nested folders to the root level of the plugin's `skills` folder:
```bash
for dir in ~/.gemini/config/plugins/ask-matt/skills/*/*; do
  if [ -d "$dir" ]; then
    mv "$dir" ~/.gemini/config/plugins/ask-matt/skills/
  fi
done
```
Clean up category folders:
```bash
rm -f ~/.gemini/config/plugins/ask-matt/skills/*/README.md
rmdir ~/.gemini/config/plugins/ask-matt/skills/{engineering,productivity,misc,deprecated,personal,in-progress}
rm -rf /tmp/temp_matt_skills
```

### Step 4: Write `plugin.json`
Save the following JSON into `~/.gemini/config/plugins/ask-matt/plugin.json`:
```json
{
  "name": "ask-matt",
  "description": "Skills for Real Engineers — cloned and adapted for PreInvocation hook.",
  "skills": "./skills",
  "hooks": "./hooks"
}
```

### Step 5: Write the Hook Script (`pre-invocation.sh`)
Create `~/.gemini/config/plugins/ask-matt/hooks/pre-invocation.sh` with the following content:
```bash
#!/usr/bin/env bash
set -euo pipefail

# Self-resolve plugin root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Read ask-matt meta-skill content
SKILL_FILE="${PLUGIN_ROOT}/skills/ask-matt/SKILL.md"
if [ -f "$SKILL_FILE" ]; then
  using_skills_content=$(cat "$SKILL_FILE")
else
  using_skills_content="Error: ask-matt skill not found at ${SKILL_FILE}"
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

using_skills_escaped=$(escape_for_json "$using_skills_content")

# Build context message
session_context="<EXTREMELY_IMPORTANT>\nYou are using the ask-matt plugin.\n\n**Below is the full content of your 'ask-matt' meta-skill to determine what to do in this response:**\n\n${using_skills_escaped}\n</EXTREMELY_IMPORTANT>"

# Output in PreInvocation format
printf '{\n  "injectSteps": [\n    {\n      "ephemeralMessage": "%s"\n    }\n  ]\n}\n' "$session_context"
```
Make the script executable:
```bash
chmod +x ~/.gemini/config/plugins/ask-matt/hooks/pre-invocation.sh
```

### Step 6: Register the Hook in `hooks.json`
Edit your global configuration file `~/.gemini/config/hooks.json` to register the new hook:
```json
{
  "ask-matt-pre-invocation": {
    "PreInvocation-disabled": [
      {
        "type": "command",
        "command": "bash \"${HOME}/.gemini/config/plugins/ask-matt/hooks/pre-invocation.sh\"",
        "timeout": 15
      }
    ]
  }
}
```

Change `"PreInvocation-disabled"` to `"PreInvocation"` when you want to enable the hook.
