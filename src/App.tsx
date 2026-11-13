/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AttendanceRecord, CollageSettings } from './types/attendance.ts';
import { SAMPLE_ATTENDEES } from './utils/collageLogic.ts';
import { Navbar } from './components/Navbar.tsx';
import { CollageStudio } from './components/CollageStudio.tsx';
import { AttendanceForm } from './components/AttendanceForm.tsx';
import { AttendanceTable } from './components/AttendanceTable.tsx';
import { GasSetupModal } from './components/GasSetupModal.tsx';
import { AddAttendeeModal } from './components/AddAttendeeModal.tsx';
import { GoogleFormShareModal } from './components/GoogleFormShareModal.tsx';
import { SyncSheetModal } from './components/SyncSheetModal.tsx';
import { GoogleWorkspacePanel } from './components/GoogleWorkspacePanel.tsx';
import { downloadAllPagesAsPdf } from './utils/collageRenderer.ts';
import { filterAttendees } from './utils/collageLogic.ts';
import {
  saveAttendanceToFirestore,
  subscribeAttendance,
  deleteAttendanceFromFirestore,
  clearAllAttendanceFromFirestore
} from './services/firebase.ts';

const STORAGE_KEY_ATTENDEES = 'absensi_kolase_attendees_v4';
const STORAGE_KEY_SETTINGS = 'absensi_kolase_settings_v4';
const STORAGE_KEY_FORM_URL = 'absensi_kolase_form_url_v4';
const STORAGE_KEY_SHEET_ID = 'absensi_kolase_sheet_id_v4';
const STORAGE_KEY_BOOT_ID = 'absensi_kolase_server_boot_id';

