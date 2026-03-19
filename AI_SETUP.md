# AI Setup Instructions

This file is for an AI agent, not for end users.

Your job is to fully set up this repo for the user on their machine. The only thing you should ask the user for is an OpenAI API key. Do not ask for any other setup input unless installation is blocked by a real system-level permission issue.

## Goal

After setup is complete, the user should be able to:

- press `Cmd+Shift+J` for partial prompt edits
- press `Cmd+Shift+K` for initial role-first rewrites
- press `Cmd+Shift+L` for normal rewrites

The local rewrite server must be running in the background, and the Hammerspoon config must be active.

## Platform Scope

Assume the supported automated install path is macOS. Do not try to invent a Windows or Linux setup flow from this file.

## Required User Input

Ask for exactly one thing:

- `OPENAI_API_KEY`

## Setup Procedure

1. Confirm you are in the project root.
2. If `node` is missing, install Node.js before continuing.
3. If Hammerspoon is missing, install it before continuing.
4. Create `.env` from `.env.example` if `.env` does not already exist.
5. Write the provided API key into `.env` as `OPENAI_API_KEY=...`.
6. Keep the existing defaults unless the user explicitly asks to change them.
7. Run `npm run check` to validate the server file.
8. Run `./scripts/install-launch-agent.sh` to install the background rewrite service.
9. Install the macOS client by copying [clients/macos/init.lua](clients/macos/init.lua) into `~/.hammerspoon/init.lua`.
10. If `~/.hammerspoon/init.lua` already exists, merge this repo's bindings into the existing file instead of deleting unrelated user automation.
11. Reload or relaunch Hammerspoon.
12. If macOS prompts for Accessibility permission, direct the user to approve Hammerspoon and then continue.
13. Verify the service with `curl -s http://127.0.0.1:8765/health`.
14. Run a small rewrite request against `POST /v1/rewrite` to confirm end-to-end behavior.

## Verification Requirements

Setup is not complete unless all of the following are true:

- the launchd service is installed and running
- `GET /health` returns a successful JSON response
- a live rewrite request succeeds
- the Hammerspoon config includes the repo's hotkeys

## User-Facing Completion Message

When setup succeeds, report only:

- that setup is complete
- which shortcuts are available
- whether the user still needs to approve Accessibility permission
- any blocker that still requires user action

Do not ask the user to manually perform steps that you can perform yourself.
