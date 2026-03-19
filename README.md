# 📦 Prompt Rewriter

> Rewrite prompts in place on macOS with global shortcuts, protected spans, and a local OpenAI-backed rewrite server.
>
> If this project is useful, please ⭐ star the repo.

Before and after using Prompt Rewriter:

<table>
  <tr>
    <td align="center"><strong>Before</strong></td>
    <td align="center"><strong>Action</strong></td>
    <td align="center"><strong>After</strong></td>
  </tr>
  <tr>
    <td width="42%" valign="top">
      make me some app for teams and projects and stuff, like it should have login and dashboards and reports and messages and ai things maybe. i want it good and fast and secure and for small teams but also big companies and web and mobile too. tell me what tech to use and database and architecture and how to deploy it and test it and maybe give code and explain it all.
    </td>
    <td width="16%" align="center" valign="middle">
      <strong>Command + Shift + L</strong>
      <br><br>
      <span style="font-size: 32px;">→</span>
    </td>
    <td width="42%" valign="top">
      Design and propose a complete software solution for a team and project management web + mobile application. It should include: authentication (login), role-based access for small teams and larger organizations, dashboards, reports, messaging, and AI-enhanced features (as appropriate).
      <br><br>
      <strong>Provide:</strong>
      <br>
      1) A recommended technology stack for frontend, backend, mobile (or cross-platform), and any AI components.
      <br>
      2) A database choice and data model approach suitable for teams/projects, dashboards/reports, messaging, and permissions.
      <br>
      3) A scalable architecture (e.g., services/modules, key components, how data flows).
      <br>
      4) Deployment strategy (hosting, environment setup, CI/CD, secrets management, scaling).
      <br>
      5) Security considerations (auth, authorization, common threats, and best practices) with a focus on being secure and performant.
      <br>
      6) Testing plan (unit/integration/e2e/performance/security where relevant) and how to automate it.
      <br>
      7) If feasible, provide representative starter code for key parts (e.g., authentication flow, a sample API endpoint for dashboards/reports, and messaging), keeping it practical and minimal.
      <br><br>
      Explain the reasoning for your choices and outline the implementation steps required to build it quickly while maintaining security and scalability.
    </td>
  </tr>
</table>

```mermaid
flowchart LR
    A["Select text in any app"] --> B["Press Cmd+Shift+J / K / L"]
    B --> C["Local server rewrites the prompt"]
    C --> D["Updated text is pasted back in place"]
```

---

## 🚀 Overview

Prompt Rewriter removes the copy-paste loop when you want to improve prompts inside chat boxes, editors, and other text fields.

- It is built for people who work with GPT/Codex-style tools all day.
- It lets you rewrite text directly where you are typing.
- It is most useful when you need fast prompt cleanup without breaking exact terms, code, or existing structure.

This repo currently provides a first-class macOS setup using Hammerspoon and launchd. A Windows script exists, but the documented install flow here is macOS-first.

## ✨ Features

- ⚡ In-place rewriting — improve prompts directly inside the current text box instead of switching tools.
- 🔧 Three rewrite modes — use normal rewrite, role-first initial rewrite, or partial segment editing depending on the situation.
- 🛡️ Exact-span protection — keep code, product names, or required phrases unchanged with `*...*`.
- ✂️ Partial prompt editing — rewrite only marked segments with `%%...%%(...)` while preserving the rest of the prompt.
- 🔌 Local API workflow — trigger the same behavior from Hammerspoon or from `POST /v1/rewrite`.

## 🛠️ Installation

```bash
git clone https://github.com/Ymzreece/prompt_type
cd prompt_type
cp .env.example .env
```

Add your OpenAI API key to `.env`:

```bash
OPENAI_API_KEY=sk-...
```

No `npm install` step is required for the current repo because it does not have package dependencies.

## ▶️ Quick Start

> Recommended: Let Codex read `AI_SETUP.md`, provide your OpenAI API key, and it will install everything automatically for you.

