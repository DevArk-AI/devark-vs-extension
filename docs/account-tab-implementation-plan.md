# ACCOUNT Tab Implementation Plan

## Overview
Add a third tab "ACCOUNT" to the VS Code extension webview to manage dashboard connection, session uploads, and user profile - following the design from `docs/redesign.md` Option 1.

## Current State Analysis

### What Already Exists ✅
1. **Tab System**: 2 tabs (CO-PILOT, SUMMARIES) with clean state management
2. **Auth State**: Full CloudState management (isConnected, username, autoSyncEnabled)
3. **Auth Methods**: Login (`handleLoginWithGithub`), logout (`handleLogout`), status check
4. **Session Reading**: Full Cursor session reader (`session-reader.ts`)
5. **Session Upload**: Complete upload functionality via CLI wrapper (`SessionWrapper.ts`)
6. **Dashboard URL**: Config method to get dashboard URL (`ConfigWrapper.getDashboardUrl()`)
7. **Message Protocol**: Bidirectional webview ↔ extension communication

### What's Missing/Broken ❌
1. **No ACCOUNT tab**: Auth/profile scattered across different views
2. **Upload not exposed**: Upload functionality exists but not in V2 UI
3. **"Open Dashboard" broken**: Button doesn't actually open URL (just changes view state)
4. **No upload history**: Can't see what's been synced
5. **No sync status**: Can't see local vs cloud session counts

