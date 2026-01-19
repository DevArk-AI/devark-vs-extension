# LLM Setup Guide for Vibe Log

## Introduction

Vibe Log's Co-Pilot features are powered by Large Language Models (LLMs) that provide AI-powered insights into your coding sessions. To use these features, you need to configure an LLM provider.

### What are Ollama and OpenRouter?

**Ollama** is a free, open-source tool that runs LLMs locally on your computer. It provides complete privacy and works offline, but requires you to download and manage models yourself.

**OpenRouter** is a cloud-based API service that provides access to premium LLMs from OpenAI (GPT-4), Anthropic (Claude), Google (Gemini), and others. It requires an internet connection and API credits, but offers higher quality results with no local setup.

### Why Two Options?

We support both providers to give you flexibility based on your needs:

| Consideration | Ollama | OpenRouter |
|---------------|--------|------------|
| **Cost** | Free | Pay-per-use (starts at $0.25/M tokens) |
| **Privacy** | 100% local | Data sent to cloud providers |
| **Internet** | Works offline | Requires connection |
| **Quality** | Good (7B-13B models) | Excellent (GPT-4, Claude 3.5) |
| **Speed** | Fast (local GPU) | Fast (cloud GPUs) |
| **Setup** | Moderate (install + download models) | Easy (just API key) |
| **Storage** | 4-8GB per model | None |

### Which Should You Choose?

**Choose Ollama if you:**
- Want complete privacy (code never leaves your machine)
- Need to work offline
- Don't want to pay for API usage
- Have disk space for model files (4-8GB per model)
- Are comfortable with command-line tools

**Choose OpenRouter if you:**
- Want the highest quality AI insights
- Prefer zero local setup
- Don't mind paying small API fees (typically $0.01-0.10 per session)
- Need reliable performance across all machines
- Want access to the latest models (GPT-4, Claude 3.5)

### Available Features

Once configured, your LLM provider powers these Co-Pilot features:

1. **Session Summarization**: Get 2-3 sentence AI summaries of your coding sessions
2. **Prompt Scoring**: Evaluate how well-structured your prompts are (0-10 scale)
3. **Prompt Enhancement**: Get AI suggestions to improve your prompts

---

## Ollama Setup

### What is Ollama?

Ollama is an open-source tool that makes it easy to run large language models locally. Think of it as "Docker for LLMs" - it handles downloading, managing, and serving AI models on your computer.

### Installation

#### macOS

Using Homebrew:
```bash
brew install ollama
```

