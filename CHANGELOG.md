# Changelog

All notable changes to the DevArk VS Code Extension will be documented in this file.

## [0.1.18] - 2026-01-27

### Fixed
- Custom date range reports now include expandable "View full report" section with detailed breakdown

## [0.1.17] - 2026-01-26

### Changed
- Simplified token data by removing contextUtilization metric

## [0.1.16] - 2026-01-24

### Added
- Dashboard link in sync completion dialog for quick access to view synced sessions

## [0.1.15] - 2026-01-24

### Improved
- Session ring indicators now respond gracefully to narrow panel widths
- Rings scale down at 320px, 260px, and wrap vertically at 200px
- All responsive sizes configurable via CSS custom properties

## [0.1.14] - 2026-01-24

### Added
- Feedback button in header next to settings gear
- Star rating modal for submitting feedback
- Anonymous feedback support (no login required)
- Authenticated feedback linked to user account when logged in

## [0.1.13] - 2026-01-23

### Added
- Publish to Open VSX Registry in addition to VS Code Marketplace
- Updated README with status bar and activity rings documentation

## [0.1.12] - 2026-01-23

### Added
- Incremental sync: Only upload sessions newer than server's last synced session
- Sync preview now shows accurate count of sessions to upload
- UI shows "Sessions since [date]" when using Most Recent filter

### Improved
- Refactored sync code to consolidate duplicate implementations
- SyncService now handles all upload logic with progress and cancellation support

## [0.1.11] - 2026-01-21

### Added
- Settings: Version number now auto-updates from package.json (VIB-86)
- Session: Added prompt utilities for improved session handling

### Improved
- Session reader: Better extraction of tools from toolCalls and toolResults
- Session handler: Refactored for cleaner code organization

## [0.1.10] - 2026-01-17

### Improved
- Analytics: Track all report types (Today, Standup, Week, Month, Custom) with period property

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
