/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Copy,
  Check,
  Code2,
  FolderGit2,
  CheckCircle2,
  FileCode,
  Clock,
  Sparkles
} from 'lucide-react';
import { getGoogleAppsScriptCode } from '../utils/googleAppsScriptTemplate.ts';

function formatCurrentWibDate(): string {
  const bulanIndo = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
  ];
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    });
    const parts = formatter.formatToParts(new Date());
    const day = parts.find((p) => p.type === 'day')?.value || '26';
    const monthIdx = parseInt(parts.find((p) => p.type === 'month')?.value || '11', 10) - 1;
    const year = parts.find((p) => p.type === 'year')?.value || '2026';
    return `${parseInt(day, 10)} ${bulanIndo[monthIdx] || 'November'} ${year}`;
  } catch {
    const now = new Date();
    return `${now.getDate()} ${bulanIndo[now.getMonth()]} ${now.getFullYear()}`;
  }
}

export const GasSetupModal: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'code' | 'guide' | 'structure'>('code');
  const [formTitlePrefix, setFormTitlePrefix] = useState<string>('Absensi MOOC');

  const todayWibStr = useMemo(() => formatCurrentWibDate(), []);
  const scriptCode = useMemo(
    () => getGoogleAppsScriptCode(formTitlePrefix),
    [formTitlePrefix]
  );

  const previewFullTitle = `${(formTitlePrefix || 'Absensi MOOC').trim()} ${todayWibStr}`;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(scriptCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = scriptCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6">
      {/* Header Info */}
      <div className="mb-6 bg-white rounded-xl border border-stone-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
          <Code2 className="w-4 h-4 text-amber-600" />
          <span>Integrasi Google Workspace & Judul Tanggal Otomatis (WIB)</span>
        </div>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
          Kode Google Apps Script & Otomatisasi Judul Tanggal Form
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Script ini otomatis memperbarui <strong>Judul Header Google Form</strong> mengikuti tanggal hari ini sesuai zona waktu <strong>WIB (Asia/Jakarta)</strong> setiap jam <strong>00:00 WIB (12 malam)</strong>, sekaligus mengolah kolase presensi.
        </p>

        {/* Konfigurasi Awalan Judul Google Form Dinamis */}
        <div className="mt-5 p-4 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="text-xs font-bold text-stone-900">
                Kustomisasi Judul Header Google Form Dinamis (Otomatis Ganti Tanggal Jam 00:00 WIB)
              </span>
            </div>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              <Sparkles className="w-3 h-3" />
              Zona Waktu: Asia/Jakarta (WIB)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-stone-600 mb-1">
                Awalan Judul Google Form (Sebelum Tanggal):
              </label>
              <input
                type="text"
                value={formTitlePrefix}
                onChange={(e) => setFormTitlePrefix(e.target.value)}
                placeholder="Contoh: Absen Tes"
                className="w-full px-3 py-2 rounded-lg border border-stone-300 bg-white text-stone-900 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-stone-900"
              />
            </div>

            <div className="p-2.5 rounded-lg bg-white border border-stone-200">
              <span className="block text-[10px] text-stone-500 font-medium">
                Pratinjau Judul Header Google Form Hari Ini (WIB):
              </span>
              <span className="block text-xs sm:text-sm font-bold text-emerald-700 mt-0.5 truncate">
                {previewFullTitle}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-stone-600 leading-relaxed">
            Setiap kali Anda mengubah awalan di atas, variabel <code>AWALAN_JUDUL_FORM</code> di dalam kode script di bawah otomatis ikut berubah. Saat jam 12 malam (00:00 WIB), tanggal pada judul Google Form akan berganti otomatis ke hari berikutnya.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="mt-5 flex items-center gap-2 border-b border-stone-100 pb-2 overflow-x-auto whitespace-nowrap">
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'code'
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <FileCode className="w-4 h-4 shrink-0" />
            <span>Kode Script Lengkap (.gs)</span>
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'guide'
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Panduan Pasang & Trigger 00:00 WIB</span>
          </button>
          <button
            onClick={() => setActiveTab('structure')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 shrink-0 ${
              activeTab === 'structure'
                ? 'bg-stone-900 text-white'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <FolderGit2 className="w-4 h-4 shrink-0" />
            <span>Struktur Sheets & Drive</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Code */}
      {activeTab === 'code' && (
        <div className="bg-stone-950 text-stone-100 rounded-xl border border-stone-800 shadow-xl overflow-hidden">
          <div className="bg-stone-900/90 border-b border-stone-800 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
              <span className="text-xs font-mono text-stone-400 ml-2">Code.gs</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-800 hover:bg-stone-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Tersalin ke Clipboard!' : 'Salin Seluruh Kode'}</span>
            </button>
          </div>
          <pre className="p-4 text-xs font-mono overflow-x-auto text-stone-300 max-h-[600px] leading-relaxed">
            <code>{scriptCode}</code>
          </pre>
        </div>
      )}

      {/* Tab 2: Step-by-step Guide */}
      {activeTab === 'guide' && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm space-y-6">
          <h2 className="text-base font-bold text-stone-900">
            Panduan Menghubungkan Google Form & Mengaktifkan Ganti Tanggal Otomatis Jam 00:00 WIB
          </h2>

          {/* Aturan Penulisan Tanggal Otomatis (Valid vs Gagal) */}
          <div className="border border-stone-200 rounded-xl p-4 bg-stone-50 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                📌 Aturan Penulisan Tanggal pada Judul Header Google Form
              </h3>
              <p className="text-xs text-stone-600 mt-0.5">
                Agar tanggal pada judul Google Form dapat dikenali dan diganti otomatis setiap jam <strong>00:00 WIB</strong>, gunakan format: <code className="px-1.5 py-0.5 bg-white border border-stone-200 rounded font-bold text-stone-900">[Tanggal 1–31] [Spasi] [Nama Bulan] [Spasi] [Tahun 4 Digit]</code>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Kolom Bisa Terbaca */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <span>✅ CONTOH YANG BISA TERBACA (BERHASIL)</span>
                </div>
                <ul className="text-xs text-emerald-800 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>
                    <strong>Tanggal di Belakang:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi MOOC 26 November 2026</code>
                  </li>
                  <li>
                    <strong>Tanggal di Depan:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">12 Desember 2026 Absensi Pegawai RSUD</code>
                  </li>
                  <li>
                    <strong>Tanggal di Tengah:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi 26 November 2026 Unit Umum</code>
                  </li>
                  <li>
                    <strong>Bulan Indonesia, Inggris, atau Singkatan 3 Huruf:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">26 November 2026</code>, <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">12 December 2026</code>, <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">26 Nov 2026</code>, <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">12 Des 2026</code>
                  </li>
                  <li>
                    <strong>Huruf Besar / Kecil Bebas:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi 26 november 2026</code> atau <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">26 NOVEMBER 2026</code>
                  </li>
                  <li>
                    <strong>Tanpa Tanggal Sama Sekali:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi MOOC</code> <em>(otomatis ditambah tanggal di belakangnya)</em>
                  </li>
                </ul>
              </div>

              {/* Kolom Gagal Terbaca */}
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2">
                <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <span>❌ CONTOH YANG GAGAL TERBACA (JANGAN DIGUNAKAN)</span>
                </div>
                <ul className="text-xs text-rose-800 space-y-1.5 list-disc list-inside leading-relaxed">
                  <li>
                    <strong>Bulan Ditulis Angka / Garis Miring / Strip:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi 26/11/2026</code> atau <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi 26-11-2026</code>
                  </li>
                  <li>
                    <strong>Tahun Hanya 2 Digit (Bukan 4 Digit):</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi 26 November 26</code> <em>(wajib <code>2026</code>)</em>
                  </li>
                  <li>
                    <strong>Tidak Lengkap (Tanpa Tahun / Tanpa Tanggal):</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi 26 November</code> atau <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi November 2026</code>
                  </li>
                  <li>
                    <strong>Salah Ejaan Bulan (Tidak Baku) / Tanpa Spasi:</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi 26 Nopember 2026</code> / <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">26Nov2026</code>
                  </li>
                  <li>
                    <strong>Bulan di Depan Tanggal (Format Amerika):</strong><br />
                    <code className="font-mono bg-white/80 px-1.5 py-0.5 rounded">Absensi November 26, 2026</code>
                  </li>
                </ul>
                <p className="text-[11px] text-rose-700 pt-1 border-t border-rose-200/70">
                  *Jika format tanggal gagal dikenali, script akan menganggap judul belum punya tanggal lalu menambahkan tanggal baru di bagian paling belakang judul.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="border border-stone-200 rounded-xl p-4 flex items-start gap-4 hover:border-stone-300 transition-colors">
              <div className="w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-stone-900">Buat Google Form & Hubungkan ke Spreadsheet</h3>
                <p className="text-xs text-stone-600 mt-1">
                  Buka <strong>forms.google.com</strong>, buat formulir dengan 4 pertanyaan berikut, lalu di tab <strong>Jawaban (Responses)</strong> klik <strong>Link to Sheets (Hubungkan ke Spreadsheet)</strong>:
                </p>
                <ul className="mt-2 text-xs text-stone-600 list-disc list-inside space-y-1 bg-stone-50 p-3 rounded-lg border border-stone-100">
                  <li><strong>Pertanyaan 1 (Kolom B):</strong> NIP (Jawaban Singkat, Wajib Diisi)</li>
                  <li><strong>Pertanyaan 2 (Kolom C):</strong> Nama Lengkap & Gelar (Jawaban Singkat, Wajib Diisi)</li>
                  <li><strong>Pertanyaan 3 (Kolom D):</strong> Sesi Absensi (Pilihan Ganda: <em>Pagi</em> dan <em>Sore</em>, Wajib Diisi)</li>
                  <li><strong>Pertanyaan 4 (Kolom E):</strong> Unggah Foto Diri / Bukti Kehadiran (Upload File, Wajib Diisi)</li>
                </ul>
              </div>
            </div>

            {/* Step 2 */}
            <div className="border border-stone-200 rounded-xl p-4 flex items-start gap-4 hover:border-stone-300 transition-colors">
              <div className="w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-stone-900">Tempel Kode Apps Script di Spreadsheet</h3>
                <p className="text-xs text-stone-600 mt-1">
                  Di Google Spreadsheet jawaban Form tersebut, klik menu <strong>Ekstensi (Extensions) &gt; Apps Script</strong>. Hapus seluruh kode bawaan, lalu tempel kode dari tab <strong>Kode Script Lengkap (.gs)</strong> dan tekan <strong>Ctrl + S</strong> (Simpan).
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="border border-stone-200 rounded-xl p-4 flex items-start gap-4 hover:border-stone-300 transition-colors">
              <div className="w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-stone-900">
                  Klik "Jalankan (Run)" pada Fungsi <code>inisialisasiSpreadsheet</code>
                </h3>
                <p className="text-xs text-stone-600 mt-1">
                  Pastikan dropdown fungsi di atas editor memilih <code>inisialisasiSpreadsheet</code> (sudah otomatis paling atas), lalu klik <strong>Jalankan (Run)</strong> dan berikan izin akses (Review Permissions &gt; Allow).
                </p>
                <div className="mt-2 bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-xs text-emerald-800 space-y-1">
                  <div className="font-bold">Apa yang otomatis terjadi saat Anda klik Run?</div>
                  <div>1. Judul Header Google Form Anda langsung berubah menjadi <strong>"{previewFullTitle}"</strong>.</div>
                  <div>2. Script otomatis membuat jadwal harian (Time-driven Trigger) pada zona waktu <strong>Asia/Jakarta (WIB)</strong> yang berjalan setiap pukul <strong>00:00 WIB (12 malam)</strong> untuk mengganti tanggal judul Google Form ke hari berikutnya.</div>
                  <div>3. Membuat tab sheet <code>PENGATURAN</code> (Anda juga bisa mengubah teks awalan judul kapan saja lewat sel <code>AWALAN_JUDUL_FORM</code> di sheet <code>PENGATURAN</code>).</div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="border border-stone-200 rounded-xl p-4 flex items-start gap-4 hover:border-stone-300 transition-colors">
              <div className="w-7 h-7 rounded-full bg-stone-900 text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-stone-900">
                  Cara Cek / Pasang Manual Pemicu (Triggers) di Panel Kiri Apps Script
                </h3>
                <p className="text-xs text-stone-600 mt-1">
                  Buka menu ikon jam (<strong>Triggers / Pemicu</strong>) di panel kiri Apps Script. Pastikan terdapat pemicu berikut:
                </p>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-stone-50 p-3 rounded-lg border border-stone-100 text-xs text-stone-700 space-y-1 font-mono">
                    <div className="font-bold text-stone-900 font-sans">A. Pemicu Ganti Tanggal Jam 12 Malam (Otomatis Terpasang):</div>
                    <div>• Fungsi: updateJudulFormHarian</div>
                    <div>• Sumber acara: Dipicu waktu (Time-driven)</div>
                    <div>• Jenis: Timer harian (Day timer)</div>
                    <div>• Waktu: Tengah malam hingga 01.00 (00:00 WIB)</div>
                  </div>
                  <div className="bg-stone-50 p-3 rounded-lg border border-stone-100 text-xs text-stone-700 space-y-1 font-mono">
                    <div className="font-bold text-stone-900 font-sans">B. Pemicu Saat Peserta Mengirim Form:</div>
                    <div>• Fungsi: onFormSubmitTrigger</div>
                    <div>• Sumber acara: Dari spreadsheet</div>
                    <div>• Jenis acara: Saat mengirim formulir (On form submit)</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Structure */}
      {activeTab === 'structure' && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm space-y-6">
          <h2 className="text-base font-bold text-stone-900">
            Struktur Data Google Sheets & Folder Google Drive
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sheet Structure */}
            <div className="border border-stone-200 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                1. Struktur Kolom Google Sheets
              </h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2 bg-stone-50 rounded border border-stone-100">
                  <span className="font-bold text-stone-900">Kolom A:</span> Timestamp (Waktu Otomatis)
                </div>
                <div className="p-2 bg-stone-50 rounded border border-stone-100">
                  <span className="font-bold text-stone-900">Kolom B:</span> NIP Peserta (Contoh: 19880315...)
                </div>
                <div className="p-2 bg-stone-50 rounded border border-stone-100">
                  <span className="font-bold text-stone-900">Kolom C:</span> Nama Lengkap & Gelar
                </div>
                <div className="p-2 bg-stone-50 rounded border border-stone-100">
                  <span className="font-bold text-stone-900">Kolom D:</span> Sesi Absensi (Pagi / Sore)
                </div>
                <div className="p-2 bg-stone-50 rounded border border-stone-100">
                  <span className="font-bold text-stone-900">Kolom E:</span> Unggah Foto Diri / Bukti Kehadiran
                </div>
                <div className="p-2 bg-stone-50 rounded border border-stone-100">
                  <span className="font-bold text-stone-900">Kolom F:</span> Status Pemrosesan Kolase
                </div>
              </div>
            </div>

            {/* Drive Structure */}
            <div className="border border-stone-200 rounded-xl p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                2. Struktur Otomatis Folder Google Drive
              </h3>
              <div className="bg-stone-900 text-stone-200 p-3.5 rounded-lg font-mono text-xs leading-relaxed overflow-x-auto">
                <div className="text-amber-400 font-bold">DOKUMENTASI ABSENSI KOLASE/</div>
                <div className="ml-4 text-stone-400">├── 2026-11-26/</div>
                <div className="ml-8 text-stone-300">├── PAGI/</div>
                <div className="ml-12 text-emerald-400">└── Dokumentasi_Absensi_Kolase_2026-11-26_Pagi_(2_Halaman).pdf</div>
                <div className="ml-8 text-stone-300">└── SORE/</div>
                <div className="ml-12 text-emerald-400">└── Dokumentasi_Absensi_Kolase_2026-11-26_Sore_(1_Halaman).pdf</div>
                <div className="ml-4 text-stone-400">└── 2026-11-27/</div>
              </div>
              <p className="text-xs text-stone-500 mt-3">
                File PDF multi-halaman diperbarui secara otomatis setiap kali peserta baru mengisi form.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
