/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  Auth
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  Firestore
} from 'firebase/firestore';
import fileFirebaseConfig from '../../firebase-applet-config.json';
import { AttendanceRecord, CollageSettings } from '../types/attendance.ts';
import { extractDriveImageId } from '../utils/collageLogic.ts';
import { ensureBrowserCompatibleImageBlob } from '../utils/heicConverter.ts';

export interface FirebaseConfigData {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  measurementId?: string;
}

const CUSTOM_FIREBASE_CONFIG_KEY = 'autoabsen_firebase_config_v3';
const TOKEN_STORAGE_KEY = 'gdrive_workspace_access_token_v3';
const RESET_MIGRATION_KEY = 'autoabsen_clean_user_v4';
const OLD_PROJECT_ID = 'gen-lang-client-0616791793';

const LEGACY_KEYS_TO_CLEAR = [
  'gdrive_workspace_access_token',
  'gdrive_workspace_access_token_v3',
  'autoabsen_attendees_v2',
  'autoabsen_settings_v2'
];

// Bersihkan otomatis sisa token & sesi dari project Firebase lama (gen-lang-client-0616791793)
if (typeof window !== 'undefined' && !localStorage.getItem(RESET_MIGRATION_KEY)) {
  LEGACY_KEYS_TO_CLEAR.forEach((key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  });
  localStorage.setItem(RESET_MIGRATION_KEY, 'true');
}

export function getActiveFirebaseConfig(): FirebaseConfigData | null {
  // 1. Cek konfigurasi yang disimpan lewat UI (localStorage)
  if (typeof window !== 'undefined') {
    const raw = localStorage.getItem(CUSTOM_FIREBASE_CONFIG_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as FirebaseConfigData;
        if (
          parsed &&
          parsed.apiKey &&
          parsed.projectId &&
          parsed.projectId !== OLD_PROJECT_ID
        ) {
          return parsed;
        }
      } catch {
        // ignore
      }
    }
  }

  // 2. Cek file firebase-applet-config.json
  if (
    fileFirebaseConfig &&
    fileFirebaseConfig.apiKey &&
    fileFirebaseConfig.projectId &&
    fileFirebaseConfig.projectId !== OLD_PROJECT_ID
  ) {
    return fileFirebaseConfig as FirebaseConfigData;
  }

  return null;
}

export function isFirebaseConfigured(): boolean {
  return getActiveFirebaseConfig() !== null;
}

/**
 * Mem-parsing teks firebaseConfig yang ditempel dari Firebase Console
 * (mendukung format JS `const firebaseConfig = { ... }` maupun JSON)
 */
