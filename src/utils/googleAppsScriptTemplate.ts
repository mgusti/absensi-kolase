/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function getGoogleAppsScriptCode(formTitlePrefix = 'Absensi MOOC'): string {
  const safePrefix = (formTitlePrefix || 'Absensi MOOC').replace(/"/g, '\\"').trim();

  return `/**
 * =========================================================================
 * ABSENSI KOLASE - GOOGLE APPS SCRIPT AUTOMATION
 * (Termasuk Fitur Update Judul Tanggal Google Form Otomatis Setiap 00:00 WIB)
 * =========================================================================
 * 
 * STRUKTUR KOLOM SHEET:
 * - Kolom A (1): Timestamp
 * - Kolom B (2): NIP
 * - Kolom C (3): Nama Lengkap & Gelar
 * - Kolom D (4): Sesi Absensi (Pagi / Sore)
 * - Kolom E (5): Unggah Foto Diri / Bukti Kehadiran (URL Google Drive)
 * - Kolom F (6): Status Pemrosesan Kolase (Otomatis diisi script)
 *
 * FITUR JUDUL GOOGLE FORM DINAMIS (WIB):
 * - Mengubah judul header Google Form otomatis mengikuti tanggal hari ini (WIB / GMT+7)
 *   setiap jam 12 malam (00:00 WIB) tanpa perlu diubah manual.
 * - Rumus Tanggal Wajib: [Tanggal 1-31] [Spasi] [Nama Bulan] [Spasi] [Tahun 4 Digit]
 *
 * ✅ CONTOH JUDUL YANG BISA TERBACA (VALID):
 *   1. Tanggal di belakang : "Absensi MOOC 26 November 2026"
 *   2. Tanggal di depan    : "12 Desember 2026 Absensi Pegawai RSUD"
 *   3. Tanggal di tengah   : "Absensi 26 November 2026 Unit Umum"
 *   4. Bulan Indo/Inggris/Singkatan: "26 November 2026", "12 December 2026", "26 Nov 2026", "12 Des 2026"
 *   5. Tanpa tanggal       : "Absensi MOOC" (otomatis ditambah tanggal di belakangnya)
 *
 * ❌ CONTOH JUDUL YANG GAGAL TERBACA:
 *   1. Format angka/strip/garis miring : "Absensi 26/11/2026" atau "Absensi 26-11-2026"
 *   2. Tahun hanya 2 digit             : "Absensi 26 November 26" (harus 2026)
 *   3. Tanpa tahun / tanpa tanggal     : "Absensi 26 November" atau "Absensi November 2026"
 *   4. Typo bulan / tanpa spasi        : "Absensi 26 Nopember 2026" atau "Absensi 26Nov2026"
 *   5. Bulan di depan tanggal (US)     : "Absensi November 26, 2026"
 *
 * PANDUAN PEMASANGAN:
 * 1. Buka Google Sheets yang sudah terhubung (linked) dengan Google Form Anda
 * 2. Klik menu 'Ekstensi' (Extensions) > 'Apps Script'
 * 3. Hapus kode default, lalu tempel (paste) seluruh kode ini
 * 4. Tekan Ctrl+S (Simpan)
 * 5. Klik tombol 'Jalankan' (Run) pada fungsi 'inisialisasiSpreadsheet' (paling atas).
 *    -> Fungsi ini otomatis:
 *       a) Membuat sheet PENGATURAN
 *       b) Memperbarui judul Google Form ke tanggal hari ini (WIB)
 *       c) Memasang jadwal otomatis ganti tanggal setiap jam 00:00 WIB
 * =========================================================================
 */

// Konfigurasi Default Sistem
const CONFIG = {
  AWALAN_JUDUL_FORM: "${safePrefix}", // Hasil: "${safePrefix} 26 November 2026"
  ZONA_WAKTU_WIB: "Asia/Jakarta",    // Waktu Indonesia Barat (GMT+7)
  URL_GOOGLE_FORM: "",               // Kosongkan jika Sheet sudah terhubung langsung ke Form
  FOLDER_INDUK: "DOKUMENTASI ABSENSI KOLASE",
  MAKS_FOTO_PER_HALAMAN: 6,
  KOLOM_TIMESTAMP: 1, // Kolom A
  KOLOM_NIP: 2,       // Kolom B
  KOLOM_NAMA: 3,      // Kolom C
  KOLOM_SESI: 4,      // Kolom D (Sesi Absensi: Pagi / Sore)
  KOLOM_FOTO: 5,      // Kolom E (Unggah Foto Diri / Bukti Kehadiran)
  KOLOM_STATUS: 6,    // Kolom F (Status)
  ATURAN_DUPLIKAT: "TIMPA" // Pilihan: "TIMPA" | "TOLAK" | "TANDAI"
};

/**
 * 1. FUNGSI UTAMA INISIALISASI (Ditempatkan paling atas agar otomatis terpilih saat klik Run)
 *    Sekali klik Run, otomatis menyiapkan Sheet PENGATURAN, memperbarui judul tanggal Google Form,
 *    dan memasang trigger harian jam 00:00 WIB.
 */
function inisialisasiSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    Logger.log("Pastikan script ini dipasang melalui menu Extensions > Apps Script dari dalam Google Sheets.");
    return;
  }

  let sheetPengaturan = ss.getSheetByName("PENGATURAN");
  
  if (!sheetPengaturan) {
    sheetPengaturan = ss.insertSheet("PENGATURAN");
    const dataAwal = [
      ["PARAMETER", "NILAI", "KETERANGAN"],
      ["AWALAN_JUDUL_FORM", CONFIG.AWALAN_JUDUL_FORM, "Teks di depan tanggal pada judul Header Google Form"],
      ["URL_GOOGLE_FORM", CONFIG.URL_GOOGLE_FORM, "Opsional: Isi URL Edit Google Form jika Form tidak di-link ke Sheet ini"],
      ["NAMA_INSTANSI", "RSUD H. ABDUL MANAP KOTA JAMBI", "Nama instansi di header kolase"],
      ["UNIT_KERJA", "SUBBAG UMUM, HUMAS, DAN REKAM MEDIS", "Unit / Kategori Presensi"],
      ["TEMA_BINGKAI", "ELEGAN_BEIGE", "Pilihan: ELEGAN_BEIGE | FORMAL_INSTANSI | MINIMALIS"],
      ["ATURAN_DUPLIKAT", "TIMPA", "Pilihan: TIMPA | TOLAK | TANDAI"],
      ["ORIENTASI", "PORTRAIT", "PORTRAIT (1080x1350) atau LANDSCAPE (1920x1080)"],
      ["SLOGAN_FOOTER", "RSUD H. ABDUL MANAP KOTA JAMBI", "Catatan footer di bawah gambar"]
    ];
    sheetPengaturan.getRange(1, 1, dataAwal.length, 3).setValues(dataAwal);
    sheetPengaturan.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#F1F5F9");
    sheetPengaturan.autoResizeColumns(1, 3);
  }

  // Update judul Google Form ke tanggal hari ini (WIB)
  const hasilJudul = updateJudulFormHarian(true);

  // Pasang trigger otomatis ganti tanggal setiap jam 00:00 WIB
  pasangTriggerJudulOtomatisWIB(true);

  tampilkanPesan(
    "✅ Inisialisasi Selesai!\\n\\n" +
    "1. Sheet 'PENGATURAN' siap digunakan.\\n" +
    "2. " + hasilJudul + "\\n" +
    "3. Jadwal otomatis ganti tanggal Google Form setiap jam 00:00 WIB sudah aktif!"
  );
}

/**
 * 2. FITUR UPDATE JUDUL HEADER GOOGLE FORM OTOMATIS SESUAI TANGGAL WIB
 *    Contoh hasil: "${safePrefix} 26 November 2026"
 */
function formatTanggalIndonesiaWIB(dateObj) {
  const daftarBulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  // Paksa menggunakan zona waktu WIB (Asia/Jakarta, GMT+7)
  const strWib = Utilities.formatDate(dateObj || new Date(), CONFIG.ZONA_WAKTU_WIB, "d-M-yyyy");
  const bagian = strWib.split("-");
  const tanggal = parseInt(bagian[0], 10);
  const namaBulan = daftarBulan[parseInt(bagian[1], 10) - 1];
  const tahun = bagian[2];
  return tanggal + " " + namaBulan + " " + tahun;
}

/**
 * Mengambil nilai parameter dari sheet PENGATURAN (fallback ke CONFIG jika belum ada)
 */
function ambilNilaiPengaturan(kunci, nilaiDefault) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return nilaiDefault;
    const sheet = ss.getSheetByName("PENGATURAN");
    if (!sheet) return nilaiDefault;
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === String(kunci).toUpperCase()) {
        const val = String(rows[i][1] || "").trim();
        return val !== "" ? val : nilaiDefault;
      }
    }
  } catch (e) {
    // fallback ke default
  }
  return nilaiDefault;
}

/**
 * Mencari objek Google Form yang terhubung ke Spreadsheet ini
 */
function dapatkanGoogleFormTerkait() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let formUrl = "";

  // 1. Cek form yang terhubung langsung ke Spreadsheet
  if (ss) {
    formUrl = ss.getFormUrl() || "";
    if (!formUrl) {
      const sheets = ss.getSheets();
      for (let i = 0; i < sheets.length; i++) {
        const u = sheets[i].getFormUrl();
        if (u) {
          formUrl = u;
          break;
        }
      }
    }
  }

  // 2. Fallback: cek URL_GOOGLE_FORM di sheet PENGATURAN atau CONFIG
  if (!formUrl) {
    formUrl = ambilNilaiPengaturan("URL_GOOGLE_FORM", CONFIG.URL_GOOGLE_FORM);
  }

  if (!formUrl) return null;

  try {
    return FormApp.openByUrl(formUrl);
  } catch (e) {
    // Jika yang dimasukkan adalah ID Form atau URL memerlukan ekstraksi ID
    const match = String(formUrl).match(/[-\\w]{25,}/);
    if (match) {
      return FormApp.openById(match[0]);
    }
    throw e;
  }
}

/**
 * Fungsi yang dijalankan otomatis setiap jam 00:00 WIB (atau saat diklik manual)
 * untuk memperbarui tanggal pada judul header Google Form sesuai tanggal hari ini (WIB).
 * - Mendukung posisi tanggal di mana saja (di depan, di tengah, maupun di belakang judul).
 * - Contoh 1 (di belakang): "Absensi MOOC 26 November 2026" -> "Absensi MOOC 27 November 2026"
 * - Contoh 2 (di depan): "12 Desember 2026 Absensi Pegawai RSUD" -> "27 November 2026 Absensi Pegawai RSUD"
 * - Contoh 3 (di tengah): "Absensi 12 Desember 2026 Pegawai RSUD" -> "Absensi 27 November 2026 Pegawai RSUD"
 * - Mengenali nama bulan Bahasa Indonesia, Bahasa Inggris, maupun singkatan (Jan, Feb, Agu, Okt, Des, dll).
 */
function updateJudulFormHarian(tanpaAlert) {
  try {
    const form = dapatkanGoogleFormTerkait();
    if (!form) {
      const msg = "⚠️ Google Form belum terdeteksi. Pastikan Google Form sudah dihubungkan (Link to Sheets) ke Spreadsheet ini.";
      if (!tanpaAlert) tampilkanPesan(msg);
      Logger.log(msg);
      return msg;
    }

    const tanggalWib = formatTanggalIndonesiaWIB(new Date());
    const judulSaatIni = String(form.getTitle() || "").trim();

    // Pola pendeteksi tanggal di posisi mana saja (depan, tengah, atau belakang):
    // Mendukung Bulan Indonesia, Inggris, dan singkatan 3 huruf
    const polaTanggalFleksibel = /\\b\\d{1,2}\\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|January|February|March|May|June|July|August|October|December|Jan|Feb|Mar|Apr|Jun|Jul|Agu|Aug|Sep|Sept|Okt|Oct|Nov|Des|Dec)\\s+\\d{4}\\b/i;

    let judulBaru = "";
    if (polaTanggalFleksibel.test(judulSaatIni)) {
      // Ganti tepat di posisi tanggal tersebut berada (baik di depan, tengah, maupun belakang)
      judulBaru = judulSaatIni.replace(polaTanggalFleksibel, tanggalWib).trim();
    } else if (judulSaatIni) {
      // Jika judul belum memiliki tanggal, tambahkan tanggal hari ini di belakang judul
      judulBaru = (judulSaatIni + " " + tanggalWib).trim();
    } else {
      const awalanDefault = ambilNilaiPengaturan("AWALAN_JUDUL_FORM", CONFIG.AWALAN_JUDUL_FORM);
      judulBaru = (awalanDefault + " " + tanggalWib).trim();
    }

    if (judulSaatIni !== judulBaru) {
      form.setTitle(judulBaru);
    }

    const pesanSukses = "Judul Google Form aktif: '" + judulBaru + "'";
    Logger.log("✅ " + pesanSukses);
    if (!tanpaAlert) {
      tampilkanPesan("✅ " + pesanSukses);
    }
    return pesanSukses;
  } catch (err) {
    const pesanErr = "Gagal memperbarui judul Google Form: " + err.toString();
    Logger.log("❌ " + pesanErr);
    if (!tanpaAlert) {
      tampilkanPesan("❌ " + pesanErr);
    }
    return pesanErr;
  }
}

/**
 * Memasang Pemicu Waktu (Time-Driven Trigger) otomatis setiap jam 00:00 WIB
 * agar judul tanggal Google Form selalu berganti sendiri setiap tengah malam.
 */
function pasangTriggerJudulOtomatisWIB(tanpaAlert) {
  const namaFungsi = "updateJudulFormHarian";
  const triggers = ScriptApp.getProjectTriggers();

  // Hapus trigger lama dengan nama fungsi yang sama agar tidak dobel
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === namaFungsi) {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Buat trigger harian baru pada jam 00:00 - 01:00 WIB (Asia/Jakarta)
  ScriptApp.newTrigger(namaFungsi)
    .timeBased()
    .inTimezone(CONFIG.ZONA_WAKTU_WIB)
    .everyDays(1)
    .atHour(0)
    .nearMinute(1)
    .create();

  const msg = "✅ Trigger otomatis berhasil dipasang! Judul Google Form akan otomatis berganti tanggal setiap jam 00:00 WIB.";
  Logger.log(msg);
  if (!tanpaAlert) {
    tampilkanPesan(msg);
  }
}

/**
 * Helper menampilkan pesan (aman dijalankan baik dari Editor Apps Script maupun dari Sheet)
 */
function tampilkanPesan(pesan) {
  Logger.log(pesan);
  try {
    SpreadsheetApp.getUi().alert(pesan);
  } catch (e) {
    // Abaikan jika dijalankan langsung dari dalam Editor Apps Script tanpa UI Sheet
  }
}

/**
 * Helper mengambil sheet utama berisi respons Google Form (bukan sheet PENGATURAN)
 */
function dapatkanSheetRespons() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  const active = ss.getActiveSheet();
  if (active && active.getName() !== "PENGATURAN") {
    return active;
  }
  const allSheets = ss.getSheets();
  for (let i = 0; i < allSheets.length; i++) {
    if (allSheets[i].getName() !== "PENGATURAN") {
      return allSheets[i];
    }
  }
  return active;
}

/**
 * 3. Deteksi Indeks Kolom Otomatis berdasarkan Nama Header di Baris 1
 */
function getHeaderMap(sheet) {
  const targetSheet = sheet || dapatkanSheetRespons();
  const map = { ...CONFIG };
  if (!targetSheet) return map;

  const lastCol = Math.max(6, targetSheet.getLastColumn());
  const headers = targetSheet.getRange(1, 1, 1, lastCol).getValues()[0];

  headers.forEach((h, i) => {
    const text = String(h).trim().toLowerCase();
    if (text.includes('timestamp') || text.includes('waktu')) map.KOLOM_TIMESTAMP = i + 1;
    else if (text.includes('nip')) map.KOLOM_NIP = i + 1;
    else if (text.includes('nama')) map.KOLOM_NAMA = i + 1;
    else if (text.includes('sesi')) map.KOLOM_SESI = i + 1;
    else if (text.includes('foto') || text.includes('bukti') || text.includes('unggah')) map.KOLOM_FOTO = i + 1;
    else if (text.includes('status')) map.KOLOM_STATUS = i + 1;
  });

  return map;
}

/**
 * 4. Menu Kustom di Google Sheets
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('📸 Absensi Kolase')
      .addItem('🔄 Perbarui Judul Tanggal Form Sekarang (WIB)', 'updateJudulFormHarian')
      .addItem('⏰ Aktifkan Otomatis Ganti Tanggal Jam 00:00 WIB', 'pasangTriggerJudulOtomatisWIB')
      .addSeparator()
      .addItem('▶️ Sign / Buat Kolase Sekarang', 'tombolSignKolase')
      .addItem('⚙️ Inisialisasi Sheet Pengaturan', 'inisialisasiSpreadsheet')
      .addItem('📁 Buka Folder Google Drive Kolase', 'bukaFolderDrive')
      .addToUi();
  } catch (e) {
    Logger.log("Menu akan muncul saat Spreadsheet dibuka.");
  }
}

/**
 * Fungsi yang dipanggil saat Tombol Sign di Google Sheets diklik
 */
function tombolSignKolase() {
  updateJudulFormHarian(true);
  const tglHariIni = Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU_WIB, "yyyy-MM-dd");
  generateKolaseUntukSesi(tglHariIni, "Pagi");
  generateKolaseUntukSesi(tglHariIni, "Sore");
  tampilkanPesan("✅ Sukses: 1 File PDF dokumentasi presensi (multi-halaman sesuai jumlah peserta, maks 6 foto per halaman) untuk tanggal " + tglHariIni + " berhasil dibuat dan disimpan di Google Drive!");
}

/**
 * 5. Pemicu Form Submit (onFormSubmitTrigger)
 */
function onFormSubmitTrigger(e) {
  // Pastikan judul form selalu sinkron dengan tanggal WIB hari ini
  updateJudulFormHarian(true);

  const sheet = (e && e.range) ? e.range.getSheet() : dapatkanSheetRespons();
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("Belum ada baris data peserta untuk diproses.");
    return;
  }

  const colMap = getHeaderMap(sheet);
  
  try {
    const timestamp = sheet.getRange(lastRow, colMap.KOLOM_TIMESTAMP).getValue();
    const nip = String(sheet.getRange(lastRow, colMap.KOLOM_NIP).getValue()).trim();
    const nama = String(sheet.getRange(lastRow, colMap.KOLOM_NAMA).getValue()).trim();
    const sesi = String(sheet.getRange(lastRow, colMap.KOLOM_SESI).getValue()).trim();
    const fotoUrl = String(sheet.getRange(lastRow, colMap.KOLOM_FOTO).getValue()).trim();

    const tglObj = timestamp ? new Date(timestamp) : new Date();
    const dateStr = Utilities.formatDate(tglObj, CONFIG.ZONA_WAKTU_WIB, "yyyy-MM-dd");

    // Cek Duplikasi
    const duplicateStatus = cekDuplikasi(sheet, lastRow, nip, dateStr, sesi, colMap);
    if (duplicateStatus === "DUPLIKAT_DITOLAK") {
      sheet.getRange(lastRow, colMap.KOLOM_STATUS).setValue("DITOLAK (NIP SUDAH ADA)");
      return;
    }

    // Buat & Perbarui Kolase otomatis
    generateKolaseUntukSesi(dateStr, sesi);

    if (duplicateStatus === "DUPLIKAT_DITIMPA") {
      sheet.getRange(lastRow, colMap.KOLOM_STATUS).setValue("SUKSES DIPROSES (MENIMPA DATA LAMA)");
    } else if (duplicateStatus === "DUPLIKAT_DITANDAI") {
      sheet.getRange(lastRow, colMap.KOLOM_STATUS).setValue("DUPLIKAT DITANDAI");
    } else {
      sheet.getRange(lastRow, colMap.KOLOM_STATUS).setValue("SUKSES DIPROSES");
    }
  } catch (error) {
    Logger.log("Error: " + error.toString());
    sheet.getRange(lastRow, colMap.KOLOM_STATUS).setValue("GAGAL: " + error.toString());
  }
}

/**
 * Validasi Duplikasi NIP (Default: TIMPA)
 */
function cekDuplikasi(sheet, currentRow, nip, targetDate, targetSession, colMap) {
  const targetSheet = sheet || dapatkanSheetRespons();
  if (!targetSheet || !currentRow || currentRow < 2) return "OK";

  const data = targetSheet.getDataRange().getValues();
  const map = colMap || getHeaderMap(targetSheet);
  let foundDuplicate = false;

  for (let i = 1; i < currentRow - 1; i++) {
    const row = data[i];
    if (!row[map.KOLOM_TIMESTAMP - 1]) continue;
    const rowDate = Utilities.formatDate(new Date(row[map.KOLOM_TIMESTAMP - 1]), CONFIG.ZONA_WAKTU_WIB, "yyyy-MM-dd");
    const rowNip = String(row[map.KOLOM_NIP - 1]).trim();
    const rowSesi = String(row[map.KOLOM_SESI - 1]).trim();

    if (rowDate === targetDate && rowNip === nip && rowSesi === targetSession) {
      foundDuplicate = true;
      if (CONFIG.ATURAN_DUPLIKAT === "TOLAK") {
        return "DUPLIKAT_DITOLAK";
      } else if (CONFIG.ATURAN_DUPLIKAT === "TIMPA") {
        // Tandai baris lama sebagai DITIMPA agar hanya baris terbaru yang dirender
        targetSheet.getRange(i + 1, map.KOLOM_STATUS).setValue("DITIMPA (DATA LAMA)");
      }
    }
  }

  if (foundDuplicate) {
    if (CONFIG.ATURAN_DUPLIKAT === "TIMPA") return "DUPLIKAT_DITIMPA";
    if (CONFIG.ATURAN_DUPLIKAT === "TANDAI") return "DUPLIKAT_DITANDAI";
  }
  return "OK";
}

/**
 * 6. Pengelolaan Folder di Google Drive
 */
function dapatkanFolderSesi(dateStr, sesi) {
  const safeDate = dateStr || Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU_WIB, "yyyy-MM-dd");
  const safeSesi = sesi || "PAGI";

  const rootFolders = DriveApp.getFoldersByName(CONFIG.FOLDER_INDUK);
  let indukFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(CONFIG.FOLDER_INDUK);

  const tglFolders = indukFolder.getFoldersByName(safeDate);
  let tglFolder = tglFolders.hasNext() ? tglFolders.next() : indukFolder.createFolder(safeDate);

  const namaSesiFolder = safeSesi.toUpperCase();
  const sesiFolders = tglFolder.getFoldersByName(namaSesiFolder);
  let sesiFolder = sesiFolders.hasNext() ? sesiFolders.next() : tglFolder.createFolder(namaSesiFolder);

  return sesiFolder;
}

/**
 * 7. Membuat File Kolase (Google Slides / Drive)
 */
function generateKolaseUntukSesi(dateStr, targetSesi) {
  const sheet = dapatkanSheetRespons();
  if (!sheet) return;

  const safeDate = dateStr || Utilities.formatDate(new Date(), CONFIG.ZONA_WAKTU_WIB, "yyyy-MM-dd");
  const safeSesi = targetSesi || "Pagi";

  const colMap = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const listPeserta = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[colMap.KOLOM_TIMESTAMP - 1]) continue;
    
    const rowDate = Utilities.formatDate(new Date(row[colMap.KOLOM_TIMESTAMP - 1]), CONFIG.ZONA_WAKTU_WIB, "yyyy-MM-dd");
    const rowSesi = String(row[colMap.KOLOM_SESI - 1]).trim();
    const status = String(row[colMap.KOLOM_STATUS - 1] || "");

    if (
      rowDate === safeDate &&
      rowSesi.toLowerCase() === safeSesi.toLowerCase() &&
      !status.includes("DITOLAK") &&
      !status.includes("DITIMPA")
    ) {
      listPeserta.push({
        nip: String(row[colMap.KOLOM_NIP - 1]).trim(),
        nama: String(row[colMap.KOLOM_NAMA - 1]).trim(),
        fotoUrl: String(row[colMap.KOLOM_FOTO - 1]).trim()
      });
    }
  }

  if (listPeserta.length === 0) return;

  const targetFolder = dapatkanFolderSesi(safeDate, safeSesi);
  const totalHalaman = Math.ceil(listPeserta.length / CONFIG.MAKS_FOTO_PER_HALAMAN);

  // Buat presentasi sementara untuk render gambar
  const slideDeck = SlidesApp.create("Temp_Kolase_" + safeDate + "_" + safeSesi);
  const slideId = slideDeck.getId();

  try {
    for (let p = 0; p < totalHalaman; p++) {
      const pageIndex = p + 1;
      const pesertaHalaman = listPeserta.slice(p * 6, (p + 1) * 6);
      const slide = (p === 0) ? slideDeck.getSlides()[0] : slideDeck.appendSlide();
      
      // Header Text
      const headerBox = slide.insertTextBox(
        "DOKUMENTASI ABSENSI - " + safeSesi.toUpperCase() + "\\n" +
        safeDate + " · HALAMAN " + pageIndex + " DARI " + totalHalaman + "\\n" +
        "TOTAL: " + listPeserta.length + " PESERTA",
        40, 20, 640, 80
      );
      headerBox.getText().getTextStyle().setFontSize(14).setBold(true);

      // Grid 3 kolom x 2 baris
      for (let s = 0; s < pesertaHalaman.length; s++) {
        const item = pesertaHalaman[s];
        const col = s % 3;
        const row = Math.floor(s / 3);
        const x = 50 + col * 200;
        const y = 120 + row * 180;

        try {
          const fileId = ambilDriveFileId(item.fotoUrl);
          if (fileId) {
            const fileBlob = DriveApp.getFileById(fileId).getBlob();
            slide.insertImage(fileBlob, x, y, 180, 130);
          }
        } catch (e) {
          slide.insertShape(SlidesApp.ShapeType.RECTANGLE, x, y, 180, 130);
        }

        const textBox = slide.insertTextBox(item.nama + "\\nNIP: " + item.nip, x, y + 135, 180, 40);
        textBox.getText().getTextStyle().setFontSize(10).setBold(true);
      }
    }
    slideDeck.saveAndClose();

    // Simpan ke Drive sebagai 1 File PDF Multi-Halaman
    const pdfBlob = DriveApp.getFileById(slideId).getAs("application/pdf");
    pdfBlob.setName("Dokumentasi_Absensi_Kolase_" + safeDate + "_" + safeSesi + "_(" + totalHalaman + "_Halaman).pdf");
    targetFolder.createFile(pdfBlob);

  } finally {
    DriveApp.getFileById(slideId).setTrashed(true);
  }
}

function ambilDriveFileId(url) {
  if (!url) return null;
  const match = String(url).match(/[-\\w]{25,}/);
  return match ? match[0] : null;
}

function bukaFolderDrive() {
  const folders = DriveApp.getFoldersByName(CONFIG.FOLDER_INDUK);
  if (folders.hasNext()) {
    tampilkanPesan("Folder Drive Absensi Kolase:\\n" + folders.next().getUrl());
  } else {
    tampilkanPesan("Folder belum dibuat. Jalankan tombol sign / absensi terlebih dahulu.");
  }
}
`;
}

export const GOOGLE_APPS_SCRIPT_CODE = getGoogleAppsScriptCode('Absensi MOOC');