Or download the installer from [ollama.com](https://ollama.com)

#### Linux

One-line install script:
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

#### Windows

Download the installer from [ollama.com/download](https://ollama.com/download)

### Pulling Models

After installation, download a code-focused model. We recommend starting with **CodeLlama 7B** for its balance of speed and quality:

```bash
ollama pull codellama:7b
```

This will download ~4GB of model files. Other recommended models:

```bash
# DeepSeek Coder - specialized for code tasks
ollama pull deepseek-coder:6.7b

# Qwen 2.5 Coder - latest, strong performance
ollama pull qwen2.5-coder:7b

# StarCoder2 - good code understanding
ollama pull starcoder2:7b
```

### Starting the Ollama Server

Ollama runs as a background service. Start it with:

```bash
ollama serve
```

On macOS and Linux, Ollama usually starts automatically after installation. On Windows, it runs as a system service.

### Verifying Installation

Check that Ollama is running and see your installed models:

```bash
ollama list
```

You should see output like:
```
NAME                    ID              SIZE      MODIFIED
codellama:7b           8fdf8f752f6e    3.8 GB    2 minutes ago
```

### Recommended Models for Coding

| Model | Size | Speed | Quality | Best For |
|-------|------|-------|---------|----------|
| **codellama:7b** | 3.8GB | Very Fast | Good | General coding, quick summaries |
| **qwen2.5-coder:7b** | 4.7GB | Fast | Excellent | Modern codebases, detailed analysis |
| **deepseek-coder:6.7b** | 3.8GB | Fast | Very Good | Code understanding, refactoring |
| **codellama:13b** | 7.3GB | Medium | Very Good | Complex analysis (needs more RAM) |
| **starcoder2:7b** | 4.0GB | Fast | Good | Multilingual code support |

For most users, **codellama:7b** or **qwen2.5-coder:7b** provides the best balance.

---

## OpenRouter Setup

### What is OpenRouter?

OpenRouter is a unified API that provides access to dozens of LLMs from different providers (OpenAI, Anthropic, Meta, Google) through a single interface. Instead of managing API keys for each provider, you use one OpenRouter account.

### Creating an Account

1. Visit [openrouter.ai](https://openrouter.ai)
2. Click "Sign In" and create an account (supports Google, GitHub, Discord)
3. Verify your email address

### Getting Your API Key

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys)
2. Click "Create Key"
3. Give it a name (e.g., "Vibe Log Extension")
4. Copy the key - it starts with `sk-or-v1-`
5. Store it securely (you won't be able to see it again)

### Adding Credits

OpenRouter requires prepaid credits:

1. Visit [openrouter.ai/credits](https://openrouter.ai/credits)
2. Click "Add Credits"
3. Choose an amount ($5 minimum, $20 recommended to start)
4. Complete payment via Stripe

### Cost Estimation

Typical usage costs for Vibe Log features:

**Per Session Summary** (500 tokens average):
- Claude 3 Haiku: $0.0001 (100 summaries = $0.01)
- Claude 3.5 Sonnet: $0.0015 (100 summaries = $0.15)
- GPT-4 Turbo: $0.005 (100 summaries = $0.50)

**Monthly Estimates** (based on 20 sessions/day):
- Light usage (Haiku): ~$0.60/month
- Recommended (Sonnet): ~$9/month
- Premium (GPT-4): ~$30/month

$20 in credits typically lasts 2-6 months depending on your usage and model choice.

### Recommended Models

| Model | Cost (per 1M tokens) | Quality | Speed | Best For |
|-------|---------------------|---------|-------|----------|
| **Claude 3.5 Sonnet** | $3 prompt / $15 completion | Excellent | Fast | Best overall balance |
| **Claude 3 Haiku** | $0.25 / $1.25 | Good | Very Fast | Budget-conscious users |
| **GPT-4 Turbo** | $10 / $30 | Excellent | Fast | OpenAI ecosystem |
| **Gemini Pro** | $0.125 / $0.375 | Good | Very Fast | Maximum cost savings |
| **Llama 3 70B** | $0.59 / $0.79 | Very Good | Fast | Open-source preference |

For most users, **Claude 3.5 Sonnet** provides the best results at reasonable cost.

---

## VSCode Configuration

### Opening Settings

There are three ways to open VSCode settings:

1. **Keyboard shortcut**: `Ctrl+,` (Windows/Linux) or `Cmd+,` (macOS)
2. **Command Palette**: `Ctrl+Shift+P` → "Preferences: Open Settings"
3. **Menu**: File → Preferences → Settings

Once open, search for "vibelog" to see all Vibe Log settings.

### Configuring Ollama

If you've installed Ollama and pulled a model, configure it as your provider:

1. Open VSCode settings and search "vibelog.llm"
2. Set the following:

```json
{
  "vibelog.llm.provider": "ollama",
  "vibelog.llm.ollama.endpoint": "http://localhost:11434",
  "vibelog.llm.ollama.model": "codellama:7b"
}
```

**Settings explained:**
- `provider`: Set to "ollama" to use local Ollama
- `endpoint`: URL where Ollama is running (default port is 11434)
- `model`: The model you pulled earlier (must match exactly)

**Available models in dropdown:**
- `codellama:7b` - Recommended for most users
- `codellama:13b` - Higher quality, needs more RAM
- `deepseek-coder:6.7b` - Specialized for code
- `starcoder2:7b` - Good multilingual support
- `qwen2.5-coder:7b` - Latest, strong performance

### Configuring OpenRouter

If you have an OpenRouter API key and credits:

1. Open VSCode settings and search "vibelog.llm"
2. Set the following:

```json
{
  "vibelog.llm.provider": "openrouter",
  "vibelog.llm.openrouter.apiKey": "sk-or-v1-your-key-here",
  "vibelog.llm.openrouter.model": "anthropic/claude-3.5-sonnet"
}
```

**Settings explained:**
- `provider`: Set to "openrouter" to use cloud API
- `apiKey`: Paste your OpenRouter API key (starts with `sk-or-v1-`)
- `model`: The model to use (see recommendations above)

**Available models in dropdown:**
- `anthropic/claude-3.5-sonnet` - Best balance (recommended)
- `anthropic/claude-3-haiku` - Fastest and cheapest
- `openai/gpt-4-turbo` - Latest GPT-4
- `google/gemini-pro` - Budget-friendly option
- `meta-llama/llama-3-70b-instruct` - Open-source alternative

### General Settings

Fine-tune LLM behavior with these optional settings:

#### Temperature (Randomness)

Controls how creative vs. deterministic responses are:

```json
{
  "vibelog.llm.temperature": 0.3
}
```

- `0.0-0.3`: Deterministic, factual (recommended for code)
- `0.4-0.7`: Balanced, some variation
- `0.8-2.0`: Creative, varied (not recommended for coding tasks)

**Default: 0.3** (good for consistent summaries)

#### Max Tokens (Response Length)

Limits how long responses can be:

```json
{
  "vibelog.llm.maxTokens": 500
}
```

- `100-300`: Very short summaries
- `500`: Default (2-3 sentences)
- `1000+`: Longer, detailed responses

**Default: 500** (adequate for most features)

#### Timeout (Request Duration)

How long to wait for a response before giving up:

```json
{
  "vibelog.llm.timeout": 30000
}
```

Value in milliseconds:
- `10000`: 10 seconds (fast models, good connection)
- `30000`: 30 seconds (default, recommended)
- `60000`: 60 seconds (slow models or poor network)

**Default: 30000** (30 seconds)

### Testing Your Connection

After configuring either provider, test the connection:

1. Open the Vibe Log sidebar (click Vibe Log icon in Activity Bar)
2. Click "Open Co-Pilot" in the sidebar
3. Look for the status indicator at the top:
   - Green checkmark: Connected successfully
   - Red X: Connection failed (see troubleshooting below)

### Switching Providers

You can switch between Ollama and OpenRouter anytime by changing the `vibelog.llm.provider` setting. The extension will automatically use the new provider for all future requests.

---

## Using the Features

### Opening the Co-Pilot Panel

1. Click the Vibe Log icon in the Activity Bar (left sidebar)
2. Click "Open Co-Pilot" button
3. The Co-Pilot panel opens in a new editor tab

### Session Summarization

Automatically generates concise summaries of your coding sessions:

1. Open the Co-Pilot panel
2. Your recent sessions appear in the list
3. Click "Generate Summary" next to any session
4. Wait 5-10 seconds for the AI summary to appear

The summary includes:
- Main task or objective
- Key accomplishments
- Files modified
- Commands executed

### Prompt Scoring

Evaluates how well-structured your prompts are (useful for improving AI interactions):

1. Open the Co-Pilot panel
2. Navigate to the "Prompt Scorer" section
3. Paste or type a prompt
4. Click "Score Prompt"
5. Receive a score (0-10) with explanation

Scoring criteria:
- Clarity and specificity
- Context provided
- Expected output defined
- Constraints specified

### Prompt Enhancement

Get AI suggestions to improve your prompts:

1. Open the Co-Pilot panel
2. Navigate to "Prompt Enhancer"
3. Enter your original prompt
4. Click "Enhance Prompt"
5. Review the improved version with explanations

The enhancer suggests:
- More specific language
- Additional context to include
- Better structure
- Clearer expected outcomes

### Understanding Results

**Response Time:**
- Ollama (local): 2-10 seconds depending on model size
- OpenRouter (cloud): 3-8 seconds depending on model

**Quality Indicators:**
- Token usage shown after each request
- Cost displayed (OpenRouter only)
- Error messages if request fails

---

## Troubleshooting

### "No LLM provider configured"

**Problem:** Extension shows "No LLM provider configured" message

**Solution:**
1. Open VSCode settings (`Ctrl+,` or `Cmd+,`)
2. Search for "vibelog.llm.provider"
3. Select either "ollama" or "openrouter"
4. Configure the required settings for your chosen provider
5. Reload VSCode window (`Ctrl+Shift+P` → "Reload Window")

### "Ollama server not running"

**Problem:** Extension can't connect to Ollama

**Solution:**
1. **Check if Ollama is running:**
   ```bash
   ollama list
   ```
   If this fails, Ollama isn't running.

2. **Start Ollama server:**
   ```bash
   ollama serve
   ```
   Leave this terminal open while using the extension.

3. **Check endpoint URL:**
   - Default is `http://localhost:11434`
   - Verify in settings: `vibelog.llm.ollama.endpoint`
   - Try accessing it in browser: http://localhost:11434/api/version

4. **Check firewall:**
   - Ensure port 11434 isn't blocked
   - Allow Ollama in firewall settings

### "Model not found"

**Problem:** Ollama says model doesn't exist

**Solution:**
1. **List installed models:**
   ```bash
   ollama list
   ```

2. **Pull the model if missing:**
   ```bash
   ollama pull codellama:7b
   ```

3. **Update VSCode setting:**
   - Set `vibelog.llm.ollama.model` to match exactly
   - Model names are case-sensitive
   - Include the tag (e.g., `:7b`)

4. **Common model names:**
   - `codellama:7b` (not `codellama`)
   - `deepseek-coder:6.7b` (not `deepseek-coder`)
   - `qwen2.5-coder:7b` (not `qwen-coder`)

### "OpenRouter API error"

**Problem:** Can't connect to OpenRouter

**Solution:**

1. **Verify API key:**
   - Go to [openrouter.ai/keys](https://openrouter.ai/keys)
   - Ensure key is active
   - Key should start with `sk-or-v1-`
   - Copy and paste carefully (no extra spaces)

2. **Check credits:**
   - Visit [openrouter.ai/credits](https://openrouter.ai/credits)
   - Ensure you have sufficient credits
   - Add more credits if balance is low

3. **Verify internet connection:**
   - OpenRouter requires active internet
   - Test connection: `curl https://openrouter.ai/api/v1/models`

4. **Check model availability:**
   - Some models may be temporarily unavailable
   - Try a different model (e.g., Claude 3 Haiku)
   - Check [OpenRouter status](https://status.openrouter.ai)

### "Connection timeout"

**Problem:** Requests timeout before completion

**Solution:**

1. **Increase timeout setting:**
   ```json
   {
     "vibelog.llm.timeout": 60000
   }
   ```

2. **For Ollama users:**
   - Large models (13B+) are slower
   - Switch to smaller model: `codellama:7b`
   - Ensure GPU acceleration is working (if available)

3. **For OpenRouter users:**
   - Some models are slower than others
   - Try Claude 3 Haiku (fastest cloud model)
   - Check your internet speed

4. **Check network issues:**
   - VPN or proxy may slow connections
   - Firewall may be blocking requests
   - Try disabling temporarily to diagnose

### Poor Quality Results

**Problem:** AI summaries are not helpful or inaccurate

**Solution:**

1. **For Ollama users:**
   - Try a larger model: `ollama pull codellama:13b`
   - Or switch to specialized model: `qwen2.5-coder:7b`
   - Or use OpenRouter for better quality

2. **For OpenRouter users:**
   - Switch to higher-quality model
   - Try Claude 3.5 Sonnet (best balance)
   - Or GPT-4 Turbo (highest quality)

3. **Adjust temperature:**
   - Lower for more factual: `"vibelog.llm.temperature": 0.2`
   - Higher for more creative: `"vibelog.llm.temperature": 0.5`

4. **Increase max tokens:**
   - Allow longer responses: `"vibelog.llm.maxTokens": 1000`

### Performance Tips

**For Ollama Users:**
- Use 7B models for best speed (codellama:7b, qwen2.5-coder:7b)
- Close other applications to free RAM
- Use GPU acceleration if available (automatically detected)
- Consider 3B models for very low-end hardware: `llama3.2:3b`

**For OpenRouter Users:**
- Use Claude 3 Haiku for fastest responses
- Use Gemini Pro for most cost-effective
- Use Claude 3.5 Sonnet for best balance
- Monitor usage at openrouter.ai/activity

**General Tips:**
- Lower temperature (0.2-0.3) for faster responses
- Reduce max tokens (200-300) for quick summaries
- Close Co-Pilot panel when not in use to save resources

### Model Recommendations by Use Case

**Budget-Conscious:**
- Free: Ollama with `codellama:7b`
- Paid: OpenRouter with `google/gemini-pro` ($0.125/M tokens)

**Privacy-Focused:**
- Ollama with any model (100% local, offline capable)

**Best Quality:**
- OpenRouter with `anthropic/claude-3.5-sonnet`
- Or OpenRouter with `openai/gpt-4-turbo`

**Best Speed:**
- Ollama with `llama3.2:3b` (local)
- OpenRouter with `anthropic/claude-3-haiku` (cloud)

**Best Balance:**
- Ollama with `qwen2.5-coder:7b` (local)
- OpenRouter with `anthropic/claude-3.5-sonnet` (cloud)

---

## Getting Help

If you encounter issues not covered here:

1. **Check extension logs:**
   - Open Output panel: `View` → `Output`
   - Select "Vibe Log" from dropdown
   - Look for error messages

2. **Enable debug mode:**
   - Command Palette: "Vibe Log: Toggle Debug Mode"
   - Reproduce the issue
   - Check console for detailed logs

3. **Report an issue:**
   - Visit [github.com/vibelog/vibe-log-extension/issues](https://github.com/vibelog/vibe-log-extension/issues)
   - Include error messages and logs
   - Mention your provider (Ollama/OpenRouter) and model

4. **Join the community:**
   - Discord: [discord.gg/vibelog](https://discord.gg/vibelog)
   - Get help from other users
   - Share tips and configurations

---

## Next Steps

Once your LLM is configured:

1. Record some coding sessions by working in VSCode
2. Open the Co-Pilot panel to view sessions
3. Try generating a summary for a recent session
4. Experiment with prompt scoring and enhancement
5. Adjust temperature and max tokens to tune results

Enjoy AI-powered insights into your coding sessions!