export function parseFirebaseConfigInput(input: string): FirebaseConfigData {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Konfigurasi tidak boleh kosong.');
  }

  const extractField = (key: string): string => {
    const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`);
    const match = trimmed.match(regex);
    return match ? match[1].trim() : '';
  };

  const apiKey = extractField('apiKey');
  const authDomain = extractField('authDomain');
  const projectId = extractField('projectId');
  const storageBucket = extractField('storageBucket');
  const messagingSenderId = extractField('messagingSenderId');
  const appId = extractField('appId');
  const measurementId = extractField('measurementId');

  if (!apiKey || !projectId) {
    throw new Error(
      'Format tidak dikenali. Pastikan terdapat apiKey dan projectId dari Firebase Console.'
    );
  }

  if (projectId === OLD_PROJECT_ID) {
    throw new Error(
      'Ini adalah Project ID lama (gen-lang-client-0616791793). Gunakan Project Firebase dari akun Google baru Anda.'
    );
  }

  return {
    apiKey,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: storageBucket || `${projectId}.firebasestorage.app`,
    messagingSenderId,
    appId,
    measurementId
  };
}

let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export let auth: Auth | null = null;

function initFirebaseInstance() {
  const cfg = getActiveFirebaseConfig();
  if (!cfg) {
    app = null;
    db = null;
    auth = null;
    return;
  }
  try {
    const existing = getApps();
    if (existing.length > 0) {
      app = existing[0];
    } else {
      app = initializeApp(cfg);
    }
    db = getFirestore(app);
    auth = getAuth(app);
  } catch (err) {
    console.warn('Gagal inisialisasi Firebase:', err);
    app = null;
    db = null;
    auth = null;
  }
}

initFirebaseInstance();

export async function saveCustomFirebaseConfig(rawInput: string): Promise<FirebaseConfigData> {
  const parsed = parseFirebaseConfigInput(rawInput);
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_FIREBASE_CONFIG_KEY, JSON.stringify(parsed));
  }
  // Re-initialize Firebase app with new config
  const existing = getApps();
  for (const a of existing) {
    await deleteApp(a).catch(() => {});
  }
  app = initializeApp(parsed);
  db = getFirestore(app);
  auth = getAuth(app);
  return parsed;
}

export async function clearCustomFirebaseConfig(): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CUSTOM_FIREBASE_CONFIG_KEY);
  }
  setStoredAccessToken(null);
  const existing = getApps();
  for (const a of existing) {
    await deleteApp(a).catch(() => {});
  }
  initFirebaseInstance();
}

// Google Workspace OAuth Scopes
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly'
];

function createGoogleProvider(includeWorkspaceScopes = true): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  if (includeWorkspaceScopes) {
    WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
  }
  provider.setCustomParameters({
    prompt: 'select_account'
  });
  return provider;
}

let cachedAccessToken: string | null = typeof window !== 'undefined'
  ? (sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY))
  : null;

export const setStoredAccessToken = (token: string | null) => {
  cachedAccessToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      window.dispatchEvent(new CustomEvent('gdrive_token_updated', { detail: { token } }));
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent('gdrive_token_updated', { detail: { token: null } }));
    }
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    if (onAuthFailure) onAuthFailure();
    return () => {};
  }
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = await getAccessToken();
      if (onAuthSuccess) {
        onAuthSuccess(user, token || '');
      }
    } else {
      setStoredAccessToken(null);
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (
  includeWorkspaceScopes = true
): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) {
    throw new Error(
      'Project Firebase belum diatur. Klik tombol "Atur Firebase Baru" untuk memasukkan konfigurasi Firebase dari akun Google baru Anda.'
    );
  }
  try {
    const provider = createGoogleProvider(includeWorkspaceScopes);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const accessToken = credential?.accessToken || '';
    if (accessToken) {
      setStoredAccessToken(accessToken);
    }
    return { user: result.user, accessToken };
  } catch (error: any) {
    console.error('Google Sign In Error:', error);
    throw error;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored) {
      cachedAccessToken = stored;
      return stored;
    }
  }
  return null;
};

export const logout = async () => {
  if (auth) {
    await signOut(auth).catch(() => {});
  }
  setStoredAccessToken(null);
};

export const switchGoogleAccount = async (
  includeWorkspaceScopes = true
): Promise<{ user: User; accessToken: string } | null> => {
  await logout();
  return googleSignIn(includeWorkspaceScopes);
};

/* =========================================================================
   FIRESTORE ATTENDANCE PERSISTENCE
   ========================================================================= */

const ATTENDANCE_COLL = 'attendance';
const SETTINGS_COLL = 'settings';

export async function saveAttendanceToFirestore(record: AttendanceRecord): Promise<void> {
  if (!db || !auth?.currentUser?.uid) return;
  const currentUid = auth.currentUser.uid;
  try {
    const docRef = doc(db, ATTENDANCE_COLL, record.id);
    await setDoc(docRef, {
      nip: record.nip,
      name: record.name,
      session: record.session,
      date: record.date,
      photoUrl: record.photoUrl,
      status: record.status,
      department: record.department || '',
      timestamp: record.timestamp,
      ownerUid: currentUid
    });
  } catch (err) {
    console.error('Gagal menyimpan ke Firestore:', err);
  }
}

export async function loadAttendanceFromFirestore(): Promise<AttendanceRecord[]> {
  if (!db || !auth?.currentUser?.uid) return [];
  const currentUid = auth.currentUser.uid;
  try {
    const snap = await getDocs(collection(db, ATTENDANCE_COLL));
    const list: AttendanceRecord[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.ownerUid !== currentUid) return;
      list.push({
        id: d.id,
        nip: data.nip,
        name: data.name,
        session: data.session,
        date: data.date,
        photoUrl: data.photoUrl,
        status: data.status,
        department: data.department,
        timestamp: data.timestamp
      });
    });
    return list;
  } catch (err) {
    console.warn('Gagal memuat dari Firestore (menggunakan data lokal/cache):', err);
    return [];
  }
}

export function subscribeAttendance(callback: (records: AttendanceRecord[]) => void) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, ATTENDANCE_COLL),
    (snap) => {
      const currentUid = auth?.currentUser?.uid;
      if (!currentUid) return;
      const list: AttendanceRecord[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.ownerUid !== currentUid) return;
        list.push({
          id: d.id,
          nip: data.nip,
          name: data.name,
          session: data.session,
          date: data.date,
          photoUrl: data.photoUrl,
          status: data.status,
          department: data.department,
          timestamp: data.timestamp
        });
      });
      callback(list);
    },
    (err) => {
      console.warn('Firestore snapshot error:', err);
    }
  );
}

export async function deleteAttendanceFromFirestore(recordId: string): Promise<void> {
  if (!db) return;
  try {
    await deleteDoc(doc(db, ATTENDANCE_COLL, recordId));
  } catch (err) {
    console.error('Gagal menghapus dari Firestore:', err);
  }
}

export async function clearAllAttendanceFromFirestore(records: AttendanceRecord[]): Promise<void> {
  if (!db) return;
  const firestoreDb = db;
  try {
    await Promise.all(
      records.map((r) => deleteDoc(doc(firestoreDb, ATTENDANCE_COLL, r.id)).catch(() => {}))
    );
  } catch (err) {
    console.warn('Gagal membersihkan data di Firestore:', err);
  }
}

export async function saveSettingsToFirestore(settings: CollageSettings): Promise<void> {
  if (!db || !auth?.currentUser?.uid) return;
  const currentUid = auth.currentUser.uid;
  try {
    await setDoc(doc(db, SETTINGS_COLL, `user_${currentUid}`), settings);
  } catch (err) {
    console.warn('Gagal menyimpan pengaturan ke Firestore:', err);
  }
}

/* =========================================================================
   GOOGLE WORKSPACE DIRECT & PUBLIC API CALLS (SHEETS, DRIVE)
   ========================================================================= */

/**
 * Mem-parsing teks CSV menjadi array 2D baris & kolom
 */
function parseCsvToRows(csvText: string): string[][] {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) =>
    line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((cell) => cell.trim().replace(/^"|"$/g, ''))
  );
}

/**
 * Membaca baris data dari Google Sheets:
 * 1. Menggunakan OAuth Token (jika sudah login & Sheets API aktif)
 * 2. Otomatis fallback ke tautan CSV Google Sheets (/gviz/tq?tqx=out:csv) sehingga
 *    tetap bisa menarik data meskipun tanpa login Firebase (cukup bagikan Sheet: "Siapa saja yang memiliki link")
 */
export async function fetchLiveGoogleSheetRows(
  spreadsheetId: string,
  range = 'A:F'
): Promise<string[][]> {
  const token = await getAccessToken();

  // 1. Coba via Google Sheets API v4 jika token tersedia
  if (token) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.values && Array.isArray(data.values)) {
          return data.values;
        }
      }
    } catch (e) {
      console.warn('Sheets API v4 gagal, mencoba jalur direct CSV:', e);
    }
  }

  // 2. Fallback / Tanpa Login: Ambil langsung dari endpoint Google Visualization CSV
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  const csvRes = await fetch(csvUrl);
  if (!csvRes.ok) {
    throw new Error(
      `Gagal mengakses Google Sheets (HTTP ${csvRes.status}). Pastikan akses berbagi Sheet disetel ke "Siapa saja yang memiliki link" atau login dengan akun Google yang memiliki akses.`
    );
  }
  const csvText = await csvRes.text();
  if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
    throw new Error(
      'Google Sheet masih dikunci privat. Klik tombol "Bagikan" (Share) di Google Sheets Anda lalu ubah akses ke "Siapa saja yang memiliki link" (Anyone with the link), atau login dengan akun Google baru Anda.'
    );
  }
  return parseCsvToRows(csvText);
}

/**
 * Mengunggah gambar/PDF kolase langsung ke Google Drive via Drive API v3
 */
export async function uploadCollageToDrive(
  imageBlob: Blob,
  filename: string,
  parentFolderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error(
      'Silakan Sign in with Google terlebih dahulu (dengan mencentang izin Google Drive) untuk mengunggah langsung ke Google Drive.'
    );
  }

  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const metadata: any = {
    name: filename,
    mimeType: isPdf ? 'application/pdf' : 'image/png'
  };

  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  formData.append('file', imageBlob);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Gagal mengunggah ke Google Drive (HTTP ${res.status})`
    );
  }

  const data = await res.json();
  return {
    fileId: data.id,
    webViewLink: `https://drive.google.com/file/d/${data.id}/view`
  };
}

