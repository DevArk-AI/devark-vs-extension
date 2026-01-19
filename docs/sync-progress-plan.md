# Sync Progress Visual Feedback

## Summary
Add visual feedback during session sync showing session count, upload phases, and progress with the heartbeat animation. Users can minimize the modal and see progress in a status bar at the bottom of the extension.

## Requirements
- Show detailed phases: Preparing... Sanitizing... Uploading batch 1/3... Done!
- Keep modal open during upload, allow user to minimize
- Show status bar at bottom of extension with progress
- Allow cancel of in-progress upload
- Use existing heartbeat animation

## Current State Analysis

### Existing Infrastructure
1. **Progress callback exists but not wired**: `UploadProgressCallback` in `vibe-log-api-client.ts` (line 108) fires per batch but isn't passed from UI
2. **Heartbeat animation ready**: `LoadingOverlay.tsx` component with pulsing logo and progress bar
3. **Modal already exists**: Sync filter modal in `AccountView.tsx` (lines 295-519)
4. **API uploads in batches**: 100 sessions per batch with `onProgress(uploadedCount, total)` callback

### Missing Pieces
- No `uploadProgress` message type in protocol
- No way to pass progress callback from CloudAuthHandler to API client
- Modal closes immediately on confirm (line 78)
- No status bar component for minimized progress
- No cancel mechanism

## Implementation Plan

### Step 1: Add Protocol Messages
**File**: `src/shared/webview-protocol.ts`

Add new message types:
```typescript
// Extension → Webview
| { type: 'syncProgress'; data: SyncProgressData }
| { type: 'syncComplete'; data: SyncCompleteData }
| { type: 'syncCancelled' }

// Webview → Extension
| { type: 'cancelSync' }
| { type: 'minimizeSync' }
```

Add data types:
```typescript
interface SyncProgressData {
  phase: 'preparing' | 'sanitizing' | 'uploading' | 'complete' | 'cancelled' | 'error';
  message: string;
  current: number;
  total: number;
  currentBatch?: number;
  totalBatches?: number;
  sizeKB?: number;
}

interface SyncCompleteData {
  success: boolean;
  sessionsUploaded: number;
  error?: string;
}
```

### Step 2: Update CloudAuthHandler
**File**: `src/panels/handlers/cloud-auth-handler.ts`

Modify `handleSyncWithFilters()`:
1. Add cancellation token support
2. Send progress messages at each phase
3. Handle `cancelSync` message
4. Pass `onProgress` callback to API client

Key changes:
- Add `private syncAbortController: AbortController | null = null`
- Add `handleCancelSync()` method
- Refactor upload to send progress at phases:
  - `preparing`: Before fetching sessions
  - `sanitizing`: During sanitization
  - `uploading`: Per batch with current/total
  - `complete`/`error`: Final status

### Step 3: Create SyncProgressModal Component
**File**: `webview/menu/components/v2/SyncProgressModal.tsx` (new file)

Component shows:
1. Heartbeat logo (reuse from LoadingOverlay)
2. Phase message (e.g., "Sanitizing 50 sessions...")
3. Progress bar with percentage
4. Session count: "15 of 50 sessions"
5. Batch info when uploading: "Batch 2 of 3"
6. Minimize button (collapses to status bar)
7. Cancel button

### Step 4: Create SyncStatusBar Component
**File**: `webview/menu/components/v2/SyncStatusBar.tsx` (new file)

Fixed bar at bottom of extension showing:
- Mini progress indicator (small spinner or progress ring)
- Phase text: "Uploading 15/50..."
- Expand button to restore modal
- Cancel button (X)

### Step 5: Update AccountView
**File**: `webview/menu/components/v2/AccountView.tsx`

Changes:
1. Add state: `isSyncing`, `syncProgress`, `isMinimized`
2. Replace immediate modal close with sync state management
3. Listen for `syncProgress`, `syncComplete`, `syncCancelled` messages
4. Render SyncProgressModal or SyncStatusBar based on state
5. Handle minimize/restore between modal and status bar

### Step 6: Add CSS Styles
**File**: `webview/menu/styles/redesign.css`

Add styles for:
- `.vl-sync-progress-modal` - Modal container
- `.vl-sync-status-bar` - Bottom status bar
- `.vl-minimize-btn` - Minimize button
- Reuse existing `.vl-heartbeat-logo`, `.vl-progress-bar` styles

## Files to Modify
1. `src/shared/webview-protocol.ts` - Add message types
2. `src/panels/handlers/cloud-auth-handler.ts` - Add progress reporting + cancel
3. `webview/menu/components/v2/AccountView.tsx` - Integrate progress UI
4. `webview/menu/components/v2/SyncProgressModal.tsx` - New component
5. `webview/menu/components/v2/SyncStatusBar.tsx` - New component
6. `webview/menu/styles/redesign.css` - Add new styles

## Data Flow
```
User clicks "Sync X sessions" in modal
    ↓
AccountView sends: syncWithFilters
AccountView sets: isSyncing=true, shows SyncProgressModal
    ↓
CloudAuthHandler.handleSyncWithFilters():
    1. Send: syncProgress { phase: 'preparing', current: 0, total: N }
    2. Fetch sessions
    3. Send: syncProgress { phase: 'sanitizing', current: 0, total: N }
    4. Sanitize sessions
    5. For each batch:
       Send: syncProgress { phase: 'uploading', current: X, total: N, batch: B/T }
    6. Send: syncComplete { success: true, sessionsUploaded: N }
    ↓
AccountView receives messages, updates UI
    ↓
User can minimize → SyncStatusBar shows at bottom
User can cancel → sends cancelSync → CloudAuthHandler aborts
```

## Success Criteria
- [x] User sees session count before sync starts
- [x] Progress shows distinct phases with messages
- [x] Heartbeat animation plays during upload
- [x] Progress bar fills as batches complete
- [x] User can minimize modal and see status bar
- [x] User can expand status bar back to modal
- [x] Cancel stops upload, shows partial success count
- [x] Completion shows success message with count

## Implementation Complete

All features implemented on 2025-12-23:

### Files Modified
1. `src/shared/webview-protocol.ts` - Added `SyncProgressData`, `SyncCompleteData` types and message definitions
2. `src/panels/handlers/cloud-auth-handler.ts` - Added progress reporting, cancellation support, batch uploading with progress
3. `webview/menu/components/v2/SyncProgressModal.tsx` - New component for full progress display
4. `webview/menu/components/v2/SyncStatusBar.tsx` - New component for minimized progress
5. `webview/menu/components/v2/AccountView.tsx` - Integrated progress UI, message handling
6. `webview/menu/styles/redesign.css` - Added styles for sync progress modal and status bar
