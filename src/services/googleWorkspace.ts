/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { extractDriveImageId } from '../utils/collageLogic.ts';
import { ensureBrowserCompatibleImageBlob } from '../utils/heicConverter.ts';

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
 * Membaca baris data langsung dari tautan CSV Google Sheets (/gviz/tq?tqx=out:csv)
 * Tanpa login Firebase / OAuth (cukup bagikan Sheet: "Siapa saja yang memiliki link")
 */
export async function fetchLiveGoogleSheetRows(
  spreadsheetId: string,
  _range = 'A:F'
): Promise<string[][]> {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv`;
  const csvRes = await fetch(csvUrl);
  if (!csvRes.ok) {
    throw new Error(
      `Gagal mengakses Google Sheets (HTTP ${csvRes.status}). Pastikan akses berbagi Sheet disetel ke "Siapa saja yang memiliki link".`
    );
  }
  const csvText = await csvRes.text();
  if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html')) {
    throw new Error(
      'Google Sheet masih dikunci privat. Klik tombol "Bagikan" (Share) di Google Sheets Anda lalu ubah akses ke "Siapa saja yang memiliki link" (Anyone with the link).'
    );
  }
  return parseCsvToRows(csvText);
}

/**
 * Mengambil file gambar asli dari Google Drive melalui Vite Server Proxy (/api/drive-image)
 * atau endpoint thumbnail publik, termasuk konversi otomatis untuk format .HEIC/.HEIF
 */
export async function fetchDriveImageBlob(fileIdOrUrl: string): Promise<Blob | null> {
  const fileId =
    extractDriveImageId(fileIdOrUrl) ||
    (/^[a-zA-Z0-9_-]{20,}$/.test(fileIdOrUrl) ? fileIdOrUrl : null);
  if (!fileId) return null;

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
