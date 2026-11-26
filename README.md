# Absensi Kolase

Aplikasi pembuat kolase dokumentasi kehadiran otomatis (format 1 File PDF multi-halaman, maksimal 6 foto per halaman / grid 3×2) yang terintegrasi dengan **Google Forms** dan **Google Sheets**.

---

## 1. Instalasi & Menjalankan Aplikasi

```bash
# 1. Instal dependensi (cukup sekali di awal)
npm install --legacy-peer-deps

# 2. Jalankan server development
npm run dev
```

Buka **`http://localhost:3000`** di browser Anda.

> **Reset Otomatis Saat `npm run dev`:**
> Setiap kali Anda menjalankan ulang perintah `npm run dev`, aplikasi akan **otomatis mengosongkan semua data di tombol `Rekap Sheets (0)`**. Dengan demikian, setiap kali Anda menekan tombol **Tarik Data Sheets**, data yang tampil dijamin **100% konsisten** dengan isi Google Sheet terbaru dan tidak tercampur data sesi/akun sebelumnya.
>
> **Penyimpanan Permanen Identitas Instansi (`app-settings.json`):**
> Ketiga input **Identitas Instansi / Organisasi** (*Nama Instansi*, *Sub-Unit Kerja*, dan *Catatan / Slogan Footer*) otomatis disimpan secara permanen ke file [`app-settings.json`](./app-settings.json) di dalam folder proyek (bukan hanya di cache browser), sehingga tidak akan hilang meskipun cache browser dihapus atau dibuka di browser lain.
>
> **Aturan Duplikat Default (`TIMPA`):**
> Jika peserta dengan NIP yang sama mengisi formulir lebih dari sekali pada tanggal dan sesi yang sama, sistem otomatis **menimpa (overwrite)** data lama dengan kiriman terbaru.

---

## 2. Cara Pakai & Ganti Akun Google (Mode Direct Link — Tanpa Firebase)

Aplikasi ini berjalan mandiri **tanpa Firebase**:

