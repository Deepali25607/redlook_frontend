// Firebase client SDK wrapper for the storefront's phone-OTP login.
//
// Why: Firebase Phone Auth lets Google send + verify the OTP for us
// (free up to 10k verifications/month). The flow looks like:
//   1. User enters phone → setupRecaptcha() + sendOtp() — Firebase
//      texts a 6-digit code from Google's number.
//   2. User enters the code → verifyOtp() — Firebase confirms it and
//      returns an ID token signed by Google.
//   3. We post that token to /auth/firebase-login (or -register /
//      -reset-password). The backend's Admin SDK verifies the
//      signature and reads the phone_number claim, no SMS roundtrip
//      on our side.
//
// All Firebase config keys are public-safe (Firebase web keys are
// gated by Authorized Domains in the console, not by secrecy). They
// still go through Vite env vars so prod/staging can differ.
//
// Activate the flow by setting:
//   VITE_AUTH_PROVIDER=firebase
// in .env. When unset (or set to anything else), this module's
// firebaseAuthEnabled stays false and the legacy MSG91 flow runs.

import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Toggle. Storefront pages read this to branch between the new
// Firebase-driven flow and the legacy MSG91 flow. Defaults to false
// so a missing env var (e.g. on a fresh checkout) doesn't break
// existing customers who still expect the MSG91 verify-otp roundtrip.
export const firebaseAuthEnabled = import.meta.env.VITE_AUTH_PROVIDER === 'firebase';

// Lazy-initialise the app. Importing this module does not init
// Firebase unless firebaseAuthEnabled is true — we don't want to
// download Firebase's JS bundle on storefront pages that don't use it.
let app = null;
let auth = null;

function ensureApp() {
  if (!firebaseAuthEnabled) {
    throw new Error('Firebase auth is disabled (VITE_AUTH_PROVIDER is not "firebase").');
  }
  if (!firebaseConfig.apiKey) {
    throw new Error('VITE_FIREBASE_API_KEY is missing — check your frontend .env.');
  }
  if (!app) {
    app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Use the user's selected language for the SMS message body so
    // a Hindi-language customer doesn't suddenly see English text.
    auth.useDeviceLanguage();
  }
  return { app, auth };
}

// Invisible reCAPTCHA verifier. Firebase requires this on web as an
// anti-abuse gate before it'll send a real SMS. Invisible means no
// challenge UI 99% of the time; Firebase only shows a puzzle when it
// suspects automation.
//
// `buttonId` is the DOM id of the BUTTON the user clicks to request
// the OTP — Firebase ties the verifier to that element so a single
// reCAPTCHA token only authorises one OTP send. Caller is responsible
// for ensuring the element exists before invoking this.
let activeVerifier = null;
export function setupRecaptcha(buttonId) {
  const { auth } = ensureApp();
  // Tear down any leftover verifier from a previous attempt; reusing
  // a stale one across attempts is the most common "auth/internal-error"
  // cause we've seen in Firebase community reports.
  if (activeVerifier) {
    try { activeVerifier.clear(); } catch { /* ignore */ }
    activeVerifier = null;
  }
  activeVerifier = new RecaptchaVerifier(auth, buttonId, {
    size: 'invisible',
    // Called when the invisible challenge resolves. We don't need to
    // do anything explicit here — sendOtp's signInWithPhoneNumber
    // will resolve its own promise on success.
    callback: () => {},
  });
  return activeVerifier;
}

// Send a verification SMS. `phone` MUST be in E.164 (e.g. "+919876543210").
// Returns a ConfirmationResult — pass it to verifyOtp() with the code
// the user types in.
//
// Throws on:
//   - auth/invalid-phone-number → frontend should re-validate input
//   - auth/quota-exceeded       → Firebase free quota hit; surface a
//                                 "please try again later" message
//   - auth/captcha-check-failed → reCAPTCHA token rejected; usually
//                                 means the user is in an unsupported
//                                 region or behind a strict VPN
export async function sendOtp(phoneE164) {
  const { auth } = ensureApp();
  if (!activeVerifier) {
    throw new Error('Internal: setupRecaptcha() must be called before sendOtp().');
  }
  return signInWithPhoneNumber(auth, phoneE164, activeVerifier);
}

// Confirm the 6-digit code and return the Firebase ID token. The
// token is what the backend's Admin SDK actually verifies; nothing
// the frontend says about the phone number is trusted.
export async function verifyOtpAndGetToken(confirmationResult, code) {
  if (!confirmationResult || typeof confirmationResult.confirm !== 'function') {
    const e = new Error('Your verification session expired. Please request a new code.');
    e.code = 'auth/session-expired';
    throw e;
  }
  const userCredential = await confirmationResult.confirm(code);
  if (!userCredential || !userCredential.user) {
    const e = new Error('Verification did not return a signed-in user. Please request a new code.');
    e.code = 'auth/no-user-credential';
    throw e;
  }
  return userCredential.user.getIdToken(/* forceRefresh */ true);
}

// Normalise a 10-digit Indian mobile (the format used everywhere in
// our UI and DB) to E.164 for Firebase. Returns null when the input
// isn't a valid Indian mobile.
export function toE164(tenDigitOrE164) {
  const raw = String(tenDigitOrE164 || '').trim();
  if (/^\+91[6-9]\d{9}$/.test(raw)) return raw;
  if (/^[6-9]\d{9}$/.test(raw)) return `+91${raw}`;
  return null;
}
