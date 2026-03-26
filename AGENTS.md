# AGENTS.md

## Project Summary
- `prompt_type` is a small Node-based local rewrite service for prompt cleanup, with a macOS Hammerspoon client and `launchd` background service.
- The main product path is macOS-first: Hammerspoon captures text, calls `POST /v1/rewrite`, and pastes the rewritten result back into the active app.
- There are no npm dependencies. The main runtime is `server.js` plus shell scripts under [`scripts/`](/Users/reece/Desktop/prompt_type/scripts).

## Important Files / Areas
- `server.js`: entire HTTP API, prompt transformation rules, protected-span handling, marked-segment edit mode, health route.
- `clients/macos/init.lua`: hotkeys, clipboard preservation, selection fallback, request/timeout UX.
- `scripts/install-launch-agent.sh`: installs runtime files into `~/Library/Application Support/PromptRewriter` and registers `com.promptrewriter.server`.
- `scripts/start-server.sh`: launchd entrypoint; resolves `node`, loads `.env`, starts the server.
- `launchd/com.promptrewriter.server.plist`: launch agent template.
- `AI_SETUP.md`: the intended automated setup contract for agents.
- `.env.example`: authoritative env surface.

## Verification Commands
- `npm run check`
- `node server.js` for local foreground validation when changing API logic
- `curl -s http://127.0.0.1:8765/health`
- `curl -s http://127.0.0.1:8765/v1/rewrite -H 'Content-Type: application/json' -H 'Accept: application/json' -d '{"text":"please make this clearer","mode":"normal","style":"prompt-professional","targetLanguage":"en"}'`
- After changing `server.js`, `scripts/`, `launchd/`, or `.env` behavior, rerun `./scripts/install-launch-agent.sh` because the launchd runtime is copied out of the repo.

## Workflow Expectations
- Keep changes narrow; this repo is intentionally simple and mostly single-file logic.
- Treat macOS as the primary supported path unless the task explicitly targets the Windows script.
- Update docs when changing hotkeys, env vars, API shape, setup flow, or prompt syntax.
- Do not assume editing repo files updates the installed service; reinstall the launch agent when touching runtime assets.
- Preserve the current no-dependencies approach unless there is a strong reason to add tooling.

## Native Codex Review Guidelines
- Prioritize behavioral regressions in rewrite semantics over style issues.
- Check API compatibility first: `/health`, `/rewrite`, `/v1/rewrite`, JSON error shape, JSON-vs-text response behavior, and localhost binding.
- Review protected text handling carefully: `*...*` must round-trip exactly, and marked edits `%%segment%%(suggestion)` must only change marked segments.
- For macOS client changes, verify clipboard restore, timeout handling, duplicate-request blocking, and full-text fallback when no selection exists.
- Call out missing verification when a change affects launchd install flow, Hammerspoon UX, or end-to-end rewrite behavior.

## Do-Not-Break Constraints
- `server.js` must continue to bind to `127.0.0.1` and expose `GET /health` plus `POST /rewrite` and `POST /v1/rewrite`.
- The response contract should remain stable: success returns rewritten `text`; failures return JSON errors unless `FALLBACK_ECHO=true`.
- Protected spans `*...*` must survive unchanged, and marked-segment mode must reject invalid marker syntax rather than silently rewriting the whole prompt.
- `clients/macos/init.lua` must preserve the user clipboard and avoid pasting partial/empty failures.
- `scripts/install-launch-agent.sh` must keep copying runtime files into `~/Library/Application Support/PromptRewriter`; breaking that path breaks the installed app.