### Langkah 1: Siapkan Google Form & Google Sheet di Email Baru
1. Login ke **Google Forms** ([forms.google.com](https://forms.google.com)) menggunakan akun Google mana saja yang ingin dipakai.
2. Buat formulir absensi dengan urutan pertanyaan (menghasilkan urutan kolom **A sampai E** di Google Sheets):
   - **Kolom A (Otomatis):** Timestamp
   - **Pertanyaan 1 (Kolom B):** **NIP** *(Jawaban Singkat, Wajib Diisi)*
   - **Pertanyaan 2 (Kolom C):** **Nama Lengkap & Gelar** *(Jawaban Singkat, Wajib Diisi)*
   - **Pertanyaan 3 (Kolom D):** **Sesi Absensi** *(Pilihan Ganda: `Pagi` dan `Sore`, Wajib Diisi)*
   - **Pertanyaan 4 (Kolom E):** **Unggah Foto Diri / Bukti Kehadiran** *(Upload File, Wajib Diisi)*
3. Buka tab **Jawaban (Responses)** di Google Form → klik **Link to Sheets (Hubungkan ke Spreadsheet)** untuk membuat Google Sheet jawaban.

### Langkah 2: Atur Akses "Siapa Saja yang Memiliki Link" (Cukup Sekali per Sheet)
1. Di **Google Sheets** yang baru dibuat, klik tombol **Bagikan (Share)** di pojok kanan atas → ubah *Akses Umum (General Access)* menjadi **"Siapa saja yang memiliki link" (Anyone with the link)** sebagai *Pelihat (Viewer)*.
2. Di **Google Drive**, buka folder tempat foto unggahan Google Form disimpan → klik kanan folder tersebut → **Bagikan (Share)** → ubah akses menjadi **"Siapa saja yang memiliki link" (Anyone with the link)** agar foto peserta dapat langsung dimuat ke kanvas kolase tanpa kendala izin akun.

### Langkah 3: Tempel Link di Aplikasi & Tarik Data
1. Pada panel utama di halaman aplikasi:
   - **1. Link Google Form:** Tempel link Google Form baru Anda (untuk dibagikan ke WhatsApp atau dicetak sebagai QR Code).
   - **2. Link Google Sheets:** Tempel link/URL atau ID Google Spreadsheet Anda, lalu klik tombol **Tarik Data Sheets**.
2. Data peserta dan foto otomatis masuk ke **Rekap Sheets** serta **Studio Kolase**, dan tanggal/sesi otomatis menyesuaikan data terbaru dari Sheet.
3. Klik tombol **Unduh 1 File PDF** (Kualitas Cetak HD) atau **Unduh PDF Kompres** (Ukuran Kecil ~80% lebih ringan) untuk mengunduh dokumen PDF kolase.

---

## 3. Panduan Judul Google Form Tanggal Otomatis (Berganti Setiap Jam 00:00 WIB)

Melalui menu **Google Apps Script** di aplikasi, Anda dapat memasang script di Google Sheets agar **Judul Header Google Form** otomatis memperbarui tanggalnya setiap pukul **00:00 WIB (`Asia/Jakarta`)**.

### Rumus Penulisan Tanggal pada Judul Google Form
```text
[Tanggal 1–31] [Spasi] [Nama Bulan] [Spasi] [Tahun 4 Digit]
```

### ✅ Format Judul yang BISA TERBACA (Berhasil Diganti Otomatis)
Script otomatis mempertahankan teks judul Anda dan mengganti bagian tanggal tepat pada posisinya:

| Pola Penulisan | Contoh Judul Awal di Google Form | Hasil Otomatis Besok (00:00 WIB) |
| :--- | :--- | :--- |
| **Tanggal di Belakang** | `Absensi MOOC 26 November 2026` | `Absensi MOOC 27 November 2026` |
| **Tanggal di Depan** | `12 Desember 2026 Absensi Pegawai RSUD` | `27 November 2026 Absensi Pegawai RSUD` |
| **Tanggal di Tengah** | `Absensi 26 November 2026 Unit Umum` | `Absensi 27 November 2026 Unit Umum` |
| **Bulan Bahasa Indonesia** | `Absensi 15 Agustus 2026` | `Absensi 27 November 2026` |
| **Bulan Bahasa Inggris** | `Absensi 12 December 2026` | `Absensi 27 November 2026` |
| **Singkatan Bulan (3 Huruf)** | `Absensi 26 Nov 2026` / `12 Des 2026` | `Absensi 27 November 2026` |
| **Huruf Besar / Kecil** | `Absensi 26 november 2026` / `26 NOVEMBER 2026` | `Absensi 27 November 2026` |
| **Judul Tanpa Tanggal** | `Absensi MOOC` | `Absensi MOOC 27 November 2026` *(ditambah di belakang)* |

> **Daftar Nama Bulan yang Dikenali Sistem:**
> - **Indonesia:** `Januari`, `Februari`, `Maret`, `April`, `Mei`, `Juni`, `Juli`, `Agustus`, `September`, `Oktober`, `November`, `Desember`
> - **Inggris:** `January`, `February`, `March`, `April`, `May`, `June`, `July`, `August`, `September`, `October`, `November`, `December`
> - **Singkatan:** `Jan`, `Feb`, `Mar`, `Apr`, `Mei`/`May`, `Jun`, `Jul`, `Agu`/`Aug`, `Sep`/`Sept`, `Okt`/`Oct`, `Nov`, `Des`/`Dec`

### ❌ Format Judul yang GAGAL TERBACA (Jangan Digunakan)
Jika Anda menulis tanggal dengan salah satu format di bawah ini, sistem **tidak akan mengenalinya sebagai tanggal yang bisa diganti** (sehingga tanggal lama tidak terhapus, melainkan ditambah tanggal baru di bagian belakang):

| Penyebab Gagal | Contoh Penulisan yang Salah | Solusi Penulisan yang Benar |
| :--- | :--- | :--- |
| **Bulan ditulis angka (`/` atau `-`)** | ❌ `Absensi 26/11/2026` atau `Absensi 26-11-2026` | ✅ `Absensi 26 November 2026` |
| **Tahun hanya 2 digit** | ❌ `Absensi 26 November 26` | ✅ `Absensi 26 November 2026` |
| **Tanpa tahun / tanpa tanggal** | ❌ `Absensi 26 November` atau `Absensi November 2026` | ✅ `Absensi 26 November 2026` |
| **Ejaan bulan tidak baku (typo)** | ❌ `Absensi 26 Nopember 2026` / `Peberuari` | ✅ `Absensi 26 November 2026` / `Februari` |
| **Tanpa spasi pemisah** | ❌ `Absensi 26Nov2026` | ✅ `Absensi 26 Nov 2026` |
| **Bulan di depan tanggal (Gaya US)** | ❌ `Absensi November 26, 2026` | ✅ `Absensi 26 November 2026` |
