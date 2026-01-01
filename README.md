# DevArk - Developer Analytics

**Your AI coding sessions, analyzed and improved**

Ever wonder where your coding time actually goes when working with AI assistants? DevArk tracks your sessions with Cursor and Claude Code, then gives you insights that help you become a more effective AI-assisted developer.

## What You Get

**Session Tracking**
Automatically captures your AI coding sessions. No manual logging, no friction. Just code like you normally do.

**AI-Powered Summaries**
Get clear breakdowns of what you accomplished, what took longer than expected, and patterns in how you work with AI tools.

**Weekly Reports**
See your week at a glance. Which projects got attention? How did your prompting improve? Where did you get stuck?

**Real-Time Prompt Feedback**
As you write prompts, get suggestions to make them clearer and more effective. Better prompts mean better AI responses.

**Focus Tracking**
Know when you and your AI assistant stayed on task vs. went down rabbit holes. Sometimes those tangents are valuable. Sometimes they're not.

## Supported AI Tools

- Cursor
- Claude Code

## LLM Providers

Choose what works for you:

- **Ollama** - Run locally, completely free
- **OpenRouter** - Access to many models, pay per use
- **Anthropic** - Direct API access
- **Cursor CLI** - Uses your existing Cursor subscription
- **Claude Code CLI** - Uses your existing Claude Code setup

## Installation

1. Open VS Code or Cursor
2. Go to Extensions (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for "DevArk"
4. Click Install

Or install from the command line:
```
code --install-extension devark.devark
```

## Getting Started

1. **Install the extension**

2. **Open the DevArk panel**
   Click the DevArk icon in your activity bar, or use the command palette (Ctrl+Shift+P / Cmd+Shift+P) and search "DevArk"

3. **Choose your LLM provider**
   The setup wizard walks you through connecting to your preferred provider. Ollama is a good choice if you want to keep everything local.

4. **Start coding**
   That's it. DevArk runs quietly in the background while you work.

## Configuration

Open settings and search for "DevArk" to customize:

- **Provider** - Which LLM to use for analysis
- **Auto-analyze** - Analyze sessions automatically or on demand
- **Privacy mode** - Control what gets captured
- **Report frequency** - Daily, weekly, or both

### Provider Setup

**Ollama (Local/Free)**
1. Install Ollama from ollama.ai
2. Pull a model: `ollama pull llama3.2`
3. Select Ollama in DevArk settings

**OpenRouter**
1. Get an API key from openrouter.ai
2. Enter it in DevArk settings

**Anthropic**
1. Get an API key from console.anthropic.com
2. Enter it in DevArk settings

**Cursor CLI / Claude Code CLI**
These use your existing subscriptions. Just select them in settings and DevArk handles the rest.

## Privacy

Your code stays yours. DevArk processes session metadata locally by default. When using cloud providers for analysis, only high-level session information is sent, not your actual code.

You control:
- What gets tracked
- Where analysis happens
- What data leaves your machine

## Commands

Open the command palette and type "DevArk" to see all available commands:

- View current session
- Analyze session
- View summaries
- Open weekly report
- Change provider
- Sync sessions

## Tips for Getting More Out of DevArk

**Check your weekly reports**
The patterns you'll notice after a few weeks are genuinely useful. Most developers are surprised by where their time actually goes.

**Pay attention to prompt feedback**
Small improvements in how you communicate with AI tools compound quickly. A clearer prompt now saves debugging time later.

**Review sessions that felt unproductive**
These often reveal patterns. Maybe certain types of tasks need a different approach. Maybe you're asking for too much at once.

## Feedback and Support

Found a bug? Have an idea? We'd love to hear from you.

- GitHub Issues: [github.com/devark/devark-vs-extension](https://github.com/devark/devark-vs-extension)
- Email: support@devark.dev

## License

MIT

---

Built for developers who want to get better at working with AI, not just use it.
