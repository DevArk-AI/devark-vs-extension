# Release Setup Guide

This guide explains how to release new versions of the DevArk VS Code extension using GitHub Actions.

## Quick Release Instructions (Using GitHub Actions)

### Step 1: Prepare Release
```bash
# 1. Update CHANGELOG.md with release notes
# Add new section at the top with format:
## [0.1.X] - 2025-01-17

### Fixed
- Brief description of fixes

### Improved
- Brief description of improvements

### Added
- Brief description of new features
```

### Step 2: Create Release Commit
```bash
# 2. Bump version in package.json (choose patch/minor/major)
npm version patch  # Bug fixes: 0.1.7 -> 0.1.8
# npm version minor  # New features: 0.1.7 -> 0.2.0
# npm version major  # Breaking changes: 0.1.7 -> 1.0.0

# 3. Commit the changes
git add .
git commit -m "chore: release v$(node -p "require('./package.json').version")"
```

### Step 3: Push and Tag
```bash
# 4. Push to main branch
git push origin main

# 5. Push the version tag (created by npm version)
git push origin --tags
```

### Step 4: GitHub Actions Takes Over
The GitHub Action will automatically:
- Build and test the extension
- Type check and verify build output
- Publish to VS Code Marketplace
- Create GitHub release

### Step 5: Verify Release
```bash
# Check GitHub releases
open https://github.com/DevArk-AI/devark-vs-extension/releases

# Check VS Code Marketplace (wait ~5 minutes for processing)
open https://marketplace.visualstudio.com/items?itemName=devark.devark-extension

# Test installation in VS Code
# Search for "DevArk" in Extensions
```

---

## Initial Setup (One-Time Only)

### Prerequisites
1. **Azure DevOps Account**: Required for VS Code Marketplace publishing
2. **GitHub Access**: Must have push access to the repository
3. **VS Marketplace Token**: Required for GitHub Actions

### Generate VS Marketplace Token
1. Go to [Azure DevOps](https://dev.azure.com)
2. Click **User Settings** (gear icon) → **Personal access tokens**
3. Click **New Token**
4. Configure:
   - Name: `VS Code Marketplace Publish`
   - Organization: **All accessible organizations**
   - Expiration: Custom (max 1 year)
   - Scopes: Click **Show all scopes** → check **Marketplace > Manage**
5. Click **Create** and copy the token

### Add Token to GitHub
1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `VS_MARKETPLACE_TOKEN`
4. Paste your Azure DevOps PAT
5. Click **Add secret**

---

## Manual Release (If GitHub Actions Fails)

Only use this if GitHub Actions is broken:

```bash
# 1. Update CHANGELOG.md
# 2. Bump version
npm version patch

# 3. Build and test
npm run typecheck
npm test
npm run build:production

# 4. Package extension
npm run package

# 5. Publish to VS Code Marketplace
npx vsce publish

# 6. Push changes
git push origin main --tags

# 7. Create GitHub release manually
gh release create v$(node -p "require('./package.json').version") \
  --title "Release v$(node -p "require('./package.json').version")" \
  --notes "See CHANGELOG.md for details"
```

---

## Troubleshooting

### GitHub Actions Not Running
- Check: Did you push the tag? `git push origin --tags`
- Check: Is the workflow enabled? Go to Actions tab
- Check: Any errors in [Actions logs](https://github.com/DevArk-AI/devark-vs-extension/actions)

### VS Marketplace Publish Failed
- **401 Error**: Token expired - generate new one
- **403 Error**: Token missing Marketplace scope
- **Version exists**: Bump version and try again

### GitHub Release Not Created
- Ensure CHANGELOG.md has entry for the version
- Tag must start with 'v' (e.g., `v0.1.8`)
- Check GitHub Actions has write permissions

### Version Mismatch
- package.json version must match git tag (without 'v')
- Example: package.json has `0.1.8`, tag is `v0.1.8`

---

## Release Checklist

Before releasing, ensure:
- [ ] CHANGELOG.md updated with release notes
- [ ] All changes committed
- [ ] Tests pass: `npm test`
- [ ] Type check passes: `npm run typecheck`
- [ ] Build works: `npm run build:production`
- [ ] You're on main branch: `git branch`
- [ ] No uncommitted changes: `git status`

---

## Security Notes

- **Never** commit tokens to the repository
- Use GitHub Secrets for all tokens
- Rotate VS Marketplace token before expiration
- Token requires **Marketplace > Manage** scope only

---

## Manual Workflow Dispatch

You can also trigger a release manually from GitHub:

1. Go to **Actions** → **Publish VS Code Extension**
2. Click **Run workflow**
3. Enter the version (e.g., `0.1.8`)
4. Click **Run workflow**

This is useful for re-publishing a failed release without creating a new tag.
