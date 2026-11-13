/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatIndonesianDate,
  filterAttendees,
  paginateAttendees,
  validateNip,
  resolveAttendanceSubmission,
  generatePdfFileName,
  formatPdfSummary,
  SAMPLE_ATTENDEES
} from './collageLogic.ts';
import { AttendanceRecord } from '../types/attendance.ts';

test('formatIndonesianDate converts YYYY-MM-DD correctly', () => {
  assert.equal(formatIndonesianDate('2026-10-26'), '26 OKTOBER 2026');
  assert.equal(formatIndonesianDate('2026-01-01'), '1 JANUARI 2026');
  assert.equal(formatIndonesianDate('2026-12-31'), '31 DESEMBER 2026');
});

test('generatePdfFileName & formatPdfSummary formats multi-page PDF output details correctly', () => {
  // If there are 2 pages (e.g. 12 participants)
  const fn2 = generatePdfFileName('Pagi', '2026-10-26', 2);
  assert.equal(fn2, 'Dokumentasi_Absensi_Kolase_Pagi_2026-10-26_(2_Halaman).pdf');

  const summary2 = formatPdfSummary(2, 12);
  assert.equal(summary2, '1 File PDF (2 Halaman · 12 Peserta · Maks. 6 Foto/Hal)');

  // 1 page
  const fn1 = generatePdfFileName('Sore', '2026-10-26', 1);
  assert.equal(fn1, 'Dokumentasi_Absensi_Kolase_Sore_2026-10-26_(1_Halaman).pdf');
});

test('paginateAttendees splits 14 items into 3 pages (6, 6, 2)', () => {
  const pagiRecords = filterAttendees(SAMPLE_ATTENDEES, '2026-10-26', 'Pagi');
  assert.equal(pagiRecords.length, 14);

  const pages14 = paginateAttendees(pagiRecords, 6);
  assert.equal(pages14.length, 3);
  assert.equal(pages14[0].length, 6);
  assert.equal(pages14[1].length, 6);
  assert.equal(pages14[2].length, 2);
});

test('filterAttendees filters correctly by date and session', () => {
  const soreRecords = filterAttendees(SAMPLE_ATTENDEES, '2026-10-26', 'Sore');
  assert.equal(soreRecords.length, 4);
  assert.ok(soreRecords.every(r => r.session === 'Sore'));

  const emptyDate = filterAttendees(SAMPLE_ATTENDEES, '2025-01-01');
  assert.equal(emptyDate.length, 0);
});

test('validateNip cleans formatting and checks minimum length', () => {
  const valid = validateNip('1988 0315-201402 1 001');
  assert.equal(valid.isValid, true);
  assert.equal(valid.cleaned, '198803152014021001');

  const short = validateNip('12');
  assert.equal(short.isValid, false);
  assert.ok(short.error);

  const nonDigit = validateNip('abc');
  assert.equal(nonDigit.isValid, false);
});

test('resolveAttendanceSubmission respects duplicate policies', () => {
  const baseList: AttendanceRecord[] = [
    {
      id: 'att-1',
      timestamp: '2026-10-26T07:00:00Z',
      nip: '19880101',
      name: 'Andi Pratama',
      session: 'Pagi',
      date: '2026-10-26',
      photoUrl: 'data:...',
      status: 'valid'
    }
  ];

  // 1. Unique candidate
  const newCandidate = {
    timestamp: '2026-10-26T07:10:00Z',
    nip: '19990202',
    name: 'Budi Santoso',
    session: 'Pagi' as const,
    date: '2026-10-26',
    photoUrl: 'data:...'
  };
  const res1 = resolveAttendanceSubmission(baseList, newCandidate, 'reject');
  assert.equal(res1.resultStatus, 'created');
  assert.equal(res1.updatedList.length, 2);

  // 2. Duplicate with reject policy
  const dupCandidate = {
    timestamp: '2026-10-26T07:15:00Z',
    nip: '19880101',
    name: 'Andi Pratama (Duplicate)',
    session: 'Pagi' as const,
    date: '2026-10-26',
    photoUrl: 'data:...'
  };
  const resReject = resolveAttendanceSubmission(baseList, dupCandidate, 'reject');
  assert.equal(resReject.resultStatus, 'rejected');
  assert.equal(resReject.updatedList.length, 1);

  // 3. Duplicate with flag policy
  const resFlag = resolveAttendanceSubmission(baseList, dupCandidate, 'flag');
  assert.equal(resFlag.resultStatus, 'flagged');
  assert.equal(resFlag.updatedList.length, 2);
  assert.equal(resFlag.updatedList[0].status, 'duplicate_flagged');

  // 4. Duplicate with overwrite policy
  const resOverwrite = resolveAttendanceSubmission(baseList, dupCandidate, 'overwrite');
  assert.equal(resOverwrite.resultStatus, 'overwritten');
  assert.equal(resOverwrite.updatedList.length, 1);
  assert.equal(resOverwrite.updatedList[0].name, 'Andi Pratama (Duplicate)');
});

test('extractDriveImageId correctly extracts ID from various Google Drive URLs', async () => {
  const { extractDriveImageId, getDriveDirectImageUrl } = await import('./collageLogic.ts');
  const url1 = 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456';
  const id1 = extractDriveImageId(url1);
  assert.equal(id1, '1AbCdEfGhIjKlMnOpQrStUvWxYz123456');

  const directUrl = getDriveDirectImageUrl(url1);
  assert.equal(directUrl, '/api/drive-image?id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456');

  const url2 = 'https://drive.google.com/file/d/1ZyXwVuTsRqPoNmLkJiHgFeDcBa654321/view?usp=sharing';
  const id2 = extractDriveImageId(url2);
  assert.equal(id2, '1ZyXwVuTsRqPoNmLkJiHgFeDcBa654321');
});

test('parseGoogleSheetCsv parses Google Sheet CSV (D: Sesi, E: Foto) correctly', async () => {
  const { parseGoogleSheetCsv } = await import('./collageLogic.ts');
  const csvData = `Timestamp,NIP,Nama Lengkap & Gelar,Sesi Absensi,Unggah Foto Diri / Bukti Kehadiran
10/26/2026 07:15:00,198803152014021001,Drs. Hendra Setiawan,Pagi,https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz123456
10/26/2026 07:20:00,199105222018012003,Siti Nurhaliza,Pagi,https://drive.google.com/open?id=1ZyXwVuTsRqPoNmLkJiHgFeDcBa654321`;

  const parsed = parseGoogleSheetCsv(csvData);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].nip, '198803152014021001');
  assert.equal(parsed[0].name, 'Drs. Hendra Setiawan');
  assert.equal(parsed[0].session, 'Pagi');
  assert.equal(parsed[0].date, '2026-10-26');
  assert.ok(parsed[0].photoUrl.includes('1AbCdEfGhIjKlMnOpQrStUvWxYz123456'));

  assert.equal(parsed[1].nip, '199105222018012003');
  assert.equal(parsed[1].name, 'Siti Nurhaliza');
});

