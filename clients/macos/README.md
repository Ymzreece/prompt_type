# Hammerspoon macOS Client

This client gives you the one-shortcut flow on macOS:
1. Select text in any app.
2. Press `Cmd+Shift+J` for marked-segment edit mode, `Cmd+Shift+K` for the initial role-first mode, or `Cmd+Shift+L` for the normal mode.
3. Hammerspoon copies the selection, calls the local rewrite API, pastes the result, and restores your clipboard.

If nothing is selected, the client automatically falls back to the full text box by trying `Cmd+A` and then applying the chosen mode to that entire field.

Across all modes, wrap any code, words, or phrases that must remain exactly unchanged in `*...*`.

## Setup

### 1. Install Hammerspoon
Install Hammerspoon and grant Accessibility permission in macOS System Settings.

### 2. Load the config
Copy [init.lua](init.lua) into your Hammerspoon config:

```bash
mkdir -p ~/.hammerspoon
cp ./clients/macos/init.lua ~/.hammerspoon/init.lua
```

### 3. Reload Hammerspoon
Open Hammerspoon and reload the config.

### 4. Start the local rewrite server
From the project root:

```bash
./scripts/install-launch-agent.sh
```

## Defaults
- Marked-segment edit mode: `Cmd+Shift+J`
- Initial complex-task mode: `Cmd+Shift+K`
- Normal mode: `Cmd+Shift+L`
- API endpoint: `http://127.0.0.1:8765/v1/rewrite`
- Target language: English
- Marked-segment mode style: `marked-segment-edit`
- Initial mode style: `role-first-initial`
- Normal mode style: `prompt-professional`

## Marked-segment syntax
- Use `%%segment%%(suggestion)` to mark only the parts you want changed.
- Leave the parentheses empty, as in `%%segment%%()`, to use the default action: refine and rephrase.
- Only marked segments are changed in this mode. Unmarked text stays unchanged.
- You can still protect exact text inside or outside marked segments with `*...*`.

## Failure behavior
- If there is no selection, the client automatically tries to capture the whole text box.
- If full-text capture also fails, the client stops and restores the clipboard.
- If the request fails or times out, the client stops and restores the clipboard.
- If a rewrite is already in flight, repeated hotkeys are ignored.
