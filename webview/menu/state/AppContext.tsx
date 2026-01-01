/**
 * App Context - Global State Management
 *
 * Provides global state and actions for the Menu panel using React Context API
 */

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AppState, Action, Section } from './types';
import { onAnyMessage, getTheme } from '../utils/vscode';

// Initial state
const initialState: AppState = {
  auth: {
    isAuthenticated: false,
    user: null,
    loading: false,
    error: null,
  },
  status: {
    streak: null,
    points: 0,
    level: 1,
    recentSessions: [],
    loading: false,
    error: null,
  },
  upload: {
    inProgress: false,
    progress: 0,
    message: '',
    result: null,
    error: null,
  },
  hooks: {
    claude: {
      sessionStart: { installed: false },
      preCompact: { installed: false },
    },
    cursor: {
      afterAgentResponse: { installed: false },
    },
    loading: false,
    error: null,
  },
  reports: {
    generating: false,
    progress: 0,
    message: '',
    result: null,
    error: null,
  },
  currentSection: 'status',
  theme: getTheme(),
};

// Reducer function
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SECTION':
      return { ...state, currentSection: action.payload };

    case 'SET_THEME':
      return { ...state, theme: action.payload };

    // Auth actions
    case 'AUTH_START':
      return {
        ...state,
        auth: { ...state.auth, loading: true, error: null },
      };

    case 'AUTH_SUCCESS':
      return {
        ...state,
        auth: {
          isAuthenticated: true,
          user: action.payload,
          loading: false,
          error: null,
        },
      };

    case 'AUTH_ERROR':
      return {
        ...state,
        auth: {
          ...state.auth,
          loading: false,
          error: action.payload,
        },
      };

    case 'AUTH_LOGOUT':
      return {
        ...state,
        auth: {
          isAuthenticated: false,
          user: null,
          loading: false,
          error: null,
        },
      };

    // Status actions
    case 'STATUS_LOADING':
      return {
        ...state,
        status: { ...state.status, loading: true, error: null },
      };

    case 'STATUS_SUCCESS':
      return {
        ...state,
        status: {
          ...state.status,
          ...action.payload,
          loading: false,
          error: null,
        },
      };

    case 'STATUS_ERROR':
      return {
        ...state,
        status: {
          ...state.status,
          loading: false,
          error: action.payload,
        },
      };

    // Upload actions
    case 'UPLOAD_START':
      return {
        ...state,
        upload: {
          inProgress: true,
          progress: 0,
          message: action.payload,
          result: null,
          error: null,
        },
      };

    case 'UPLOAD_PROGRESS':
      return {
        ...state,
        upload: {
          ...state.upload,
          progress: action.payload.progress,
          message: action.payload.message,
        },
      };

    case 'UPLOAD_SUCCESS':
      return {
        ...state,
        upload: {
          inProgress: false,
          progress: 100,
          message: 'Upload complete!',
          result: action.payload,
          error: null,
        },
      };

    case 'UPLOAD_ERROR':
      return {
        ...state,
        upload: {
          ...state.upload,
          inProgress: false,
          error: action.payload,
        },
      };

    case 'UPLOAD_RESET':
      return {
        ...state,
        upload: initialState.upload,
      };

    // Hooks actions
    case 'HOOKS_LOADING':
      return {
        ...state,
        hooks: { ...state.hooks, loading: true, error: null },
      };

    case 'HOOKS_SUCCESS':
      return {
        ...state,
        hooks: {
          ...state.hooks,
          ...action.payload,
          loading: false,
          error: null,
        },
      };

    case 'HOOKS_ERROR':
      return {
        ...state,
        hooks: {
          ...state.hooks,
          loading: false,
          error: action.payload,
        },
      };

    // Report actions
    case 'REPORT_START':
      return {
        ...state,
        reports: {
          generating: true,
          progress: 0,
          message: action.payload,
          result: null,
          error: null,
        },
      };

    case 'REPORT_PROGRESS':
      return {
        ...state,
        reports: {
          ...state.reports,
          progress: action.payload.progress,
          message: action.payload.message,
        },
      };

    case 'REPORT_SUCCESS':
      return {
        ...state,
        reports: {
          generating: false,
          progress: 100,
          message: 'Report generated!',
          result: action.payload,
          error: null,
        },
      };

    case 'REPORT_ERROR':
      return {
        ...state,
        reports: {
          ...state.reports,
          generating: false,
          error: action.payload,
        },
      };

    case 'REPORT_RESET':
      return {
        ...state,
        reports: initialState.reports,
      };

    default:
      return state;
  }
}

// Context type
interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  setSection: (section: Section) => void;
}

// Create context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Provider component
interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Helper function to set section
  const setSection = (section: Section) => {
    dispatch({ type: 'SET_SECTION', payload: section });
  };

  // Listen for messages from extension
  useEffect(() => {
    const cleanup = onAnyMessage((message) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { type, data } = message as { type: string; data?: any };
      console.log('[AppContext] Received message:', type, data);

      // Handle different message types
      switch (type) {
        case 'authSuccess':
        case 'authenticationComplete':
          dispatch({ type: 'AUTH_SUCCESS', payload: data });
          break;

        case 'authError':
          dispatch({ type: 'AUTH_ERROR', payload: data.error });
          break;

        case 'logoutComplete':
          dispatch({ type: 'AUTH_LOGOUT' });
          break;

        case 'statusUpdate':
          dispatch({ type: 'STATUS_SUCCESS', payload: data });
          break;

        case 'uploadProgress':
          dispatch({
            type: 'UPLOAD_PROGRESS',
            payload: { progress: data.progress, message: data.message },
          });
          break;

        case 'uploadSuccess':
          dispatch({ type: 'UPLOAD_SUCCESS', payload: data });
          break;

        case 'uploadError':
          dispatch({ type: 'UPLOAD_ERROR', payload: data.error });
          break;

        case 'hooksStatus':
          dispatch({ type: 'HOOKS_SUCCESS', payload: data });
          break;

        case 'reportStart':
          dispatch({ type: 'REPORT_START', payload: data || 'Generating report...' });
          break;

        case 'reportProgress':
          dispatch({
            type: 'REPORT_PROGRESS',
            payload: { progress: data.progress, message: data.message },
          });
          break;

        case 'reportSuccess':
          dispatch({ type: 'REPORT_SUCCESS', payload: data });
          break;

        case 'reportError':
          dispatch({ type: 'REPORT_ERROR', payload: data.error || data });
          break;

        case 'reportReset':
          dispatch({ type: 'REPORT_RESET' });
          break;

        case 'themeChanged':
          dispatch({ type: 'SET_THEME', payload: data.theme });
          break;
      }
    });

    return cleanup;
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, setSection }}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook to use the context
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
