# Extension Distribution Plan

## Overview
Set up automated distribution pipeline for the Vibe Log VS Code extension via:
1. **GitHub Releases** - Pre-release builds for beta testers
2. **VS Code Marketplace** - Official distribution with auto-updates

---

## Linear Task: Extension Distribution Pipeline

**Title:** Set up extension distribution via GitHub Releases and VS Code Marketplace

**Description:**
Create automated CI/CD pipeline to publish the Vibe Log extension to GitHub Releases (for beta testing) and VS Code Marketplace (for production distribution). This enables testers to easily install updates and provides a path to public release.

---

## Subtasks

### 1. Prerequisites & Setup

#### 1.1 Create Azure DevOps Publisher Account
- [ ] Create Azure DevOps organization at https://dev.azure.com
- [ ] Create publisher at https://marketplace.visualstudio.com/manage/createpublisher
- [ ] Publisher ID must match `package.json` → `"publisher": "vibelog"`
- [ ] Verify publisher email

#### 1.2 Generate Personal Access Token (PAT)
- [ ] In Azure DevOps → User Settings → Personal Access Tokens
- [ ] Create token with scopes:
  - `Marketplace` → `Manage`
  - `Marketplace` → `Publish`
- [ ] Set expiration (recommend: 1 year)
- [ ] Save token securely (only shown once)

#### 1.3 Add GitHub Secrets
- [ ] `VSCE_PAT` - Azure DevOps Personal Access Token
- [ ] `GH_TOKEN` - GitHub token with `contents: write` for releases (or use default `GITHUB_TOKEN`)

---

### 2. Package.json Preparation

#### 2.1 Verify Extension Metadata
- [ ] `name`: `vibe-log-extension` ✓
- [ ] `displayName`: `Vibe Log - Developer Analytics` ✓
- [ ] `publisher`: `vibelog` ✓
- [ ] `version`: Current `0.1.0` - update for releases
- [ ] `repository.url`: Verify correct GitHub URL
- [ ] `icon`: Ensure `resources/icon.png` exists (128x128 or 256x256)

#### 2.2 Add Marketplace Metadata
- [ ] Add `license` field (e.g., `"MIT"` or `"UNLICENSED"`)
- [ ] Add `homepage` field
- [ ] Add `bugs` field with issue tracker URL
- [ ] Add `keywords` for discoverability
- [ ] Add `galleryBanner` for marketplace styling

#### 2.3 Create/Update README for Marketplace
- [ ] Add feature screenshots
- [ ] Add installation instructions
- [ ] Add configuration guide
- [ ] Add troubleshooting section

---

### 3. GitHub Actions Workflows

#### 3.1 Create Release Workflow
Create `.github/workflows/release.yml`:
- [ ] Trigger on version tags (`v*.*.*`)
- [ ] Build production VSIX
- [ ] Create GitHub Release with VSIX attached
- [ ] Publish to VS Code Marketplace

#### 3.2 Create Pre-release Workflow
Create `.github/workflows/prerelease.yml`:
- [ ] Trigger on `develop` branch push or manual
- [ ] Build VSIX with pre-release version
- [ ] Create GitHub Pre-release
- [ ] Optional: Publish as pre-release to Marketplace

#### 3.3 Add Version Bump Script
- [ ] `npm version patch/minor/major` workflow
- [ ] Auto-generate changelog
- [ ] Create version commit and tag

---

### 4. Workflow Implementation Details

#### 4.1 Release Workflow Steps
```yaml
name: Release Extension

on:
  push:
    tags:
      - 'v*.*.*'
  workflow_dispatch:
    inputs:
      prerelease:
        description: 'Pre-release?'
        type: boolean
        default: false

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Type check
        run: npm run typecheck

      - name: Run tests
        run: npm test

      - name: Build & Package
        run: npm run package

      - name: Get version
        id: version
        run: echo "version=$(node -p "require('./package.json').version")" >> $GITHUB_OUTPUT

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: '*.vsix'
          prerelease: ${{ inputs.prerelease || false }}
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Publish to VS Code Marketplace
        if: ${{ !inputs.prerelease }}
        run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

---

### 5. Testing the Pipeline

#### 5.1 Local Verification
- [ ] Run `npm run package` locally
- [ ] Verify VSIX file is created
- [ ] Test install VSIX in fresh VS Code/Cursor instance
- [ ] Verify all features work

#### 5.2 Test Pre-release Flow
- [ ] Push to develop branch
- [ ] Verify workflow runs
- [ ] Download and test pre-release VSIX
- [ ] Verify GitHub Release is created

#### 5.3 Test Production Release Flow
- [ ] Create test tag: `git tag v0.1.0-test`
- [ ] Push tag: `git push origin v0.1.0-test`
- [ ] Verify workflow runs
- [ ] Verify Marketplace publish (use `--dry-run` first)

---

### 6. Documentation

#### 6.1 Tester Guide
- [ ] Create `docs/TESTER_GUIDE.md`
- [ ] Installation instructions
- [ ] How to get pre-release builds
- [ ] How to report issues
- [ ] Required setup (LLM provider)

#### 6.2 Release Process Documentation
- [ ] Document version numbering scheme
- [ ] Document release checklist
- [ ] Document rollback procedure

---

### 7. Marketplace Configuration

#### 7.1 Initial Publish (Manual)
- [ ] First publish must be done manually: `npx vsce publish -p <PAT>`
- [ ] Verify extension appears on Marketplace
- [ ] Check listing page looks correct

#### 7.2 Marketplace Settings
- [ ] Set extension visibility (public/private)
- [ ] Configure Q&A section
- [ ] Add support links

---

## Priority Order

1. **P0 (Must Have):**
   - 1.1, 1.2, 1.3 - Azure/GitHub setup
   - 2.1 - Package.json verification
   - 3.1 - Release workflow
   - 5.1 - Local verification

2. **P1 (Should Have):**
   - 2.2, 2.3 - Marketplace metadata
   - 3.2 - Pre-release workflow
   - 6.1 - Tester guide

3. **P2 (Nice to Have):**
   - 3.3 - Version bump automation
   - 6.2 - Release documentation
   - 7.2 - Marketplace settings

---

## Acceptance Criteria

- [ ] Testers can download VSIX from GitHub Releases
- [ ] GitHub Release auto-created on version tag
- [ ] Extension published to VS Code Marketplace
- [ ] Pre-release workflow enables beta testing
- [ ] Documentation exists for testers and maintainers