/**
 * Mengambil file gambar asli dari Google Drive menggunakan Google Drive API v3 atau thumbnail publik
 */
export async function fetchDriveImageBlob(fileIdOrUrl: string): Promise<Blob | null> {
  const fileId =
    extractDriveImageId(fileIdOrUrl) ||
    (/^[a-zA-Z0-9_-]{20,}$/.test(fileIdOrUrl) ? fileIdOrUrl : null);
  if (!fileId) return null;

  const token = await getAccessToken();

  // 1. Coba ambil langsung dengan Google Drive API v3 jika user telah menghubungkan akun Google
  if (token) {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob && blob.size > 0 && !blob.type.includes('text/html')) {
          return await ensureBrowserCompatibleImageBlob(blob);
        }
      }
    } catch (e) {
      console.warn('Gagal memanggil Drive API untuk gambar:', e);
    }
  }

  // 2. Ambil melalui Vite Server Proxy (/api/drive-image) agar bebas blokir CORS browser,
  //    serta fallback ke thumbnail / lh3
  const candidateUrls = [
    `/api/drive-image?id=${fileId}`,
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
    `https://lh3.googleusercontent.com/d/${fileId}=w1200`
  ];

  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('text/html')) {
          const blob = await res.blob();
          if (blob && blob.size > 100 && !blob.type.includes('text/html')) {
            return await ensureBrowserCompatibleImageBlob(blob);
          }
        }
      }
    } catch {
      // lanjut ke URL berikutnya
    }
  }

  return null;
}

/**
 * Mengonversi foto Google Drive menjadi base64 Data URL lokal yang aman untuk dirender di Canvas tanpa tainting.
 */
export async function loadDriveImageAsDataUrl(fileIdOrUrl: string): Promise<string | null> {
  try {
    const blob = await fetchDriveImageBlob(fileIdOrUrl);
    if (!blob) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('Gagal mengubah blob drive ke Data URL:', err);
    return null;
  }
}
