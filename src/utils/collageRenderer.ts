/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttendanceRecord, CollageSettings } from '../types/attendance.ts';
import { formatIndonesianDate, generatePdfFileName, extractDriveImageId } from './collageLogic.ts';
import { fetchDriveImageBlob } from '../services/googleWorkspace.ts';
import { ensureBrowserCompatibleImageBlob } from './heicConverter.ts';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

// Cache for resolved Object/Data URLs
export const resolvedUrlCache = new Map<string, string>();
// Cache for loaded HTMLImageElements
export const imageCache = new Map<string, HTMLImageElement>();

/**
 * Mengosongkan cache foto saat token otentikasi Google diperbarui
 */
export function clearImageCache(): void {
  imageCache.clear();
  resolvedUrlCache.clear();
}

/**
 * Resolves Google Drive URLs into local, CORS-safe Blob/Data URLs using OAuth token if available,
 * or fallback endpoints, so photos render sharply on Canvas and embed into PDF without tainting.
 */
export async function resolvePhotoUrl(rawUrl: string): Promise<string> {
  if (!rawUrl) return '';
  // Already safe local data or blob
  if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) {
    return rawUrl;
  }

  if (resolvedUrlCache.has(rawUrl)) {
    return resolvedUrlCache.get(rawUrl)!;
  }

  const fileId = extractDriveImageId(rawUrl);
  if (fileId) {
    try {
      const blob = await fetchDriveImageBlob(fileId);
      if (blob) {
        const objectUrl = URL.createObjectURL(blob);
        resolvedUrlCache.set(rawUrl, objectUrl);
        return objectUrl;
      }
    } catch (e) {
      console.warn('Gagal mengambil blob Drive untuk file ID:', fileId, e);
    }

    // Fallback ke local server proxy
    const proxyUrl = `/api/drive-image?id=${fileId}`;
    resolvedUrlCache.set(rawUrl, proxyUrl);
    return proxyUrl;
  }

  // Jika URL langsung ke file .heic / .heif eksternal, konversi ke Blob JPEG
  if (/\.(heic|heif)(\?.*)?$/i.test(rawUrl)) {
    try {
      const res = await fetch(rawUrl);
      if (res.ok) {
        const rawBlob = await res.blob();
        const convertedBlob = await ensureBrowserCompatibleImageBlob(rawBlob, rawUrl);
        const objectUrl = URL.createObjectURL(convertedBlob);
        resolvedUrlCache.set(rawUrl, objectUrl);
        return objectUrl;
      }
    } catch (e) {
      console.warn('Gagal mengonversi URL HEIC:', rawUrl, e);
    }
  }

  return rawUrl;
}

export async function preloadImage(src: string): Promise<HTMLImageElement> {
  if (imageCache.has(src)) {
    const cached = imageCache.get(src)!;
    if (cached.complete && cached.naturalWidth > 0) {
      return cached;
    }
    imageCache.delete(src);
  }

  const resolved = await resolvePhotoUrl(src);
  if (resolved !== src && imageCache.has(resolved)) {
    const cached = imageCache.get(resolved)!;
    if (cached.complete && cached.naturalWidth > 0) {
      imageCache.set(src, cached);
      return cached;
    }
    imageCache.delete(resolved);
  }

  return new Promise((resolve) => {
    const img = new Image();
    const isLocalOrBlob =
      resolved.startsWith('blob:') ||
      resolved.startsWith('data:') ||
      resolved.startsWith('/api/');

    // Only set anonymous crossOrigin for external HTTP/HTTPS URLs
    if (!isLocalOrBlob) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      if (img.naturalWidth > 0) {
        imageCache.set(src, img);
        imageCache.set(resolved, img);
      }
      resolve(img);
    };

    img.onerror = () => {
      console.warn('Gagal memuat gambar peserta:', resolved);
      resolve(img);
    };

    img.src = resolved;
  });
}

