/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    heic2any?: (options: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
  }
}

const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1'
]);

/**
 * Mengecek apakah sebuah Blob atau File berformat HEIC / HEIF
 * berdasarkan ekstensi nama file, MIME type, maupun magic bytes header (ftyp).
 */
export async function isHeicBlob(blob: Blob, filename?: string): Promise<boolean> {
  if (filename && /\.(heic|heif)$/i.test(filename)) {
    return true;
  }

  const mime = (blob.type || '').toLowerCase();
  if (mime.includes('heic') || mime.includes('heif')) {
    return true;
  }

  if (blob.size < 12) return false;

  try {
    const headerBuffer = await blob.slice(0, 12).arrayBuffer();
    const bytes = new Uint8Array(headerBuffer);
    const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (ftyp === 'ftyp') {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
      if (HEIC_BRANDS.has(brand)) {
        return true;
      }
    }
  } catch {
    // ignore
  }

  return false;
}

let heicScriptPromise: Promise<void> | null = null;

/**
 * Memuat library konverter heic2any secara dinamis jika belum tersedia di window
 */
async function ensureHeic2AnyLoaded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (typeof window.heic2any === 'function') return;

  if (!heicScriptPromise) {
    heicScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-heic2any]') as HTMLScriptElement | null;
      if (existingScript && typeof window.heic2any === 'function') {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
      script.async = true;
      script.setAttribute('data-heic2any', 'true');
      script.onload = () => resolve();
      script.onerror = () => {
        heicScriptPromise = null;
        reject(new Error('Gagal memuat modul konverter HEIC'));
      };
      document.head.appendChild(script);
    });
  }

  return heicScriptPromise;
}

/**
 * Mengonversi Blob/File foto .heic / .heif menjadi Blob image/jpeg standar
 * agar dapat langsung dirender di <img>, <canvas>, dan diekspor ke PDF.
 */
export async function ensureBrowserCompatibleImageBlob(
  blob: Blob,
  filename?: string
): Promise<Blob> {
  const isHeic = await isHeicBlob(blob, filename);
  if (!isHeic) {
    return blob;
  }

  try {
    await ensureHeic2AnyLoaded();
    if (typeof window.heic2any === 'function') {
      const converted = await window.heic2any({
        blob,
        toType: 'image/jpeg',
        quality: 0.9
      });
      const resultBlob = Array.isArray(converted) ? converted[0] : converted;
      if (resultBlob && resultBlob.size > 0) {
        return resultBlob;
      }
    }
  } catch (err) {
    console.warn('Gagal mengonversi file HEIC ke JPEG:', err);
  }

  return blob;
}

/**
 * Membaca File gambar (termasuk .heic / .heif) dan mengembalikannya sebagai Data URL (base64 JPEG/PNG)
 */
export async function readImageFileAsDataUrl(file: File): Promise<string> {
  const compatibleBlob = await ensureBrowserCompatibleImageBlob(file, file.name);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Gagal membaca file gambar'));
    reader.readAsDataURL(compatibleBlob);
  });
}

