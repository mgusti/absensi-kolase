/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  ExternalLink,
  QrCode,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sparkles
} from 'lucide-react';
import { fetchLiveGoogleSheetRows } from '../services/googleWorkspace.ts';
import { AttendanceRecord, CollageSettings } from '../types/attendance.ts';
import {
  getDriveDirectImageUrl,
  filterAttendees,
  detectSheetDayFirst,
  parseFlexibleTimestamp
} from '../utils/collageLogic.ts';
import { downloadAllPagesAsPdf, clearImageCache } from '../utils/collageRenderer.ts';

interface GoogleWorkspacePanelProps {
  onSyncRows: (records: AttendanceRecord[]) => void;
  formUrl: string;
  onUpdateFormUrl: (url: string) => void;
  spreadsheetId: string;
  onUpdateSpreadsheetId: (id: string) => void;
  onOpenShareModal: () => void;
  attendees?: AttendanceRecord[];
  settings?: CollageSettings;
}

export const GoogleWorkspacePanel: React.FC<GoogleWorkspacePanelProps> = ({
  onSyncRows,
  formUrl,
  onUpdateFormUrl,
  spreadsheetId,
  onUpdateSpreadsheetId,
  onOpenShareModal,
  attendees,
  settings
}) => {
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFetchSheet = async () => {
    if (!spreadsheetId.trim()) {
      setActionMessage({
        type: 'error',
        text: 'Masukkan URL atau ID Google Sheets terlebih dahulu.'
      });
      return;
    }

    // Extract ID if full URL is pasted
    let cleanId = spreadsheetId.trim();
    const match = cleanId.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) cleanId = match[1];

    setIsFetchingSheet(true);
    setActionMessage(null);

    try {
      const rows = await fetchLiveGoogleSheetRows(cleanId, 'A:F');
      if (rows.length < 2) {
        setActionMessage({
          type: 'error',
          text: 'Sheet ditemukan namun belum ada baris data respon.'
        });
        return;
      }

      // Parse rows (Kolom A: Timestamp, B: NIP, C: Nama, D: Sesi, E: Foto)
      const headers = rows[0].map((h) => String(h).toLowerCase());
      let timestampIdx = headers.findIndex((h) => h.includes('timestamp') || h.includes('waktu'));
      let nipIdx = headers.findIndex((h) => h.includes('nip'));
      let nameIdx = headers.findIndex((h) => h.includes('nama'));
      let sessionIdx = headers.findIndex((h) => h.includes('sesi'));
      let photoIdx = headers.findIndex((h) => h.includes('foto') || h.includes('bukti') || h.includes('unggah'));

      if (timestampIdx === -1) timestampIdx = 0;
      if (nipIdx === -1) nipIdx = 1;
      if (nameIdx === -1) nameIdx = 2;
      if (sessionIdx === -1) sessionIdx = 3; // Kolom D
      if (photoIdx === -1) photoIdx = 4;   // Kolom E

      const dataRows = rows.slice(1);
      const isDayFirst = detectSheetDayFirst(dataRows.map((r) => r[timestampIdx] || ''));

      const parsed: AttendanceRecord[] = [];
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rawTime = row[timestampIdx] || '';
        const rawNip = row[nipIdx] || '';
        const rawName = row[nameIdx] || '';
        const rawSession = row[sessionIdx] || 'Pagi';
        const rawPhoto = row[photoIdx] || '';

        if (!rawNip && !rawName) continue;

        const { dateStr, isoTimestamp } = parseFlexibleTimestamp(rawTime, isDayFirst);

        parsed.push({
          id: `sheet-live-${i + 1}-${Date.now()}`,
          timestamp: isoTimestamp,
          nip: String(rawNip).replace(/\D/g, '') || String(rawNip),
          name: String(rawName),
          session: String(rawSession).toLowerCase().includes('sore') ? 'Sore' : 'Pagi',
          date: dateStr,
          photoUrl: rawPhoto.includes('drive.google.com') ? getDriveDirectImageUrl(rawPhoto) : rawPhoto,
          status: 'valid',
          department: 'Peserta'
        });
      }

      clearImageCache();
      onSyncRows(parsed);
      setActionMessage({
        type: 'success',
        text: `Sukses! Berhasil menarik ${parsed.length} data presensi langsung dari Google Sheets.`
      });
    } catch (err: any) {
      console.error(err);
      setActionMessage({
        type: 'error',
        text: 'Gagal mengambil data dari Google Sheets: ' + (err.message || '')
      });
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!attendees || !settings) return;
    setIsDownloadingPdf(true);
    setActionMessage(null);
    try {
      const active = filterAttendees(attendees, settings.selectedDate, settings.selectedSession);
      const res = await downloadAllPagesAsPdf(active, settings);
      setActionMessage({
        type: 'success',
        text: `✅ 1 File PDF (${res.pageCount} Halaman) berhasil diunduh ke perangkat Anda!`
      });
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: 'Gagal membuat PDF: ' + (err.message || '')
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 shadow-sm space-y-4">
      {/* Top Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Mode Direct Link · Bebas Ganti Email Google (Tanpa Login)</span>
          </div>
          <h2 className="text-base font-bold text-stone-900 mt-0.5">
            Integrasi Langsung Google Forms & Google Sheets
          </h2>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg font-medium">
          <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Cukup tempel link Form & Sheet dari email mana saja</span>
        </div>
      </div>

      {/* Action status toast */}
      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Quick Integration Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Card 1: Google Form Hub */}
        <div className="border border-stone-200 rounded-xl p-3.5 bg-stone-50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-stone-900">1. Link Google Form</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                  formUrl.trim() ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {formUrl.trim() ? 'Aktif' : 'Tempel Link'}
              </span>
            </div>
            <p className="text-[11px] text-stone-600 leading-snug mb-2">
              Tempel URL Google Form dari akun Google Anda untuk dibagikan via WA / QR Code.
            </p>
            <input
              type="url"
              placeholder="https://docs.google.com/forms/..."
              value={formUrl}
              onChange={(e) => onUpdateFormUrl(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-mono text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onOpenShareModal}
              className="flex-1 py-1.5 bg-stone-900 hover:bg-stone-800 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Bagikan & QR</span>
            </button>
            {formUrl.trim() && (
              <a
                href={formUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 bg-white border border-stone-200 hover:bg-stone-100 rounded-lg text-stone-700"
                title="Buka Google Form asli"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Card 2: Live Google Sheets Sync */}
        <div className="border border-stone-200 rounded-xl p-3.5 bg-stone-50 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-stone-900">2. Link Google Sheets</span>
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-[11px] text-stone-600 leading-snug mb-2">
              Pastikan akses Sheet & folder foto Drive diset <strong>"Siapa saja yang memiliki link"</strong>, lalu tempel URL Sheet:
            </p>
            <input
              type="text"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={spreadsheetId}
              onChange={(e) => onUpdateSpreadsheetId(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-mono text-stone-800 focus:outline-none focus:ring-1 focus:ring-stone-900"
            />
          </div>
          <div className="mt-3">
            <button
              onClick={handleFetchSheet}
              disabled={isFetchingSheet}
              className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetchingSheet ? 'animate-spin' : ''}`} />
              <span>{isFetchingSheet ? 'Menarik data...' : 'Tarik Data Sheets'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
