/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * =========================================================================
 * ABSENSI KOLASE - GOOGLE APPS SCRIPT AUTOMATION
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
 * PANDUAN PEMASANGAN:
 * 1. Buka Google Sheets respons formulir absensi Anda
 * 2. Klik menu 'Ekstensi' (Extensions) > 'Apps Script'
 * 3. Hapus kode default, lalu tempel (paste) seluruh kode ini
 * 4. Tekan Ctrl+S (Simpan)
 * 5. Klik tombol 'Jalankan' (Run) pada fungsi 'inisialisasiSpreadsheet' (sudah terpilih otomatis paling atas)
 * 6. Pasang Pemicu (Trigger):
 *    - Klik menu jam (Triggers) di panel kiri
 *    - Klik '+ Tambahkan Pemicu'
 *    - Pilih fungsi: 'onFormSubmitTrigger'
 *    - Sumber acara: 'Dari spreadsheet'
 *    - Jenis acara: 'Saat mengirim formulir' (On form submit)
 *    - Simpan & setujui otorisasi akun Google
 *
 * CARA MEMBUAT TOMBOL SIGN / EKSEKUSI DI GOOGLE SHEETS:
 * 1. Di Google Sheets, klik menu 'Sisipkan' (Insert) > 'Gambar' (Drawing)
 * 2. Gambar bentuk tombol kotak, beri teks '▶️ SIGN & BUAT KOLASE', klik Simpan
 * 3. Klik titik tiga di tombol tersebut, pilih 'Tetapkan Skrip' (Assign Script)
 * 4. Ketik: tombolSignKolase, lalu klik OK!
 * =========================================================================
 */

// Konfigurasi Default Sistem
const CONFIG = {
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
      ["NAMA_INSTANSI", "DOKUMENTASI ABSENSI KEHADIRAN", "Nama instansi di header kolase"],
      ["UNIT_KERJA", "REKAPITULASI DOKUMENTASI KEHADIRAN", "Unit / Kategori Presensi"],
      ["TEMA_BINGKAI", "ELEGAN_BEIGE", "Pilihan: ELEGAN_BEIGE | FORMAL_INSTANSI | MINIMALIS"],
      ["ATURAN_DUPLIKAT", "TIMPA", "Pilihan: TIMPA | TOLAK | TANDAI"],
      ["ORIENTASI", "PORTRAIT", "PORTRAIT (1080x1350) atau LANDSCAPE (1920x1080)"],
      ["SLOGAN_FOOTER", "Dokumentasi Resmi Kehadiran", "Catatan footer di bawah gambar"]
    ];
    sheetPengaturan.getRange(1, 1, dataAwal.length, 3).setValues(dataAwal);
    sheetPengaturan.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#F1F5F9");
    sheetPengaturan.autoResizeColumns(1, 3);
    tampilkanPesan("✅ Sheet 'PENGATURAN' berhasil dibuat dan diinisialisasi!");
  } else {
    tampilkanPesan("ℹ️ Sheet 'PENGATURAN' sudah aktif dan siap digunakan.");
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
 * 2. Deteksi Indeks Kolom Otomatis berdasarkan Nama Header di Baris 1
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
 * 3. Menu Kustom di Google Sheets
 */
function onOpen() {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu('📸 Absensi Kolase')
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
  const tglHariIni = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  generateKolaseUntukSesi(tglHariIni, "Pagi");
  generateKolaseUntukSesi(tglHariIni, "Sore");
  tampilkanPesan("✅ Sukses: 1 File PDF dokumentasi presensi (multi-halaman sesuai jumlah peserta, maks 6 foto per halaman) untuk tanggal " + tglHariIni + " berhasil dibuat dan disimpan di Google Drive!");
}

/**
 * 4. Pemicu Form Submit (onFormSubmitTrigger)
 */
function onFormSubmitTrigger(e) {
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
    const dateStr = Utilities.formatDate(tglObj, Session.getScriptTimeZone(), "yyyy-MM-dd");

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
    const rowDate = Utilities.formatDate(new Date(row[map.KOLOM_TIMESTAMP - 1]), Session.getScriptTimeZone(), "yyyy-MM-dd");
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
 * 5. Pengelolaan Folder di Google Drive
 */
function dapatkanFolderSesi(dateStr, sesi) {
  const safeDate = dateStr || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
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
 * 6. Membuat File Kolase (Google Slides / Drive)
 */
function generateKolaseUntukSesi(dateStr, targetSesi) {
  const sheet = dapatkanSheetRespons();
  if (!sheet) return;

  const safeDate = dateStr || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const safeSesi = targetSesi || "Pagi";

  const colMap = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  const listPeserta = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[colMap.KOLOM_TIMESTAMP - 1]) continue;
    
    const rowDate = Utilities.formatDate(new Date(row[colMap.KOLOM_TIMESTAMP - 1]), Session.getScriptTimeZone(), "yyyy-MM-dd");
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