If you want to install manually instead, follow the steps below.

```bash
cp .env.example .env
npm run check
./scripts/install-launch-agent.sh
mkdir -p ~/.hammerspoon
cp ./clients/macos/init.lua ~/.hammerspoon/init.lua
```

Add your OpenAI API key to `.env`, then reload Hammerspoon, approve Accessibility permission if macOS asks, and use one of these hotkeys in any supported text field:

- `Cmd+Shift+J` for partial edits
- `Cmd+Shift+K` for initial role-first rewrites
- `Cmd+Shift+L` for normal rewrites

If nothing is selected, the client automatically falls back to the entire text box.

## 📖 Usage

Simple API example:

```bash
curl -s http://127.0.0.1:8765/v1/rewrite \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"text":"please turn this into a clearer ai prompt","mode":"normal","style":"prompt-professional","targetLanguage":"en"}'
```

Expected response shape:

```json
{
  "text": "Turn this into a clearer, more effective AI prompt.",
  "mode": "normal",
  "targetLanguage": "en",
  "style": "prompt-professional"
}
```

Shortcut example for partial editing:

```text
You are a %%frond end developer%%(correct the role and wording) building a dashboard. Keep *React Query* unchanged and %%make the testing part stronger%%().
```

Press `Cmd+Shift+J` and only the marked segments are rewritten. The protected `*React Query*` span remains unchanged.

## 🧩 Use Cases

- 🧑‍💻 Developers — polish prompts in coding tools without changing exact code terms or framework names.
- 🏢 Teams — standardize prompt quality across shared workflows while keeping internal terminology intact.
- ⚙️ Automation — call the local rewrite endpoint from scripts, desktop automation, or editor integrations.

## ⚙️ Configuration

Key environment settings in [.env.example](.env.example):

- `OPENAI_API_KEY` — required
- `OPENAI_MODEL` — defaults to `gpt-5.4-nano`
- `DEFAULT_MODE` — defaults to `normal`
- `DEFAULT_TARGET_LANGUAGE` — defaults to `en`
- `REWRITE_TIMEOUT_MS` — request timeout
- `FALLBACK_ECHO` — return original text on provider failure if enabled

Prompt syntax:

- `*protected text*` keeps exact words unchanged in all modes
- `%%segment%%(suggestion)` rewrites only marked segments in `Cmd+Shift+J` mode
- `%%segment%%()` uses the default action: refine and rephrase

## 🏗️ Project Structure

```text
prompt_type/
├── clients/
│   ├── macos/
│   │   ├── init.lua
│   │   └── README.md
│   └── windows-rewriter.ahk
├── launchd/
│   └── com.promptrewriter.server.plist
├── scripts/
│   ├── install-launch-agent.sh
│   └── start-server.sh
├── .env.example
├── README.md
├── AI_SETUP.md
├── package.json
└── server.js
```

## 🧪 Testing

```bash
npm run check
curl -s http://127.0.0.1:8765/health
```

The first command validates the server file. The second confirms that the local rewrite service is running.

## 📦 Roadmap

- [ ] Add a native Swift menu bar app to replace the Hammerspoon-first prototype path
- [ ] Add a real demo GIF or short video for the README
- [ ] Improve Windows support and document it properly
- [ ] Add more provider options beyond the current OpenAI-first setup

## 🤝 Contributing

1. Fork the repo
2. Create a branch (`feature/your-feature`)
3. Commit your changes
4. Open a pull request

Good first issues should be labeled clearly.

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## ⭐ Support

If this project helped you, please ⭐ star the repo.

Issues and feature requests are welcome if you find bugs, want another platform flow, or want tighter prompt-control features.

## 🙌 Acknowledgements

- [OpenAI](https://platform.openai.com/) for the rewrite backend
- [Hammerspoon](https://www.hammerspoon.org/) for the macOS automation layer