/**
 * Draws a rounded rectangle path on Canvas 2D
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Truncate text with ellipsis if it exceeds maxWidth
 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let len = text.length;
  while (len > 0 && ctx.measureText(text.slice(0, len) + '…').width > maxWidth) {
    len--;
  }
  return text.slice(0, len) + '…';
}

/**
 * Render a single page collage onto a target HTMLCanvasElement
 */
export async function renderCollagePage(
  canvas: HTMLCanvasElement,
  pageRecords: AttendanceRecord[],
  pageIndex: number,
  totalPages: number,
  totalCount: number,
  settings: CollageSettings
): Promise<void> {
  const isPortrait = settings.orientation === 'portrait';
  const width = isPortrait ? 1080 : 1920;
  const height = isPortrait ? 1350 : 1080;

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Preload all attendee images
  await Promise.all(pageRecords.map((r) => preloadImage(r.photoUrl)));

  // Color schemes according to template & selected color variant
  const tmpl = settings.template;
  const colorA = settings.frameColorA || 'classic_beige';
  const colorB = settings.frameColorB || 'navy_gold';

  let bgFill = '#F8F5EE';
  let headerBg = '#F3EFE6';
  let headerBorder = '#E2D6C0';
  let outerFramePrimary = '#D9CEB8';
  let outerFrameSecondary = '#EFE6D5';
  let primaryText = '#292524';
  let secondaryText = '#78716C';
  let accentColor = '#B8860B';
  let headerSubtitleColor = '#78716C';
  let headerTitleColor = '#292524';
  let headerDateColor = '#B8860B';
  let headerAccentStrip = '#D4AF37';
  let cardBg = '#FFFFFF';
  let cardBorder = '#E7DFCF';
  let photoBorder = '#DFD5C2';
  let badgeBg = 'rgba(41,37,36,0.85)';
  let emptyPhotoBg = '#EAE4D5';
  let emptyPhotoText = '#78716C';
  let footerDivider = '#DFD5C2';

  if (tmpl === 'beige') {
    if (colorA === 'sage_emerald') {
      bgFill = '#EEF5F0';
      headerBg = '#E0EDE4';
      headerBorder = '#B8D4C2';
      outerFramePrimary = '#7FA98F';
      outerFrameSecondary = '#CFE2D6';
      primaryText = '#143323';
      secondaryText = '#3F624F';
      accentColor = '#0F766E';
      cardBg = '#FFFFFF';
      cardBorder = '#C3DBD0';
      photoBorder = '#B2CEC0';
      badgeBg = '#143323';
      emptyPhotoBg = '#DCEBE1';
      emptyPhotoText = '#3F624F';
      footerDivider = '#B8D4C2';
    } else if (colorA === 'rose_terracotta') {
      bgFill = '#FDF2F0';
      headerBg = '#F9E5E1';
      headerBorder = '#E5C0B8';
      outerFramePrimary = '#C98A7E';
      outerFrameSecondary = '#F0D3CC';
      primaryText = '#431407';
      secondaryText = '#7C2D12';
      accentColor = '#BE123C';
      cardBg = '#FFFFFF';
      cardBorder = '#E8C9C2';
      photoBorder = '#DEB8B0';
      badgeBg = '#571B0E';
      emptyPhotoBg = '#F5DDD8';
      emptyPhotoText = '#7C2D12';
      footerDivider = '#E5C0B8';
    } else if (colorA === 'sky_azure') {
      bgFill = '#F0F6FC';
      headerBg = '#E1EEF9';
      headerBorder = '#B9D5EE';
      outerFramePrimary = '#7BAAD8';
      outerFrameSecondary = '#CCE0F3';
      primaryText = '#0C2D48';
      secondaryText = '#3B6285';
      accentColor = '#0369A1';
      cardBg = '#FFFFFF';
      cardBorder = '#C2DBF0';
      photoBorder = '#B0CEEA';
      badgeBg = '#0C2D48';
      emptyPhotoBg = '#DCEBF7';
      emptyPhotoText = '#3B6285';
      footerDivider = '#B9D5EE';
    } else if (colorA === 'lavender_plum') {
      bgFill = '#F6F2FA';
      headerBg = '#ECE4F5';
      headerBorder = '#CDBCE3';
      outerFramePrimary = '#9F82C7';
      outerFrameSecondary = '#DDD0EC';
      primaryText = '#2E1065';
      secondaryText = '#5B3E85';
      accentColor = '#7E22CE';
      cardBg = '#FFFFFF';
      cardBorder = '#D6C6EA';
      photoBorder = '#C5B1DF';
      badgeBg = '#2E1065';
      emptyPhotoBg = '#E7DDF3';
      emptyPhotoText = '#5B3E85';
      footerDivider = '#CDBCE3';
    }
    headerSubtitleColor = secondaryText;
    headerTitleColor = primaryText;
    headerDateColor = accentColor;
  } else if (tmpl === 'formal') {
    // Default Formal B: navy_gold (Biru Tua & Emas)
    bgFill = '#F1F5F9';
    headerBg = '#0B1D3A';
    headerAccentStrip = '#D4AF37';
    outerFramePrimary = '#0B1D3A';
    primaryText = '#0F172A';
    secondaryText = '#475569';
    accentColor = '#1E3A8A';
    headerSubtitleColor = '#94A3B8';
    headerTitleColor = '#FFFFFF';
    headerDateColor = '#E2E8F0';
    cardBg = '#FFFFFF';
    cardBorder = '#CBD5E1';
    photoBorder = '#CBD5E1';
    badgeBg = '#0B1D3A';
    emptyPhotoBg = '#0F172A';
    emptyPhotoText = '#CBD5E1';
    footerDivider = '#CBD5E1';

    if (colorB === 'emerald_gold') {
      bgFill = '#ECFDF5';
      headerBg = '#064E3B';
      headerAccentStrip = '#F59E0B';
      outerFramePrimary = '#064E3B';
      primaryText = '#064E3B';
      secondaryText = '#047857';
      accentColor = '#065F46';
      headerSubtitleColor = '#A7F3D0';
      headerTitleColor = '#FFFFFF';
      headerDateColor = '#FEF3C7';
      cardBg = '#FFFFFF';
      cardBorder = '#A7F3D0';
      photoBorder = '#6EE7B7';
      badgeBg = '#064E3B';
      emptyPhotoBg = '#064E3B';
      emptyPhotoText = '#D1FAE5';
      footerDivider = '#A7F3D0';
    } else if (colorB === 'maroon_gold') {
      bgFill = '#FFF1F2';
      headerBg = '#6B0F1A';
      headerAccentStrip = '#FBBF24';
      outerFramePrimary = '#6B0F1A';
      primaryText = '#4C0519';
      secondaryText = '#881337';
      accentColor = '#9F1239';
      headerSubtitleColor = '#FECDD3';
      headerTitleColor = '#FFFFFF';
      headerDateColor = '#FDE68A';
      cardBg = '#FFFFFF';
      cardBorder = '#FECDD3';
      photoBorder = '#FDA4AF';
      badgeBg = '#6B0F1A';
      emptyPhotoBg = '#4C0519';
      emptyPhotoText = '#FFE4E6';
      footerDivider = '#FECDD3';
    } else if (colorB === 'charcoal_cyan') {
      bgFill = '#F4F4F5';
      headerBg = '#18181B';
      headerAccentStrip = '#06B6D4';
      outerFramePrimary = '#18181B';
      primaryText = '#18181B';
      secondaryText = '#52525B';
      accentColor = '#0891B2';
      headerSubtitleColor = '#A1A1AA';
      headerTitleColor = '#FFFFFF';
      headerDateColor = '#67E8F9';
      cardBg = '#FFFFFF';
      cardBorder = '#D4D4D8';
      photoBorder = '#CBD5E1';
      badgeBg = '#18181B';
      emptyPhotoBg = '#18181B';
      emptyPhotoText = '#E4E4E7';
      footerDivider = '#D4D4D8';
    } else if (colorB === 'royal_purple') {
      bgFill = '#F5F3FF';
      headerBg = '#2E1065';
      headerAccentStrip = '#C084FC';
      outerFramePrimary = '#2E1065';
      primaryText = '#1E1B4B';
      secondaryText = '#5B21B6';
      accentColor = '#6D28D9';
      headerSubtitleColor = '#DDD6FE';
      headerTitleColor = '#FFFFFF';
      headerDateColor = '#F3E8FF';
      cardBg = '#FFFFFF';
      cardBorder = '#DDD6FE';
      photoBorder = '#C4B5FD';
      badgeBg = '#2E1065';
      emptyPhotoBg = '#2E1065';
      emptyPhotoText = '#EDE9FE';
      footerDivider = '#DDD6FE';
    }
  } else if (tmpl === 'minimal') {
    bgFill = '#FFFFFF';
    headerBg = '#FAFAFA';
    primaryText = '#18181B';
    secondaryText = '#71717A';
    accentColor = '#09090B';
    headerSubtitleColor = '#71717A';
    headerTitleColor = '#18181B';
    headerDateColor = '#09090B';
    cardBg = '#FAFAFA';
    cardBorder = '#E4E4E7';
    photoBorder = '#CBD5E1';
    badgeBg = 'rgba(24,24,27,0.88)';
    emptyPhotoBg = '#F4F4F5';
    emptyPhotoText = '#71717A';
    footerDivider = '#E4E4E7';
  }

  // 1. Draw Background
  ctx.fillStyle = bgFill;
  ctx.fillRect(0, 0, width, height);

  // Outer framing decorative line (Beige Elegant & Formal)
  if (tmpl === 'beige') {
    ctx.strokeStyle = outerFramePrimary;
    ctx.lineWidth = 3;
    ctx.strokeRect(28, 28, width - 56, height - 56);

    ctx.strokeStyle = outerFrameSecondary;
    ctx.lineWidth = 1;
    ctx.strokeRect(34, 34, width - 68, height - 68);
  } else if (tmpl === 'formal') {
    ctx.strokeStyle = outerFramePrimary;
    ctx.lineWidth = 6;
    ctx.strokeRect(20, 20, width - 40, height - 40);
  }

  // 2. Header Area
  const headerHeight = isPortrait ? 220 : 180;
  if (tmpl === 'formal') {
    ctx.fillStyle = headerBg;
    ctx.fillRect(30, 30, width - 60, headerHeight);

    // Accent hairline
    ctx.fillStyle = headerAccentStrip;
    ctx.fillRect(30, 30 + headerHeight - 4, width - 60, 4);
  } else if (tmpl === 'beige') {
    ctx.fillStyle = headerBg;
    roundRect(ctx, 44, 44, width - 88, headerHeight - 10, 12);
    ctx.fill();
    ctx.strokeStyle = headerBorder;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  } else {
    // Minimal
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, headerHeight);
    ctx.strokeStyle = '#E4E4E7';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, headerHeight);
    ctx.lineTo(width - 40, headerHeight);
    ctx.stroke();
  }

  // Text inside header
  ctx.textAlign = 'center';
  const headerCenterY = isPortrait ? 130 : 110;

  // Subtitle / Institution
  ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = headerSubtitleColor;
  const institution = (settings.institutionName || 'DOKUMENTASI ABSENSI HARIAN').toUpperCase();
  const unit = settings.unitName ? ` · ${settings.unitName.toUpperCase()}` : '';
  ctx.fillText(fitText(ctx, `${institution}${unit}`, width - 140), width / 2, headerCenterY - 45);

  // Big Title: "ABSENSI PAGI" / "ABSENSI SORE"
  const sessionTitle = `ABSENSI ${settings.selectedSession.toUpperCase()}`;
  if (tmpl === 'beige') {
    ctx.font = '700 48px "Cormorant Garamond", Georgia, serif';
  } else if (tmpl === 'formal') {
    ctx.font = '800 44px "Plus Jakarta Sans", sans-serif';
  } else {
    ctx.font = '800 42px "Plus Jakarta Sans", sans-serif';
  }
  ctx.fillStyle = headerTitleColor;
  ctx.fillText(sessionTitle, width / 2, headerCenterY + 10);

  // Date & Page summary
  const dateFormatted = formatIndonesianDate(settings.selectedDate);
  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = headerDateColor;
  ctx.fillText(`${dateFormatted}  ·  HALAMAN ${pageIndex + 1} DARI ${totalPages}`, width / 2, headerCenterY + 45);

  // 3. Photo Grid (3 Columns x 2 Rows = 6 slots)
  const gridTop = headerHeight + (isPortrait ? 50 : 35);
  const gridBottom = height - 80;
  const gridLeft = isPortrait ? 50 : 80;
  const gridRight = width - (isPortrait ? 50 : 80);
  const gridWidth = gridRight - gridLeft;
  const gridHeight = gridBottom - gridTop;

  const cols = 3;
  const rows = 2;
  const gapX = isPortrait ? 24 : 36;
  const gapY = isPortrait ? 28 : 28;

  const cardWidth = (gridWidth - (cols - 1) * gapX) / cols;
  const cardHeight = (gridHeight - (rows - 1) * gapY) / rows;

  if (pageRecords.length === 0) {
    // Jika belum ada foto sama sekali pada tanggal/sesi ini, tampilkan tulisan "Foto Kosong" tanpa kotak Slot Tersedia
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = secondaryText;
    ctx.font = '700 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Foto Kosong', width / 2, (gridTop + gridBottom) / 2);
    ctx.restore();
  } else {
    // Hanya tampilkan kartu untuk foto peserta yang sudah ada (tanpa kotak "Slot Tersedia")
    for (let slot = 0; slot < Math.min(6, pageRecords.length); slot++) {
      const attendee = pageRecords[slot];
      if (!attendee) continue;

      const col = slot % cols;
      const row = Math.floor(slot / cols);
      const cardX = gridLeft + col * (cardWidth + gapX);
      const cardY = gridTop + row * (cardHeight + gapY);

      // Card background
      ctx.save();
      roundRect(ctx, cardX, cardY, cardWidth, cardHeight, 14);
      ctx.fillStyle = cardBg;
      ctx.fill();
      ctx.strokeStyle = cardBorder;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Photo area
      const photoPadding = 12;
      const photoWidth = cardWidth - photoPadding * 2;
      const photoHeight = cardHeight - 88; // Space for name and NIP below
      const photoX = cardX + photoPadding;
      const photoY = cardY + photoPadding;

      // Clip photo to rounded container
      ctx.save();
      roundRect(ctx, photoX, photoY, photoWidth, photoHeight, 10);
      ctx.clip();

      const targetUrl = resolvedUrlCache.get(attendee.photoUrl) || attendee.photoUrl;
      const cachedImg = imageCache.get(attendee.photoUrl) || imageCache.get(targetUrl);
      if (cachedImg && cachedImg.complete && cachedImg.naturalWidth > 0) {
        // Draw image aspect-fill
        const imgAspect = cachedImg.naturalWidth / cachedImg.naturalHeight;
        const boxAspect = photoWidth / photoHeight;
        let sx = 0,
          sy = 0,
          sw = cachedImg.naturalWidth,
          sh = cachedImg.naturalHeight;

        if (imgAspect > boxAspect) {
          sw = cachedImg.naturalHeight * boxAspect;
          sx = (cachedImg.naturalWidth - sw) / 2;
        } else {
          sh = cachedImg.naturalWidth / boxAspect;
          sy = (cachedImg.naturalHeight - sh) / 2;
        }
        ctx.drawImage(cachedImg, sx, sy, sw, sh, photoX, photoY, photoWidth, photoHeight);
      } else {
        // Jika foto peserta belum ada / gagal dimuat, tampilkan tulisan "Foto Kosong"
        ctx.fillStyle = emptyPhotoBg;
        ctx.fillRect(photoX, photoY, photoWidth, photoHeight);

        ctx.fillStyle = emptyPhotoText;
        ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Foto Kosong', photoX + photoWidth / 2, photoY + photoHeight / 2);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();

      // Border around photo
      ctx.strokeStyle = photoBorder;
      ctx.lineWidth = 1;
      roundRect(ctx, photoX, photoY, photoWidth, photoHeight, 10);
      ctx.stroke();

      // Name & NIP text below photo
      ctx.textAlign = 'center';
      const textCenterY = cardY + cardHeight - 55;

      // Attendee Name
      ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = primaryText;
      const fittedName = fitText(ctx, attendee.name, cardWidth - 24);
      ctx.fillText(fittedName, cardX + cardWidth / 2, textCenterY);

      // NIP in tabular mono font
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillStyle = secondaryText;
      const nipDisplay = `NIP: ${attendee.nip}`;
      ctx.fillText(nipDisplay, cardX + cardWidth / 2, textCenterY + 22);

      // Number badge on top right of photo
      const indexNum = String(pageIndex * 6 + slot + 1).padStart(2, '0');
      ctx.fillStyle = badgeBg;
      roundRect(ctx, photoX + photoWidth - 36, photoY + 8, 28, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(indexNum, photoX + photoWidth - 22, photoY + 23);

      ctx.restore();
    }
  }

  // 4. Footer Bar
  const footerY = height - 56;
  ctx.textAlign = 'center';

  // Divider line above footer
  ctx.strokeStyle = footerDivider;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, footerY - 14);
  ctx.lineTo(width - 60, footerY - 14);
  ctx.stroke();

  // Left text: Total Attendees & Page
  ctx.font = '700 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = primaryText;
  const leftSummary = `TOTAL: ${totalCount} PESERTA · HALAMAN ${pageIndex + 1} DARI ${totalPages}`;

  // Right text: System notes / Custom footer
  const rightNote = settings.footerNote || 'SISTEM DOKUMENTASI PRESENSI OTOMATIS';

  ctx.textAlign = 'left';
  ctx.fillText(leftSummary, 64, footerY + 10);

  ctx.textAlign = 'right';
  ctx.font = '500 12px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = secondaryText;
  ctx.fillText(rightNote.toUpperCase(), width - 64, footerY + 10);
}