declare const __SERVER_BOOT_ID__: string;

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'form' | 'table' | 'script'>('studio');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Tautan Google Form & Spreadsheet milik user baru (tersimpan di localStorage)
  const [formUrl, setFormUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_FORM_URL) || '';
  });

  const [spreadsheetId, setSpreadsheetId] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_SHEET_ID) || '';
  });

  // Setiap kali `npm run dev` dijalankan ulang, otomatis kosongkan semua data Rekap Sheets
  const [attendees, setAttendees] = useState<AttendanceRecord[]>(() => {
    try {
      const currentBootId = typeof __SERVER_BOOT_ID__ !== 'undefined' ? __SERVER_BOOT_ID__ : '';
      const lastBootId = localStorage.getItem(STORAGE_KEY_BOOT_ID);

      if (currentBootId && lastBootId !== currentBootId) {
        localStorage.removeItem(STORAGE_KEY_ATTENDEES);
        localStorage.removeItem('autoabsen_attendees_v2');
        localStorage.setItem(STORAGE_KEY_BOOT_ID, currentBootId);
        return [];
      }

      const stored = localStorage.getItem(STORAGE_KEY_ATTENDEES);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Collage settings
  const [settings, setSettings] = useState<CollageSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.unitName?.includes('PERJANJIAN KERJA')) {
          parsed.unitName = 'REKAPITULASI DOKUMENTASI KEHADIRAN';
        }
        if (parsed.institutionName?.includes('P3K')) {
          parsed.institutionName = 'DOKUMENTASI ABSENSI KEHADIRAN';
        }
        if (parsed.footerNote?.includes('P3K')) {
          parsed.footerNote = 'Dokumentasi Resmi Kehadiran';
        }
        return parsed;
      }
    } catch {
      // ignore
    }
    return {
      template: 'beige',
      orientation: 'portrait',
      institutionName: 'DOKUMENTASI ABSENSI KEHADIRAN',
      unitName: 'REKAPITULASI DOKUMENTASI KEHADIRAN',
      logoType: 'garuda',
      footerNote: 'Dokumentasi Resmi Kehadiran',
      showTimestamp: true,
      duplicatePolicy: 'overwrite',
      selectedDate: new Date().toISOString().slice(0, 10),
      selectedSession: 'Pagi'
    };
  });

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ATTENDEES, JSON.stringify(attendees));
  }, [attendees]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FORM_URL, formUrl);
  }, [formUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHEET_ID, spreadsheetId);
  }, [spreadsheetId]);

  // Optional Firestore real-time listener
  useEffect(() => {
    const unsub = subscribeAttendance((remoteRecords) => {
      if (remoteRecords.length > 0) {
        setAttendees((prev) => {
          // Merge unique records
          const existingIds = new Set(prev.map((r) => r.id));
          const newOnes = remoteRecords.filter((r) => !existingIds.has(r.id));
          return newOnes.length > 0 ? [...newOnes, ...prev] : prev;
        });
      }
    });
    return () => unsub();
  }, []);

  const updateSettings = (partial: Partial<CollageSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const handleAddAttendance = (updatedList: AttendanceRecord[]) => {
    setAttendees(updatedList);
    // Sync the top record to Firestore
    if (updatedList.length > 0) {
      saveAttendanceToFirestore(updatedList[0]);
    }
  };

  const handleImportRecords = (newRecords: AttendanceRecord[]) => {
    // Terapkan aturan duplikat (Default: TIMPA / overwrite dengan data baris terbaru)
    const processed: AttendanceRecord[] = [];
    const indexByKey = new Map<string, number>();

    for (const rec of newRecords) {
      const key = `${rec.nip}-${rec.date}-${rec.session}`;
      const existingIdx = indexByKey.get(key);

      if (existingIdx === undefined) {
        indexByKey.set(key, processed.length);
        processed.push(rec);
      } else if (settings.duplicatePolicy === 'overwrite') {
        processed[existingIdx] = { ...rec, status: 'overwritten' };
      } else if (settings.duplicatePolicy === 'flag') {
        processed.push({ ...rec, status: 'duplicate_flagged' });
      }
      // Jika 'reject', abaikan duplikat berikutnya
    }

    // Ganti data Rekap Sheets secara penuh dengan hasil tarikan terbaru dari Google Sheet agar selalu 100% konsisten
    setAttendees(processed);
    processed.forEach((r) => saveAttendanceToFirestore(r));

    // Sesuaikan otomatis filter Tanggal & Sesi di Studio Kolase dengan data yang baru ditarik
    if (processed.length > 0) {
      setSettings((prev) => {
        const hasMatchCurrent = processed.some(
          (r) => r.date === prev.selectedDate && r.session === prev.selectedSession
        );
        if (hasMatchCurrent) return prev;
        const latest = processed[processed.length - 1];
        return {
          ...prev,
          selectedDate: latest.date,
          selectedSession: latest.session
        };
      });
    }
  };

  const handleDeleteAttendee = (id: string) => {
    setAttendees((prev) => prev.filter((a) => a.id !== id));
    deleteAttendanceFromFirestore(id);
  };

  const handleClearAll = () => {
    if (window.confirm('Yakin ingin mengosongkan semua data presensi?')) {
      clearAllAttendanceFromFirestore(attendees);
      setAttendees([]);
    }
  };

  const handleResetDemo = () => {
    setAttendees(SAMPLE_ATTENDEES);
    setSettings((prev) => ({
      ...prev,
      selectedDate: '2026-10-26',
      selectedSession: 'Pagi'
    }));
  };

  // Quick download 1 PDF file containing all pages from top bar
  const handleQuickDownload = async () => {
    const active = filterAttendees(attendees, settings.selectedDate, settings.selectedSession);
    try {
      await downloadAllPagesAsPdf(active, settings);
    } catch (err) {
      console.error('Quick download PDF error:', err);
      // Fallback to active tab
      setActiveTab('studio');
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans">
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onQuickDownload={handleQuickDownload}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        totalAttendeesCount={attendees.length}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {/* Workspace Quick Panel at Top of Studio */}
        {activeTab === 'studio' && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-6">
            <GoogleWorkspacePanel
              onSyncRows={handleImportRecords}
              formUrl={formUrl}
              onUpdateFormUrl={setFormUrl}
              spreadsheetId={spreadsheetId}
              onUpdateSpreadsheetId={setSpreadsheetId}
              onOpenShareModal={() => setIsShareModalOpen(true)}
              attendees={attendees}
              settings={settings}
            />
          </div>
        )}

        {activeTab === 'studio' && (
          <CollageStudio
            attendees={attendees}
            settings={settings}
            onUpdateSettings={updateSettings}
            onQuickAddDemo={handleResetDemo}
          />
        )}

        {activeTab === 'form' && (
          <AttendanceForm
            attendees={attendees}
            onAddAttendance={(newList) => {
              handleAddAttendance(newList);
            }}
            selectedDate={settings.selectedDate}
            defaultSession={settings.selectedSession}
            duplicatePolicy={settings.duplicatePolicy}
            onGoToStudio={() => setActiveTab('studio')}
          />
        )}

        {activeTab === 'table' && (
          <AttendanceTable
            attendees={attendees}
            onDeleteAttendee={handleDeleteAttendee}
            onClearAll={handleClearAll}
            onResetDemo={handleResetDemo}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenSyncModal={() => setIsSyncModalOpen(true)}
            onOpenShareModal={() => setIsShareModalOpen(true)}
            onUpdateAttendees={setAttendees}
          />
        )}

        {activeTab === 'script' && <GasSetupModal />}
      </main>

      {/* Manual Attendee Entry Modal */}
      <AddAttendeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        attendees={attendees}
        onAdd={handleAddAttendance}
        selectedDate={settings.selectedDate}
        defaultSession={settings.selectedSession}
        duplicatePolicy={settings.duplicatePolicy}
      />

      {/* Google Form Share & QR Code Modal */}
      <GoogleFormShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        formUrl={formUrl}
        onUpdateFormUrl={setFormUrl}
      />

      {/* Google Sheets Sync & Import Modal */}
      <SyncSheetModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        onImportRecords={handleImportRecords}
      />

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-500">
          <div>
            <strong>Absensi Kolase</strong> — Terhubung dengan Google Forms & Google Sheets.
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="text-stone-700 hover:text-stone-900 font-semibold transition-colors flex items-center gap-1"
            >
              <span>📱 Bagikan Google Form</span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setActiveTab('script')}
              className="hover:text-stone-900 transition-colors"
            >
              Panduan Tombol Sign Sheet
            </button>
            <span aria-hidden="true">·</span>
            <button
              onClick={() => setActiveTab('studio')}
              className="hover:text-stone-900 transition-colors"
            >
              Studio Kolase
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
