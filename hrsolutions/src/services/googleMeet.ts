import { initializeApp, getApps, getApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Google Meet Scopes
export const MEET_SCOPES = [
  'https://www.googleapis.com/auth/meetings.space.created',
  'https://www.googleapis.com/auth/meetings.space.readonly',
  'https://www.googleapis.com/auth/meetings.space.settings',
];

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
MEET_SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let redirectHandled = false;

async function consumeRedirectResult(): Promise<{ user: User; accessToken: string } | null> {
  if (redirectHandled) return null;
  redirectHandled = true;
  try {
    const result = await getRedirectResult(auth);
    if (!result) return null;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) return null;
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google OAuth redirect result error:', error);
    return null;
  }
}

void consumeRedirectResult();

/**
 * Initialize Google Auth listener
 */
export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
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
 * Trigger Sign in with Google with Google Meet scopes
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const redirected = await consumeRedirectResult();
    if (redirected) return redirected;

    if (Capacitor.isNativePlatform()) {
      await signInWithRedirect(auth, provider);
      return null;
    }

    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google access token');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => cachedAccessToken;

export const googleSignOut = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export interface MeetSpace {
  name: string; // e.g. "spaces/ABC-DEF-GHI"
  meetingUri: string; // e.g. "https://meet.google.com/abc-defg-hij"
  meetingCode?: string; // e.g. "abc-defg-hij"
  config?: {
    accessType?: 'OPEN' | 'TRUSTED' | 'RESTRICTED' | string;
    entryPointAccess?: 'ALL' | 'CREATOR_APP_ONLY' | string;
  };
  activeConference?: {
    conferenceRecord?: string;
  };
}

/**
 * Call Google Meet API v2 to create a new Meeting Space
 */
export const createMeetSpace = async (
  accessToken: string,
  config?: { accessType?: 'OPEN' | 'TRUSTED' | 'RESTRICTED' }
): Promise<MeetSpace> => {
  const response = await fetch('https://meet.googleapis.com/v2/spaces', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      config: config || { accessType: 'OPEN' },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to create Google Meet space (${response.status})`);
  }

  const data: MeetSpace = await response.json();
  return data;
};

/**
 * Fetch details of an existing Google Meet Space
 */
export const getMeetSpace = async (
  accessToken: string,
  spaceName: string
): Promise<MeetSpace> => {
  // spaceName can be "spaces/xyz" or just "xyz"
  const formattedName = spaceName.startsWith('spaces/') ? spaceName : `spaces/${spaceName}`;
  const response = await fetch(`https://meet.googleapis.com/v2/${formattedName}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to fetch Google Meet space (${response.status})`);
  }

  return await response.json();
};

/**
 * Update settings of a Google Meet Space (e.g., OPEN, TRUSTED, RESTRICTED access)
 */
export const updateMeetSpaceSettings = async (
  accessToken: string,
  spaceName: string,
  accessType: 'OPEN' | 'TRUSTED' | 'RESTRICTED'
): Promise<MeetSpace> => {
  const formattedName = spaceName.startsWith('spaces/') ? spaceName : `spaces/${spaceName}`;
  const response = await fetch(`https://meet.googleapis.com/v2/${formattedName}?updateMask=config`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      config: {
        accessType,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to update Google Meet space settings (${response.status})`);
  }

  return await response.json();
};