## Design Specification (ASCII)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ┌────────┐                                                        │
│  │VIBE-LOG│                                             [Settings] │
│  └────────┘                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   [CO-PILOT]    [SUMMARIES]    [ACCOUNT]                          │
│                                ─────────                           │
│                                                                     │
│  VIBE-LOG DASHBOARD                                                │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Status: Connected as @devuser              [Open Dashboard] │   │
│  │  Last sync: 2 minutes ago                          [Logout]  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  QUICK ACTIONS                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  [Upload current session]                                   │   │
│  │  Upload your current Cursor session to the dashboard        │   │
│  │                                                              │   │
│  │  [Upload recent sessions]                                   │   │
│  │  Choose from your last 10 local sessions to upload          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  SYNC STATUS                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Local sessions:  47        Synced to cloud:  42            │   │
│  │  Pending upload:   5                                        │   │
│  │                                                              │   │
│  │  [Sync now]  [View unsync'd sessions]                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ACCOUNT DETAILS                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Email: dev@example.com                                     │   │
│  │  Plan: Free                                  [Upgrade Pro]  │   │
│  │  Member since: Jan 2024                                     │   │
│  │                                                              │   │
│  │  [Email preferences]  [Privacy settings]                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  LLM: [Cursor CLI ▲]                                  [Connected]  │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation Plan

### Step 1: Update Type Definitions
**File**: `webview/menu/state/types-v2.ts`

**Changes**:
1. Add `'account'` to `TabType` union type:
   ```typescript
   export type TabType = 'copilot' | 'summaries' | 'account';
   ```

2. Add upload-related state to `AppStateV2`:
   ```typescript
   export interface AppStateV2 {
     // ... existing fields
     uploadHistory?: UploadHistoryItem[];
     syncStatus?: SyncStatus;
   }
   ```

3. Add new interfaces:
   ```typescript
   export interface UploadHistoryItem {
     timestamp: Date;
     sessionCount: number;
     status: 'success' | 'failed';
   }

   export interface SyncStatus {
     localSessions: number;
     syncedSessions: number;
     pendingUploads: number;
     lastSynced?: Date;
   }
   ```

4. Add reducer action types:
   ```typescript
   | { type: 'SET_UPLOAD_HISTORY'; payload: UploadHistoryItem[] }
   | { type: 'SET_SYNC_STATUS'; payload: SyncStatus }
   | { type: 'UPLOAD_PROGRESS'; payload: { current: number; total: number } }
   ```

### Step 2: Create AccountView Component
**File**: `webview/menu/components/v2/AccountView.tsx` (NEW FILE)

**Structure**:
```typescript
export function AccountView() {
  const { state, dispatch, postMessage } = useAppContext();

  return (
    <div className="vl-account-view">
      {/* Dashboard Section */}
      <section className="vl-dashboard-section">
        {state.cloud.isConnected ? (
          // Connected state with username, Open Dashboard, Logout
        ) : (
          // Not connected state with Login buttons
        )}
      </section>

      {/* Quick Actions Section */}
      <section className="vl-quick-actions">
        <button onClick={() => postMessage('uploadCurrentSession')}>
          Upload current session
        </button>
        <button onClick={() => postMessage('uploadRecentSessions')}>
          Upload recent sessions
        </button>
      </section>

      {/* Sync Status Section */}
      <section className="vl-sync-status">
        <div className="stats">
          Local: {state.syncStatus?.localSessions || 0}
          Synced: {state.syncStatus?.syncedSessions || 0}
          Pending: {state.syncStatus?.pendingUploads || 0}
        </div>
        <button onClick={() => postMessage('syncNow')}>Sync now</button>
      </section>

      {/* Account Details Section */}
      <section className="vl-account-details">
        {/* Display email, plan, member since */}
      </section>
    </div>
  );
}
```

### Step 3: Update AppV2 Navigation and Routing
**File**: `webview/menu/AppV2.tsx`

**Changes**:
1. Add ACCOUNT tab button to navigation (around line 430):
   ```typescript
   <nav className="vl-tabs">
     <button className={`vl-tab ${state.currentTab === 'copilot' ? 'active' : ''}`}
       onClick={() => dispatch({ type: 'SET_TAB', payload: 'copilot' })}>
       Co-Pilot
     </button>
     <button className={`vl-tab ${state.currentTab === 'summaries' ? 'active' : ''}`}
       onClick={() => dispatch({ type: 'SET_TAB', payload: 'summaries' })}>
       Summaries
     </button>
     <button className={`vl-tab ${state.currentTab === 'account' ? 'active' : ''}`}
       onClick={() => dispatch({ type: 'SET_TAB', payload: 'account' })}>
       Account
     </button>
   </nav>
   ```

2. Update content rendering (around line 401):
   ```typescript
   function renderTabContent() {
     switch (state.currentTab) {
       case 'copilot':
         return <CoPilotView />;
       case 'summaries':
         return <SummariesView />;
       case 'account':
         return <AccountView />;
       default:
         return <CoPilotView />;
     }
   }
   ```

3. Add message handlers for new events (in useEffect around line 272):
   ```typescript
   case 'uploadHistory':
     dispatch({ type: 'SET_UPLOAD_HISTORY', payload: message.data });
     break;

   case 'syncStatus':
     dispatch({ type: 'SET_SYNC_STATUS', payload: message.data });
     break;

   case 'uploadProgress':
     dispatch({ type: 'UPLOAD_PROGRESS', payload: message.data });
     break;
   ```

### Step 4: Add Message Handlers in Extension
**File**: `src/panels/V2MessageHandler.ts`

**New Message Handlers**:

1. **handleOpenDashboard** (NEW):
   ```typescript
   private async handleOpenDashboard(): Promise<void> {
     try {
       const cli = ExtensionState.getCLIWrapper();
       const dashboardUrl = await cli.config.getDashboardUrl();
       await vscode.env.openExternal(vscode.Uri.parse(dashboardUrl));
     } catch (error) {
       vscode.window.showErrorMessage('Failed to open dashboard');
     }
   }
   ```

2. **handleUploadCurrentSession** (NEW):
   ```typescript
   private async handleUploadCurrentSession(): Promise<void> {
     try {
       const cli = ExtensionState.getCLIWrapper();
       const sessionReader = ExtensionState.getSessionReader();

       // Get current active session
       const activeSessions = sessionReader.getActiveSessions();
       if (activeSessions.length === 0) {
         vscode.window.showInformationMessage('No active session found');
         return;
       }

       // Upload with progress
       await cli.sessions.uploadClaudeSessions(
         { selectedSessions: [activeSessions[0].sessionId] },
         (progress) => {
           this.sendMessage('uploadProgress', progress);
         }
       );

       vscode.window.showInformationMessage('Session uploaded successfully');
       await this.handleGetSyncStatus(); // Refresh status
     } catch (error) {
       vscode.window.showErrorMessage('Failed to upload session');
     }
   }
   ```

3. **handleUploadRecentSessions** (NEW):
   ```typescript
   private async handleUploadRecentSessions(): Promise<void> {
     // Show quick pick of recent sessions
     // User selects which to upload
     // Call uploadClaudeSessions with selected IDs
   }
   ```

4. **handleGetSyncStatus** (NEW):
   ```typescript
   private async handleGetSyncStatus(): Promise<void> {
     try {
       const sessionReader = ExtensionState.getSessionReader();
       const allSessions = sessionReader.getActiveSessions();

       // TODO: Query dashboard API for synced count
       // For now, return local count

       this.sendMessage('syncStatus', {
         localSessions: allSessions.length,
         syncedSessions: 0, // TODO: Get from API
         pendingUploads: 0, // TODO: Calculate
         lastSynced: undefined,
       });
     } catch (error) {
       console.error('Failed to get sync status:', error);
     }
   }
   ```

5. **Update message routing** (around line 170):
   ```typescript
   case 'openDashboard':
     await this.handleOpenDashboard();
     break;

   case 'uploadCurrentSession':
     await this.handleUploadCurrentSession();
     break;

   case 'uploadRecentSessions':
     await this.handleUploadRecentSessions();
     break;

   case 'getSyncStatus':
     await this.handleGetSyncStatus();
     break;
   ```

### Step 5: Fix "Open Dashboard" Bug in CoPilotView
**File**: `webview/menu/components/v2/CoPilotView.tsx`

**Change** (around line 78):
```typescript
// BEFORE:
<button onClick={() => dispatch({
  type: 'SET_VIEW',
  payload: state.cloud.isConnected ? 'main' : 'cloud-connect'
})}>

// AFTER:
<button onClick={() => {
  if (state.cloud.isConnected) {
    postMessage('openDashboard');
  } else {
    dispatch({ type: 'SET_VIEW', payload: 'cloud-connect' });
  }
}}>
```

### Step 6: Add Styles
**File**: `webview/menu/styles/redesign.css`

**Add styles**:
```css
/* Account Tab Styles */
.vl-account-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px;
}

.vl-dashboard-section,
.vl-quick-actions,
.vl-sync-status,
.vl-account-details {
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 8px;
  padding: 16px;
}

.vl-quick-actions button {
  display: block;
  width: 100%;
  margin-bottom: 12px;
  padding: 12px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.vl-sync-status .stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 12px;
}
```

## Implementation Order

1. ✅ **Types** - Update `types-v2.ts` (foundation)
2. ✅ **Component** - Create `AccountView.tsx` (UI)
3. ✅ **Routing** - Update `AppV2.tsx` (navigation + tab rendering)
4. ✅ **Handlers** - Add message handlers in `V2MessageHandler.ts` (backend)
5. ✅ **Bugfix** - Fix Open Dashboard in `CoPilotView.tsx`
6. ✅ **Styles** - Add CSS in `redesign.css` (polish)

## Testing Checklist

- [ ] ACCOUNT tab appears in navigation
- [ ] Tab switches correctly between CO-PILOT, SUMMARIES, ACCOUNT
- [ ] "Open Dashboard" button actually opens URL in browser
- [ ] Login/Logout buttons work from ACCOUNT tab
- [ ] Upload current session triggers CLI upload
- [ ] Upload shows progress notification
- [ ] Sync status displays correct counts
- [ ] All buttons styled correctly and match design
- [ ] No console errors

## Future Enhancements (Not in This Phase)

- Upload history display (requires storing upload records)
- View unsynced sessions modal
- Email preferences page
- Plan upgrade flow
- Member since date (requires API endpoint)
- Proper synced session count (requires dashboard API)

## Key Files Reference

### Current Implementation Files
- `webview/menu/AppV2.tsx` - Main app with tab state management
- `webview/menu/components/v2/CoPilotView.tsx` - Co-Pilot tab
- `webview/menu/components/v2/SummariesView.tsx` - Summaries tab
- `webview/menu/state/types-v2.ts` - Type definitions
- `src/panels/V2MessageHandler.ts` - Message routing and handlers
- `src/cursor-integration/session-reader.ts` - Reads Cursor sessions
- `src/cli-wrapper/SessionWrapper.ts` - Upload functionality
- `src/cli-wrapper/ConfigWrapper.ts` - Config methods (dashboard URL)

### Files to Create
- `webview/menu/components/v2/AccountView.tsx` - NEW ACCOUNT tab component
