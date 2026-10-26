import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import firebaseConfig from '../../firebase-applet-config.json';

// Google Drive, Meet, Sheets & Gmail Scopes
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/meetings.space.settings',
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.labels',
];

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;

function tokenFromResult(result: Awaited<ReturnType<typeof signInWithPopup>>) {
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Failed to obtain Google access token');
  }
  cachedAccessToken = credential.accessToken;
  return { user: result.user, accessToken: cachedAccessToken };
}

/**
 * Complete a pending Workspace redirect sign-in (Capacitor / native WebView).
 */
export const completeGoogleWorkspaceRedirectSignIn = async (): Promise<{
  user: User;
  accessToken: string;
} | null> => {
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    isSigningIn = true;
    return tokenFromResult(result);
  } catch (error) {
    console.error('Google Workspace Redirect Sign In Error:', error);
    return null;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Initialize Google Auth listener and complete any pending redirect sign-in.
 */
export const initGoogleWorkspaceAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  void completeGoogleWorkspaceRedirectSignIn().then((redirect) => {
    if (redirect && onAuthSuccess) {
      onAuthSuccess(redirect.user, redirect.accessToken);
    }
  });

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Trigger Sign in with Google for Drive, Sheets, and Meet scopes
 */
export const googleWorkspaceSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    if (Capacitor.isNativePlatform()) {
      await signInWithRedirect(auth, provider);
      return null;
    }
    const result = await signInWithPopup(auth, provider);
    return tokenFromResult(result);
  } catch (error) {
    console.error('Google Workspace Sign In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getWorkspaceAccessToken = (): string | null => cachedAccessToken;

export const googleWorkspaceSignOut = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string;
  iconLink?: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  owners?: Array<{ displayName: string; emailAddress: string }>;
  shared?: boolean;
}

/**
 * List files from Google Drive v3 API
 */
export const listDriveFiles = async (
  accessToken: string,
  query: string = "trashed = false",
  pageSize: number = 25
): Promise<DriveFile[]> => {
  const url = `https://www.googleapis.com/drive/v3/files?pageSize=${pageSize}&fields=files(id,name,mimeType,webViewLink,iconLink,createdTime,modifiedTime,size,owners,shared)&q=${encodeURIComponent(query)}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to list Drive files (${response.status})`);
  }

  const data = await response.json();
  return data.files || [];
};

/**
 * Get file metadata or content from Google Drive
 */
export const getDriveFileContent = async (
  accessToken: string,
  fileId: string
): Promise<string> => {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    // If it's a Google Doc, export it as plain text
    const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    const exportResponse = await fetch(exportUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (exportResponse.ok) {
      return await exportResponse.text();
    }
    throw new Error(`Unable to fetch content for file ${fileId}`);
  }

  return await response.text();
};

/**
 * Create a new file in Google Drive
 */
export const createDriveFile = async (
  accessToken: string,
  fileName: string,
  mimeType: string = 'text/plain',
  content: string = ''
): Promise<DriveFile> => {
  const metadata = {
    name: fileName,
    mimeType,
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: mimeType }));

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,createdTime', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create file in Google Drive (${response.status})`);
  }

  return await response.json();
};

/**
 * Search specifically for Google Meet transcripts or recordings in Drive
 */
export const searchMeetTranscriptsInDrive = async (
  accessToken: string
): Promise<DriveFile[]> => {
  // Query files that contain "Meet", "Transcript", "Recording", or have meet mimeType
  const query = "trashed = false and (name contains 'Meet' or name contains 'Transcript' or name contains 'Recording' or name contains 'Call Notes')";
  return await listDriveFiles(accessToken, query, 30);
};
