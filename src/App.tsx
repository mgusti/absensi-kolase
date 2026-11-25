/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AttendanceRecord, CollageSettings } from './types/attendance.ts';
import { SAMPLE_ATTENDEES, filterAttendees } from './utils/collageLogic.ts';
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

const STORAGE_KEY_ATTENDEES = 'absensi_kolase_attendees_v4';
const STORAGE_KEY_SETTINGS = 'absensi_kolase_settings_v4';
const STORAGE_KEY_FORM_URL = 'absensi_kolase_form_url_v4';
const STORAGE_KEY_SHEET_ID = 'absensi_kolase_sheet_id_v4';
const STORAGE_KEY_DARK_MODE = 'absensi_kolase_dark_mode_v4';
const STORAGE_KEY_BOOT_ID = 'absensi_kolase_server_boot_id';

declare const __SERVER_BOOT_ID__: string;

const DEFAULT_INSTITUTION_NAME = 'RSUD H. ABDUL MANAP KOTA JAMBI';
const DEFAULT_UNIT_NAME = 'SUBBAG UMUM, HUMAS, DAN REKAM MEDIS';
const DEFAULT_FOOTER_NOTE = 'RSUD H. ABDUL MANAP KOTA JAMBI';

export default function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'form' | 'table' | 'script'>('studio');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_DARK_MODE) === 'true';
  });
  const [permanentSaveStatus, setPermanentSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const isInitialDiskLoadDone = useRef(false);

  // Tautan Google Form & Spreadsheet
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
    const defaultSettings: CollageSettings = {
      template: 'beige',
      frameColorA: 'classic_beige',
      frameColorB: 'navy_gold',
      orientation: 'portrait',
      institutionName: DEFAULT_INSTITUTION_NAME,
      unitName: DEFAULT_UNIT_NAME,
      logoType: 'garuda',
      footerNote: DEFAULT_FOOTER_NOTE,
      showTimestamp: true,
      duplicatePolicy: 'overwrite',
      selectedDate: new Date().toISOString().slice(0, 10),
      selectedSession: 'Pagi'
    };

    try {
      const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...defaultSettings,
          ...parsed,
          institutionName: parsed.institutionName || DEFAULT_INSTITUTION_NAME,
          unitName: parsed.unitName ?? DEFAULT_UNIT_NAME,
          footerNote: parsed.footerNote || DEFAULT_FOOTER_NOTE
        };
      }
    } catch {
      // ignore
    }
    return defaultSettings;
  });

  // Muat pengaturan permanen dari file `app-settings.json` di disk saat aplikasi dibuka
  useEffect(() => {
    let isMounted = true;
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((diskData) => {
        if (!isMounted || !diskData) {
          isInitialDiskLoadDone.current = true;
          return;
        }
        setSettings((prev) => ({
          ...prev,
          institutionName:
            typeof diskData.institutionName === 'string'
              ? diskData.institutionName
              : prev.institutionName,
          unitName:
            typeof diskData.unitName === 'string'
              ? diskData.unitName
              : prev.unitName,
          footerNote:
            typeof diskData.footerNote === 'string'
              ? diskData.footerNote
              : prev.footerNote,
          template: diskData.template || prev.template,
          frameColorA: diskData.frameColorA || prev.frameColorA || 'classic_beige',
          frameColorB: diskData.frameColorB || prev.frameColorB || 'navy_gold',
          orientation: diskData.orientation || prev.orientation,
          duplicatePolicy: diskData.duplicatePolicy || prev.duplicatePolicy
        }));
        if (typeof diskData.formUrl === 'string' && diskData.formUrl) {
          setFormUrl((prev) => prev || diskData.formUrl);
        }
        if (typeof diskData.spreadsheetId === 'string' && diskData.spreadsheetId) {
          setSpreadsheetId((prev) => prev || diskData.spreadsheetId);
        }
        if (typeof diskData.darkMode === 'boolean') {
          setDarkMode(diskData.darkMode);
        }
        isInitialDiskLoadDone.current = true;
        setPermanentSaveStatus('saved');
      })
      .catch(() => {
        isInitialDiskLoadDone.current = true;
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fungsi simpan langsung ke file permanen `app-settings.json` di disk
  const savePermanentSettingsToDisk = async (
    customSettings = settings,
    customFormUrl = formUrl,
    customSheetId = spreadsheetId,
    customDarkMode = darkMode
  ): Promise<boolean> => {
    setPermanentSaveStatus('saving');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutionName: customSettings.institutionName,
          unitName: customSettings.unitName,
          footerNote: customSettings.footerNote,
          template: customSettings.template,
          frameColorA: customSettings.frameColorA || 'classic_beige',
          frameColorB: customSettings.frameColorB || 'navy_gold',
          orientation: customSettings.orientation,
          duplicatePolicy: customSettings.duplicatePolicy,
          formUrl: customFormUrl,
          spreadsheetId: customSheetId,
          darkMode: customDarkMode
        })
      });
      if (res.ok) {
        setPermanentSaveStatus('saved');
        return true;
      }
      setPermanentSaveStatus('error');
      return false;
    } catch {
      setPermanentSaveStatus('error');
      return false;
    }
  };

  // Sinkronkan class dark-theme pada elemen <html>
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DARK_MODE, String(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
  }, [darkMode]);

  // Simpan otomatis ke file `app-settings.json` di disk setiap kali 3 input instansi atau pengaturan berubah
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    if (!isInitialDiskLoadDone.current) return;

    setPermanentSaveStatus('saving');
    const timer = setTimeout(() => {
      savePermanentSettingsToDisk(settings, formUrl, spreadsheetId, darkMode);
    }, 350);

    return () => clearTimeout(timer);
  }, [
    settings.institutionName,
    settings.unitName,
    settings.footerNote,
    settings.template,
    settings.frameColorA,
    settings.frameColorB,
    settings.orientation,
    settings.duplicatePolicy,
    formUrl,
    spreadsheetId,
    darkMode
  ]);

  // Save attendees & links to localStorage as well
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ATTENDEES, JSON.stringify(attendees));
  }, [attendees]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_FORM_URL, formUrl);
  }, [formUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SHEET_ID, spreadsheetId);
  }, [spreadsheetId]);

  const updateSettings = (partial: Partial<CollageSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  };

  const handleAddAttendance = (updatedList: AttendanceRecord[]) => {
    setAttendees(updatedList);
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
  };

  const handleClearAll = () => {
    if (window.confirm('Yakin ingin mengosongkan semua data presensi?')) {
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
      setActiveTab('studio');
    }
  };

  return (
    <div
      className={`min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans transition-colors ${
        darkMode ? 'dark-theme' : ''
      }`}
    >
      {/* Top Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalAttendeesCount={attendees.length}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((prev) => !prev)}
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
            permanentSaveStatus={permanentSaveStatus}
            onSavePermanent={() => savePermanentSettingsToDisk(settings, formUrl, spreadsheetId)}
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
