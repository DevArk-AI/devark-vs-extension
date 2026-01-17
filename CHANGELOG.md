# Changelog

All notable changes to the DevArk VS Code Extension will be documented in this file.

## [0.1.9] - 2026-01-17

### Added
- Analytics: Track user interactions with prompt feedback buttons (Use this prompt, Copy, Try another)
- Analytics: Track goal modal interactions (Set Goal, Maybe Later, Don't ask again)
- Analytics: Track LLM selector menu opens from footer and settings

### Improved
- Analytics: Respect VS Code's global telemetry setting (telemetry.telemetryLevel)
- README: Clearer "How It Works" and "Getting Started" sections

## [0.1.8] - 2026-01-17

### Fixed
- Security: Removed token logging from production code that could expose partial auth tokens
- Security: Added restrictive file permissions (0600) to encryption key and config files

### Improved
- Updated esbuild dependency to v0.25.0 to address security vulnerability

## [0.1.7] - 2025-01-15

### Added
- Initial public release
- Claude Code and Cursor IDE integration
- Session analytics and prompt scoring
- Local LLM support via Ollama
- Cloud sync to DevArk platform
