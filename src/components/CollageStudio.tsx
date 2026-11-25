/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  Share2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Sliders,
  Check,
  Building,
  Calendar,
  Layers,
  Sparkles,
  FileArchive,
  FileText,
  Loader2,
  HardDrive
} from 'lucide-react';
import {
  AttendanceRecord,
  AttendanceSession,
  CollageOrientation,
  CollageSettings,
  CollageTemplate,
  FrameColorA,
  FrameColorB,
  LogoPreset
} from '../types/attendance.ts';
import {
  filterAttendees,
  paginateAttendees,
  formatIndonesianDate,
  formatPdfSummary,
  generatePdfFileName
} from '../utils/collageLogic.ts';
import {
  renderCollagePage,
  downloadAllPagesAsPdf,
  downloadAllPagesAsZip,
  copyCanvasToClipboard,
  clearImageCache
} from '../utils/collageRenderer.ts';

interface CollageStudioProps {
  attendees: AttendanceRecord[];
  settings: CollageSettings;
  onUpdateSettings: (newSettings: Partial<CollageSettings>) => void;
  onQuickAddDemo: () => void;
  permanentSaveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  onSavePermanent?: () => Promise<boolean>;
}

export const CollageStudio: React.FC<CollageStudioProps> = ({
  attendees,
  settings,
  onUpdateSettings,
  onQuickAddDemo,
  permanentSaveStatus = 'saved',
  onSavePermanent
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [downloadingPdfMode, setDownloadingPdfMode] = useState<'hd' | 'compressed' | null>(null);
  const [pdfProgress, setPdfProgress] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter attendees based on selected date & session
  const activeAttendees = filterAttendees(
    attendees,
    settings.selectedDate,
    settings.selectedSession
  );

  const pages = paginateAttendees(activeAttendees, 6);
  const totalPages = Math.max(1, pages.length);

  // Ensure valid page index when list changes
  useEffect(() => {
    if (currentPageIndex >= totalPages) {
      setCurrentPageIndex(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPageIndex]);

  // Re-render canvas whenever settings, attendees, or page change
  useEffect(() => {
    let isCancelled = false;
    const render = async () => {
      if (!canvasRef.current) return;
      setIsRendering(true);
      const currentRecords = pages[currentPageIndex] || [];
      await renderCollagePage(
        canvasRef.current,
        currentRecords,
        currentPageIndex,
        totalPages,
        activeAttendees.length,
        settings
      );
      if (!isCancelled) {
        setIsRendering(false);
      }
    };
    render();
    return () => {
      isCancelled = true;
    };
  }, [settings, attendees, currentPageIndex, totalPages, activeAttendees.length]);

  const hasGoogleDrivePhotos = activeAttendees.some(
    (a) => a.photoUrl && (a.photoUrl.includes('drive.google.com') || a.photoUrl.includes('googleusercontent.com'))
  );

  useEffect(() => {
    const handleTokenChange = () => {
      clearImageCache();
      setCurrentPageIndex((prev) => prev);
    };
    window.addEventListener('gdrive_token_updated', handleTokenChange);
    return () => window.removeEventListener('gdrive_token_updated', handleTokenChange);
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  /**
   * Primary output: 1 single multi-page PDF document (HD or Compressed small size).
   */
  const handleDownloadAllPdf = async (compressed = false) => {
    const mode = compressed ? 'compressed' : 'hd';
    setDownloadingPdfMode(mode);
    setPdfProgress(
      compressed
        ? `Mengompres PDF (${totalPages} halaman)...`
        : `Menyiapkan PDF HD (${totalPages} halaman)...`
    );
    try {
      const res = await downloadAllPagesAsPdf(
        activeAttendees,
        settings,
        (_current, _total, phase) => {
          setPdfProgress(phase);
        },
        { compressed }
      );
      const sizeLabel = formatFileSize(res.sizeBytes);
      showToast(
        compressed
          ? `✅ PDF Kompres (${res.pageCount} halaman · ${sizeLabel}) berhasil diunduh!`
          : `✅ PDF Kualitas HD (${res.pageCount} halaman · ${sizeLabel}) berhasil diunduh!`
      );
    } catch (err: any) {
      console.error('PDF export error:', err);
      showToast('Gagal membuat dokumen PDF: ' + (err.message || ''));
    } finally {
      setDownloadingPdfMode(null);
      setPdfProgress(null);
    }
  };

  const handleDownloadAllZip = async () => {
    setIsDownloadingZip(true);
    try {
      await downloadAllPagesAsZip(activeAttendees, settings);
      showToast(`Seluruh ${totalPages} halaman kolase berhasil diunduh dalam file ZIP.`);
    } catch (e) {
      console.error(e);
      showToast('Gagal membuat file ZIP.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-stone-900 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-xl border border-stone-700 animate-fade-in flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Breadcrumb Info */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-xl border border-stone-200 p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
            <span>Studio Dokumentasi</span>
            <span aria-hidden="true">·</span>
            <span className="text-stone-800 font-bold">Generator Kolase Otomatis</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-stone-900 tracking-tight">
            Pratinjau & Kustomisasi Kolase Foto
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Menyusun peserta ke dalam kisi 3 kolom × 2 baris (maks. 6 foto per halaman). Gambar beresolusi tinggi siap cetak atau dibagikan.
          </p>
        </div>

        {/* Quick actions: Unduh PDF Standar (HD) & Unduh PDF Kompres (Ukuran Kecil) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Option 1: Standard HD PDF */}
          <button
            onClick={() => handleDownloadAllPdf(false)}
            disabled={downloadingPdfMode !== null}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm transition-all disabled:opacity-50"
            title={`Unduh 1 file PDF resolusi penuh berisi ${totalPages} halaman kolase`}
          >
            {downloadingPdfMode === 'hd' ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <FileText className="w-4 h-4 shrink-0" />
            )}
            <div className="text-left">
              <span className="block leading-tight">
                {downloadingPdfMode === 'hd'
                  ? pdfProgress || 'Membuat PDF...'
                  : `Unduh 1 File PDF (${totalPages} Hal.)`}
              </span>
              <span className="text-[10px] font-normal opacity-90 block">
                Kualitas Standar / Cetak HD
              </span>
            </div>
          </button>

          {/* Option 2: Compressed Small-Size PDF */}
          <button
            onClick={() => handleDownloadAllPdf(true)}
            disabled={downloadingPdfMode !== null}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition-all disabled:opacity-50"
            title={`Unduh 1 file PDF ukuran kecil (terkompresi) berisi ${totalPages} halaman kolase`}
          >
            {downloadingPdfMode === 'compressed' ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <FileArchive className="w-4 h-4 shrink-0" />
            )}
            <div className="text-left">
              <span className="block leading-tight">
                {downloadingPdfMode === 'compressed'
                  ? pdfProgress || 'Mengompres PDF...'
                  : `Unduh PDF Kompres (${totalPages} Hal.)`}
              </span>
              <span className="text-[10px] font-normal opacity-90 block">
                Ukuran Kecil (~80% Lebih Ringan)
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Main Studio Grid: Left Canvas Viewport + Right Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Canvas Preview (lg:col-span-8) */}
        <div className="lg:col-span-8 flex flex-col items-center">
          {/* Top Session & Date selector pill bar */}
          <div className="w-full bg-white rounded-xl border border-stone-200 p-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            {/* Sesi selector */}
            <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-lg">
              <button
                onClick={() => {
                  onUpdateSettings({ selectedSession: 'Pagi' });
                  setCurrentPageIndex(0);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  settings.selectedSession === 'Pagi'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                ☀️ Absensi Pagi ({attendees.filter(a => a.date === settings.selectedDate && a.session === 'Pagi').length})
              </button>
              <button
                onClick={() => {
                  onUpdateSettings({ selectedSession: 'Sore' });
                  setCurrentPageIndex(0);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  settings.selectedSession === 'Sore'
                    ? 'bg-white text-stone-900 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                🌙 Absensi Sore ({attendees.filter(a => a.date === settings.selectedDate && a.session === 'Sore').length})
              </button>
            </div>

            {/* Date Input */}
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="w-4 h-4 text-stone-400" />
              <input
                type="date"
                value={settings.selectedDate}
                onChange={(e) => {
                  onUpdateSettings({ selectedDate: e.target.value });
                  setCurrentPageIndex(0);
                }}
                className="px-2 py-1 rounded border border-stone-200 text-stone-800 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-stone-900"
              />
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={currentPageIndex === 0}
                className="p-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-stone-800 px-1">
                Hal {currentPageIndex + 1} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
                disabled={currentPageIndex >= totalPages - 1}
                className="p-1.5 rounded-lg border border-stone-200 text-stone-700 hover:bg-stone-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Canvas Display Viewport */}
          <div className="w-full bg-stone-200/70 border border-stone-300 rounded-2xl p-4 sm:p-6 flex flex-col items-center justify-center min-h-[520px] overflow-x-auto shadow-inner relative">
            {isRendering && (
              <div className="absolute top-4 right-4 bg-stone-900/80 text-white text-xs px-2.5 py-1 rounded-md backdrop-blur-sm flex items-center gap-1.5 z-10 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Memperbarui canvas...</span>
              </div>
            )}

            {/* Interactive Canvas Container */}
            <div className="relative shadow-2xl rounded-xl overflow-hidden max-w-full flex justify-center items-center bg-white">
              <canvas
                ref={canvasRef}
                className="max-h-[600px] sm:max-h-[640px] max-w-full w-auto h-auto object-contain transition-all duration-300 block"
                style={{
                  aspectRatio: settings.orientation === 'portrait' ? '1080 / 1350' : '1920 / 1080'
                }}
              />
            </div>

            {/* Page thumbnails strip if multiple pages */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center gap-2 overflow-x-auto py-2">
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const isCurrent = currentPageIndex === idx;
                  const countInPage = pages[idx]?.length || 0;
                  return (
                    <button
                      key={idx}
                      onClick={() => setCurrentPageIndex(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                        isCurrent
                          ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                          : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'
                      }`}
                    >
                      Halaman {idx + 1} ({countInPage} Foto)
                    </button>
                  );
                })}
              </div>
            )}

            {/* Info Summary below canvas */}
            <div className="mt-3 text-center text-xs text-stone-600">
              Menampilkan {pages[currentPageIndex]?.length || 0} dari total {activeAttendees.length} peserta pada sesi ini · Resolusi ekspor: {settings.orientation === 'portrait' ? '1080 × 1350 px (4:5)' : '1920 × 1080 px (16:9)'}
            </div>

            {/* Multi-page PDF Output Indicator */}
            <div className="w-full mt-3 bg-red-50/80 border border-red-200/90 rounded-xl p-3 flex items-start gap-3 text-left">
              <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0 font-bold text-xs shadow-xs">
                PDF
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-bold text-stone-900">
                    Output: 1 Dokumen PDF ({totalPages} Halaman)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-[10px] font-bold">
                    {totalPages === 1 ? '1 Gambar = 1 Hal.' : `${totalPages} Gambar = ${totalPages} Halaman`}
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 mt-0.5 leading-relaxed">
                  Setiap halaman memuat maksimal 6 foto peserta (grid 3×2). Semua {totalPages} halaman kolase disatukan menjadi <strong>1 file PDF utuh</strong> saat diekspor.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Settings & Customization Panel (lg:col-span-4) */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-stone-200 p-5 shadow-sm space-y-6">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <Sliders className="w-4 h-4 text-stone-700" />
            <h2 className="text-sm font-bold text-stone-900">Pengaturan Desain & Format</h2>
          </div>

          {/* 1. Template Bingkai Selection */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">
              Pilihan Desain Bingkai & Warna
            </label>
            <div className="grid grid-cols-1 gap-2.5">
              {/* Template A: Elegan Beige & Pilihan Warna */}
              <div
                onClick={() => onUpdateSettings({ template: 'beige' })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  settings.template === 'beige'
                    ? 'border-amber-600 bg-amber-50/50 ring-2 ring-amber-600/30'
                    : 'border-stone-200 hover:border-stone-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#F8F5EE] border border-[#D9CEB8] shrink-0 flex items-center justify-center">
                    <span className="text-amber-800 text-xs font-serif font-bold">A</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900">Elegan Beige (Referensi)</span>
                      {settings.template === 'beige' && <Check className="w-3.5 h-3.5 text-amber-700" />}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                      Bingkai klasik hangat, border ganda tipis, tipografi serif elegan.
                    </p>
                  </div>
                </div>

                {/* Pilihan Warna Bingkai A */}
                <div
                  className="mt-2.5 pt-2 border-t border-stone-200/70"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-semibold text-stone-500 block mb-1.5">
                    Pilihan Warna Bingkai A:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        {
                          id: 'classic_beige',
                          label: 'Krem Klasik (Default)',
                          bg: '#F8F5EE',
                          accent: '#B8860B',
                          border: '#D9CEB8'
                        },
                        {
                          id: 'sage_emerald',
                          label: 'Hijau Sage',
                          bg: '#E0EDE4',
                          accent: '#0F766E',
                          border: '#7FA98F'
                        },
                        {
                          id: 'rose_terracotta',
                          label: 'Rose Terakota',
                          bg: '#F9E5E1',
                          accent: '#BE123C',
                          border: '#C98A7E'
                        },
                        {
                          id: 'sky_azure',
                          label: 'Biru Langit',
                          bg: '#E1EEF9',
                          accent: '#0369A1',
                          border: '#7BAAD8'
                        },
                        {
                          id: 'lavender_plum',
                          label: 'Ungu Lavender',
                          bg: '#ECE4F5',
                          accent: '#7E22CE',
                          border: '#9F82C7'
                        }
                      ] as { id: FrameColorA; label: string; bg: string; accent: string; border: string }[]
                    ).map((opt) => {
                      const isActive =
                        settings.template === 'beige' &&
                        (settings.frameColorA || 'classic_beige') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ template: 'beige', frameColorA: opt.id })
                          }
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                            isActive
                              ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                              : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border"
                            style={{
                              background: `linear-gradient(135deg, ${opt.bg} 55%, ${opt.accent} 55%)`,
                              borderColor: opt.border
                            }}
                          />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Template B: Formal Instansi & Pilihan Warna */}
              <div
                onClick={() => onUpdateSettings({ template: 'formal' })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  settings.template === 'formal'
                    ? 'border-blue-800 bg-blue-50/50 ring-2 ring-blue-800/30'
                    : 'border-stone-200 hover:border-stone-300 bg-white'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#0B1D3A] text-white shrink-0 flex items-center justify-center font-bold text-xs">
                    B
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-stone-900">Formal Instansi</span>
                      {settings.template === 'formal' && <Check className="w-3.5 h-3.5 text-blue-800" />}
                    </div>
                    <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                      Header solid tegas, garis aksen kontras. Tampilan arsip kantor & instansi resmi.
                    </p>
                  </div>
                </div>

                {/* Pilihan Warna Bingkai B */}
                <div
                  className="mt-2.5 pt-2 border-t border-stone-200/70"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-semibold text-stone-500 block mb-1.5">
                    Pilihan Warna Bingkai B:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        {
                          id: 'navy_gold',
                          label: 'Biru Tua & Emas (Default)',
                          bg: '#0B1D3A',
                          accent: '#D4AF37'
                        },
                        {
                          id: 'emerald_gold',
                          label: 'Hijau Zamrud & Emas',
                          bg: '#064E3B',
                          accent: '#F59E0B'
                        },
                        {
                          id: 'maroon_gold',
                          label: 'Merah Marun & Emas',
                          bg: '#6B0F1A',
                          accent: '#FBBF24'
                        },
                        {
                          id: 'charcoal_cyan',
                          label: 'Hitam Arang & Sian',
                          bg: '#18181B',
                          accent: '#06B6D4'
                        },
                        {
                          id: 'royal_purple',
                          label: 'Ungu Royal & Perak',
                          bg: '#2E1065',
                          accent: '#C084FC'
                        }
                      ] as { id: FrameColorB; label: string; bg: string; accent: string }[]
                    ).map((opt) => {
                      const isActive =
                        settings.template === 'formal' &&
                        (settings.frameColorB || 'navy_gold') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ template: 'formal', frameColorB: opt.id })
                          }
                          className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                            isActive
                              ? 'bg-stone-900 text-white border-stone-900 shadow-xs'
                              : 'bg-white text-stone-700 border-stone-200 hover:border-stone-400'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0 border border-stone-300"
                            style={{
                              background: `linear-gradient(135deg, ${opt.bg} 60%, ${opt.accent} 60%)`
                            }}
                          />
                          <span>{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Template C: Minimalis Modern */}
              <button
                type="button"
                onClick={() => onUpdateSettings({ template: 'minimal' })}
                className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  settings.template === 'minimal'
                    ? 'border-stone-900 bg-stone-100 ring-2 ring-stone-900/30'
                    : 'border-stone-200 hover:border-stone-300 bg-white'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-white border border-stone-300 text-stone-900 shrink-0 flex items-center justify-center font-bold text-xs">
                  C
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-900">Minimalis Modern</span>
                    {settings.template === 'minimal' && <Check className="w-3.5 h-3.5 text-stone-900" />}
                  </div>
                  <p className="text-[11px] text-stone-500 mt-0.5 leading-snug">
                    Latar putih bersih, garis tipis presisi, kontras tinggi dan ringan.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Orientasi Gambar */}
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-2">
              Orientasi Gambar Kolase
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onUpdateSettings({ orientation: 'portrait' })}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold text-center transition-all ${
                  settings.orientation === 'portrait'
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <span>📱 Potret 4:5</span>
                <span className="block text-[10px] opacity-80">1080 × 1350 (WhatsApp)</span>
              </button>
              <button
                type="button"
                onClick={() => onUpdateSettings({ orientation: 'landscape' })}
                className={`py-2 px-3 rounded-lg border text-xs font-semibold text-center transition-all ${
                  settings.orientation === 'landscape'
                    ? 'border-stone-900 bg-stone-900 text-white'
                    : 'border-stone-200 text-stone-700 hover:bg-stone-50'
                }`}
              >
                <span>🖥️ Lanskap 16:9</span>
                <span className="block text-[10px] opacity-80">1920 × 1080 (Laporan)</span>
              </button>
            </div>
          </div>

          {/* 3. Identitas Instansi & Header */}
          <div className="space-y-3 border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-bold text-stone-700">
                Identitas Instansi / Organisasi
              </label>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                  permanentSaveStatus === 'saving'
                    ? 'bg-amber-100 text-amber-800'
                    : permanentSaveStatus === 'error'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
                title="Tersimpan permanen di file app-settings.json (tidak hilang meski cache browser dihapus)"
              >
                <HardDrive className="w-3 h-3" />
                {permanentSaveStatus === 'saving'
                  ? 'Menyimpan...'
                  : permanentSaveStatus === 'error'
                  ? 'Lokal'
                  : 'Tersimpan Permanen'}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-stone-500 mb-1 block">Nama Instansi</span>
              <input
                type="text"
                value={settings.institutionName}
                onChange={(e) => onUpdateSettings({ institutionName: e.target.value })}
                placeholder="Contoh: RSUD H. ABDUL MANAP KOTA JAMBI"
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 text-stone-900 text-xs focus:outline-none focus:ring-1 focus:ring-stone-900"
              />
            </div>
            <div>
              <span className="text-[11px] text-stone-500 mb-1 block">Sub-Unit Kerja (Opsional)</span>
              <input
                type="text"
                value={settings.unitName}
                onChange={(e) => onUpdateSettings({ unitName: e.target.value })}
                placeholder="Contoh: SUBBAG UMUM, HUMAS, DAN REKAM MEDIS"
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 text-stone-900 text-xs focus:outline-none focus:ring-1 focus:ring-stone-900"
              />
            </div>
            <div>
              <span className="text-[11px] text-stone-500 mb-1 block">Catatan / Slogan Footer</span>
              <input
                type="text"
                value={settings.footerNote}
                onChange={(e) => onUpdateSettings({ footerNote: e.target.value })}
                placeholder="Contoh: RSUD H. ABDUL MANAP KOTA JAMBI"
                className="w-full px-3 py-1.5 rounded-lg border border-stone-300 text-stone-900 text-xs focus:outline-none focus:ring-1 focus:ring-stone-900"
              />
            </div>
            {onSavePermanent && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await onSavePermanent();
                  if (ok) {
                    showToast('✅ 3 Input Identitas Instansi berhasil disimpan permanen ke file app-settings.json!');
                  } else {
                    showToast('Gagal menyimpan ke file disk.');
                  }
                }}
                className="w-full py-1.5 px-3 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
              >
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
                <span>Simpan Permanen Identitas Instansi</span>
              </button>
            )}
          </div>

          {/* 4. Kebijakan Duplikasi NIP */}
          <div className="border-t border-stone-100 pt-3">
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Aturan Jika NIP Mengisi 2x di Sesi Sama
            </label>
            <select
              value={settings.duplicatePolicy}
              onChange={(e) => onUpdateSettings({ duplicatePolicy: e.target.value as any })}
              className="w-full px-3 py-2 rounded-lg border border-stone-300 text-stone-900 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-stone-900"
            >
              <option value="overwrite">Timpa dengan Absensi Terbaru (Default)</option>
              <option value="reject">Tolak Duplikasi (Hanya absensi pertama yang sah)</option>
              <option value="flag">Simpan & Tandai Duplikat (Untuk verifikasi admin)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
