# Changelog

All notable changes to the DevArk VS Code Extension will be documented in this file.

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