/**
 * Download a canvas as a PNG file directly in the browser
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Copy canvas image to system clipboard
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            'image/png': blob
          })
        ]);
        resolve(true);
      } catch (err) {
        console.warn('Clipboard write failed:', err);
        resolve(false);
      }
    }, 'image/png');
  });
}

export interface PdfExportOptions {
  compressed?: boolean;
}

/**
 * Render all collage pages into a single multi-page PDF document.
 * If there are 2 images/pages (e.g. 7-12 attendees), the resulting PDF has exactly 2 pages.
 * Supports `compressed: true` for significantly smaller file size (ideal for WhatsApp / email / portal upload).
 */
export async function generateCollagePdfBlob(
  attendees: AttendanceRecord[],
  settings: CollageSettings,
  onProgress?: (current: number, total: number, phase: string) => void,
  options?: PdfExportOptions
): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const isCompressed = Boolean(options?.compressed);
  const pages: AttendanceRecord[][] = [];
  for (let i = 0; i < attendees.length; i += 6) {
    pages.push(attendees.slice(i, i + 6));
  }
  const totalPages = Math.max(1, pages.length);

  const isPortrait = settings.orientation === 'portrait';
  // Aspect ratio matches canvas (portrait 1080x1350 = 4:5, landscape 1920x1080 = 16:9)
  const orientation = isPortrait ? 'portrait' : 'landscape';
  // Standard PDF page dimension in mm
  const pdfWidth = isPortrait ? 210 : 297;
  const pdfHeight = isPortrait ? Math.round(210 * (1350 / 1080)) : Math.round(297 * (1080 / 1920));

  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: [pdfWidth, pdfHeight],
    compress: true
  });

  const offscreenCanvas = document.createElement('canvas');
  const scaledCanvas = isCompressed ? document.createElement('canvas') : null;

  for (let p = 0; p < totalPages; p++) {
    if (onProgress) {
      onProgress(
        p + 1,
        totalPages,
        `${isCompressed ? 'Mengompres' : 'Merender'} halaman ${p + 1} dari ${totalPages}...`
      );
    }

    if (p > 0) {
      pdf.addPage([pdfWidth, pdfHeight], orientation);
    }

    const pageRecords = pages[p] || [];
    await renderCollagePage(
      offscreenCanvas,
      pageRecords,
      p,
      totalPages,
      attendees.length,
      settings
    );

    let imgData: string;
    if (isCompressed && scaledCanvas) {
      // Skala resolusi 65% + kompresi JPEG 0.62 menghasilkan ukuran file ~75-85% lebih kecil namun tetap tajam dibaca
      const scaleFactor = 0.65;
      scaledCanvas.width = Math.round(offscreenCanvas.width * scaleFactor);
      scaledCanvas.height = Math.round(offscreenCanvas.height * scaleFactor);
      const sCtx = scaledCanvas.getContext('2d');
      if (sCtx) {
        sCtx.imageSmoothingEnabled = true;
        sCtx.imageSmoothingQuality = 'high';
        sCtx.drawImage(offscreenCanvas, 0, 0, scaledCanvas.width, scaledCanvas.height);
      }
      imgData = scaledCanvas.toDataURL('image/jpeg', 0.62);
    } else {
      // High quality JPEG compression for razor-sharp print clarity
      imgData = offscreenCanvas.toDataURL('image/jpeg', 0.92);
    }

    pdf.addImage(
      imgData,
      'JPEG',
      0,
      0,
      pdfWidth,
      pdfHeight,
      undefined,
      isCompressed ? 'MEDIUM' : 'FAST'
    );
  }

  if (onProgress) {
    onProgress(totalPages, totalPages, 'Menyusun dokumen PDF multi-halaman...');
  }

  const baseFilename = generatePdfFileName(settings.selectedSession, settings.selectedDate, totalPages);
  const filename = isCompressed
    ? baseFilename.replace(/\.pdf$/i, '_Kompres.pdf')
    : baseFilename;
  const blob = pdf.output('blob');

  return { blob, filename, pageCount: totalPages };
}

