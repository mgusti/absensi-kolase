/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  Video,
  VideoOff
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AttendanceRecord, AttendanceSession, DuplicatePolicy } from '../types/attendance.ts';
import { validateNip, resolveAttendanceSubmission } from '../utils/collageLogic.ts';

interface AttendanceFormProps {
  attendees: AttendanceRecord[];
  onAddAttendance: (updatedList: AttendanceRecord[], message: string, status: string) => void;
  selectedDate: string;
  defaultSession: AttendanceSession;
  duplicatePolicy: DuplicatePolicy;
  onGoToStudio: () => void;
}

export const AttendanceForm: React.FC<AttendanceFormProps> = ({
  attendees,
  onAddAttendance,
  selectedDate,
  defaultSession,
  duplicatePolicy,
  onGoToStudio
}) => {
  const [nip, setNip] = useState('');
  const [name, setName] = useState('');
  const [session, setSession] = useState<AttendanceSession>(defaultSession);
  const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string>('');

  // Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Form error & success message
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    name: string;
    nip: string;
    session: string;
    status: string;
  } | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsVideoReady(false);
  }, []);

  const attachStreamToVideo = useCallback((stream: MediaStream) => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    videoEl
      .play()
      .then(() => {
        setIsVideoReady(true);
      })
      .catch(() => {
        // play will also trigger onLoadedMetadata
      });
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsVideoReady(false);

    // Stop any previous stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 900 }
        },
        audio: false
      });
      streamRef.current = stream;
      setIsCameraActive(true);
      attachStreamToVideo(stream);
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError(
        'Kamera tidak dapat diakses atau izin kamera diblokir di browser. Pastikan izin kamera diaktifkan lalu klik "Coba Akses Kamera Lagi".'
      );
      setIsCameraActive(false);
      setIsVideoReady(false);
    }
  }, [attachStreamToVideo]);

  // Otomatis nyalakan kamera saat halaman Isi Presensi dibuka, dan matikan saat keluar
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // Pastikan stream selalu terpasang ke elemen <video> setiap kali kamera aktif
  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current) {
      attachStreamToVideo(streamRef.current);
    }
  }, [isCameraActive, capturedPhotoUrl, attachStreamToVideo]);

  const captureCameraPhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;

    if (video.readyState < 2 || vw === 0 || vh === 0) {
      setErrorMessage('Kamera sedang memuat gambar, tunggu 1 detik lalu klik Ambil Foto lagi.');
      return;
    }

    const targetW = 600;
    const targetH = 750; // Rasio potret 4:5 sesuai slot kolase
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Crop tengah secara proporsional (aspect-fill) agar wajah tidak gepeng/tertarik
    const videoAspect = vw / vh;
    const targetAspect = targetW / targetH;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;

    if (videoAspect > targetAspect) {
      sw = vh * targetAspect;
      sx = (vw - sw) / 2;
    } else {
      sh = vw / targetAspect;
      sy = (vh - sh) / 2;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhotoUrl(dataUrl);
    setErrorMessage(null);
    stopCamera();
  };

  const handleRetakePhoto = () => {
    setCapturedPhotoUrl('');
    setErrorMessage(null);
    startCamera();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate NIP
    const nipValidation = validateNip(nip);
    if (!nipValidation.isValid) {
      setErrorMessage(nipValidation.error || 'NIP tidak valid.');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('Nama lengkap peserta wajib diisi.');
      return;
    }

    if (!capturedPhotoUrl) {
      setErrorMessage('Silakan ambil foto selfie presensi terlebih dahulu sebelum mengirim.');
      return;
    }

    const candidate = {
      timestamp: new Date().toISOString(),
      nip: nipValidation.cleaned,
      name: name.trim(),
      session,
      date: selectedDate,
      photoUrl: capturedPhotoUrl
    };

    const resolution = resolveAttendanceSubmission(attendees, candidate, duplicatePolicy);

    if (resolution.resultStatus === 'rejected') {
      setErrorMessage(resolution.message);
      return;
    }

    // Success
    onAddAttendance(resolution.updatedList, resolution.message, resolution.resultStatus);
    setSuccessInfo({
      name: candidate.name,
      nip: candidate.nip,
      session: candidate.session,
      status: resolution.resultStatus
    });

    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
    } catch {
      // Ignore if confetti not supported
    }

    // Reset inputs for next attendee & nyalakan kamera kembali
    setNip('');
    setName('');
    setCapturedPhotoUrl('');
    startCamera();
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      {/* Header Info */}
      <div className="mb-6 bg-white rounded-xl border border-stone-200 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Formulir Presensi Kehadiran</span>
        </div>
        <h1 className="text-2xl font-bold text-stone-900 tracking-tight">
          Isi Presensi Peserta
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Masukkan NIP, Nama Lengkap, pilih Sesi, lalu ambil foto selfie untuk langsung memperbarui kolase presensi harian.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-stone-500 border-t border-stone-100 pt-3">
          <span>
            Tanggal: <strong className="text-stone-800">{selectedDate}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Sesi Aktif: <strong className="text-stone-800">{session}</strong>
          </span>
          <span aria-hidden="true">·</span>
          <span>
            Aturan Duplikasi:{' '}
            <strong className="text-stone-800">
              {duplicatePolicy === 'reject'
                ? 'Tolak Duplikat'
                : duplicatePolicy === 'flag'
                ? 'Tandai Duplikat'
                : 'Timpa Data Lama'}
            </strong>
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {successInfo && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-sm font-bold text-emerald-900">Presensi Berhasil Dicatat!</h2>
              <p className="text-xs text-emerald-700 mt-0.5">
                Peserta <strong>{successInfo.name}</strong> (NIP: {successInfo.nip}) berhasil
                dimasukkan ke sesi <strong>{successInfo.session}</strong>. Gambar kolase otomatis
                diperbarui.
              </p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={onGoToStudio}
                  className="px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 transition-colors"
                >
                  Lihat Kolase di Studio
                </button>
                <button
                  onClick={() => setSuccessInfo(null)}
                  className="text-xs text-emerald-800 font-medium hover:underline"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="mb-6 bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-rose-900">Validasi Pengisian</h2>
            <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Form Card */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-stone-200 shadow-sm p-6 space-y-5"
      >
        {/* NIP & Nama */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              NIP (Nomor Induk Pegawai) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: 198803152014021001"
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-stone-900 text-sm font-mono placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
            <span className="text-[11px] text-stone-500 mt-1 block">
              Gunakan angka tanpa spasi atau tanda hubung.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Nama Lengkap & Gelar <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Drs. Hendra Setiawan, M.Si"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-stone-300 text-stone-900 text-sm placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900"
            />
          </div>
        </div>

        {/* Sesi Absensi */}
        <div>
          <label className="block text-xs font-bold text-stone-700 mb-1">
            Sesi Absensi <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSession('Pagi')}
              className={`py-2.5 px-4 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-2 ${
                session === 'Pagi'
                  ? 'bg-amber-100 border-amber-400 text-amber-900'
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>☀️ Sesi Pagi</span>
            </button>
            <button
              type="button"
              onClick={() => setSession('Sore')}
              className={`py-2.5 px-4 rounded-lg text-xs font-bold border transition-colors flex items-center justify-center gap-2 ${
                session === 'Sore'
                  ? 'bg-amber-100 border-amber-400 text-amber-900'
                  : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>🌙 Sesi Sore</span>
            </button>
          </div>
        </div>

        {/* Kamera Selfie Section (Single clean mode) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-stone-700">
              Kamera Selfie Presensi <span className="text-rose-500">*</span>
            </label>
            {capturedPhotoUrl ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Foto Tersimpan
              </span>
            ) : (
              <span className="text-[11px] text-stone-500">
                Ambil foto langsung dari kamera
              </span>
            )}
          </div>

          <div className="border border-stone-200 rounded-xl p-5 bg-stone-900 text-white flex flex-col items-center">
            {cameraError && !capturedPhotoUrl ? (
              <div className="py-6 px-4 text-center">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-xs text-stone-300 mb-3 max-w-md">{cameraError}</p>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 bg-white text-stone-900 text-xs font-bold rounded-lg hover:bg-stone-100 transition-colors"
                >
                  Coba Akses Kamera Lagi
                </button>
              </div>
            ) : (
              <>
                {/* Frame Pratinjau Video / Hasil Foto Selfie */}
                <div className="relative w-64 h-80 rounded-xl overflow-hidden bg-stone-950 border border-stone-700 shadow-lg flex items-center justify-center">
                  {/* Elemen video tetap berada di DOM agar stream tidak terputus, disembunyikan saat foto sudah diambil */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={() => setIsVideoReady(true)}
                    onCanPlay={() => setIsVideoReady(true)}
                    className={`w-full h-full object-cover ${
                      capturedPhotoUrl ? 'hidden' : 'block'
                    }`}
                  />

                  {/* Tampilkan hasil foto selfie yang sudah diambil */}
                  {capturedPhotoUrl && (
                    <img
                      src={capturedPhotoUrl}
                      alt="Hasil Foto Selfie Presensi"
                      className="w-full h-full object-cover block"
                    />
                  )}

                  {/* Indikator jika kamera dimatikan dan belum ada foto */}
                  {!capturedPhotoUrl && !isCameraActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-stone-950/90">
                      <VideoOff className="w-8 h-8 text-stone-500 mb-2" />
                      <span className="text-xs text-stone-400">Kamera sedang dimatikan</span>
                    </div>
                  )}

                  <div className="absolute inset-0 border border-white/15 rounded-xl pointer-events-none" />
                </div>

                {/* Tombol Aksi Kamera: Ambil Foto / Foto Ulang */}
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  {capturedPhotoUrl ? (
                    <button
                      type="button"
                      onClick={handleRetakePhoto}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Foto Ulang</span>
                    </button>
                  ) : (
                    <>
                      {isCameraActive ? (
                        <>
                          <button
                            type="button"
                            onClick={captureCameraPhoto}
                            disabled={!isVideoReady}
                            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-colors"
                          >
                            <Camera className="w-4 h-4" />
                            <span>{isVideoReady ? 'Ambil Foto Presensi' : 'Menyiapkan Kamera...'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="px-3 py-2.5 bg-stone-800 text-stone-300 text-xs font-medium rounded-lg hover:bg-stone-700 flex items-center gap-1.5 transition-colors"
                          >
                            <VideoOff className="w-3.5 h-3.5" />
                            <span>Matikan Kamera</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={startCamera}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow flex items-center gap-2 transition-colors"
                        >
                          <Video className="w-4 h-4" />
                          <span>Nyalakan Kamera</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
          <span className="text-xs text-stone-500">
            * Kolase halaman akan dibuat/diperbarui otomatis
          </span>
          <button
            type="submit"
            className="px-6 py-2.5 bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Kirim Presensi Sekarang
          </button>
        </div>
      </form>
    </div>
  );
};