/**
 * Downloads all collage pages as a single multi-page PDF document.
 */
export async function downloadAllPagesAsPdf(
  attendees: AttendanceRecord[],
  settings: CollageSettings,
  onProgress?: (current: number, total: number, phase: string) => void,
  options?: PdfExportOptions
): Promise<{ filename: string; pageCount: number; sizeBytes: number }> {
  const { blob, filename, pageCount } = await generateCollagePdfBlob(
    attendees,
    settings,
    onProgress,
    options
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { filename, pageCount, sizeBytes: blob.size };
}

/**
 * Batch generate and download all pages in a ZIP file
 */
export async function downloadAllPagesAsZip(
  attendees: AttendanceRecord[],
  settings: CollageSettings
): Promise<void> {
  const zip = new JSZip();
  const pages: AttendanceRecord[][] = [];
  for (let i = 0; i < attendees.length; i += 6) {
    pages.push(attendees.slice(i, i + 6));
  }
  const totalPages = Math.max(1, pages.length);

  const offscreenCanvas = document.createElement('canvas');

  for (let p = 0; p < totalPages; p++) {
    const pageRecords = pages[p] || [];
    await renderCollagePage(
      offscreenCanvas,
      pageRecords,
      p,
      totalPages,
      attendees.length,
      settings
    );

    const dataUrl = offscreenCanvas.toDataURL('image/png');
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
    const pageNum = String(p + 1).padStart(2, '0');
    const filename = `Kolase_${settings.selectedSession}_${settings.selectedDate}_Halaman_${pageNum}.png`;
    zip.file(filename, base64Data, { base64: true });
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Dokumentasi_Absensi_${settings.selectedSession}_${settings.selectedDate}.zip`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
