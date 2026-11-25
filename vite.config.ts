import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1'
]);

function isHeicBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const ftyp = buf.subarray(4, 8).toString('ascii');
  if (ftyp !== 'ftyp') return false;
  const brand = buf.subarray(8, 12).toString('ascii').toLowerCase();
  return HEIC_BRANDS.has(brand);
}

const SETTINGS_FILE_PATH = path.resolve(import.meta.dirname, 'app-settings.json');

const DEFAULT_DISK_SETTINGS = {
  institutionName: 'RSUD H. ABDUL MANAP KOTA JAMBI',
  unitName: 'SUBBAG UMUM, HUMAS, DAN REKAM MEDIS',
  footerNote: 'RSUD H. ABDUL MANAP KOTA JAMBI',
  template: 'beige',
  frameColorA: 'classic_beige',
  frameColorB: 'navy_gold',
  orientation: 'portrait',
  duplicatePolicy: 'overwrite',
  formUrl: '',
  spreadsheetId: ''
};

function readDiskSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, 'utf-8');
      return { ...DEFAULT_DISK_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('Gagal membaca app-settings.json:', err);
  }
  return { ...DEFAULT_DISK_SETTINGS };
}

function writeDiskSettings(partial: Record<string, any>) {
  const current = readDiskSettings();
  const updated = {
    ...current,
    ...partial
  };
  fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2) + '\n', 'utf-8');
  return updated;
}

/**
 * Middleware di server Vite (Node.js) untuk:
 * 1. Menyimpan & membaca pengaturan identitas instansi secara permanen ke file `app-settings.json` di disk (/api/settings)
 * 2. Mengambil foto Google Drive (termasuk .heic/.heif) secara langsung tanpa terblokir CORS (/api/drive-image)
 */
function localBackendPlugin(): Plugin {
  const configureMiddlewares = (middlewares: any) => {
    // Endpoint penyimpanan pengaturan permanen ke file disk (app-settings.json)
    middlewares.use('/api/settings', (req: any, res: any) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');

      if (req.method === 'GET') {
        const data = readDiskSettings();
        res.statusCode = 200;
        res.end(JSON.stringify(data));
        return;
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            const allowedStringKeys = [
              'institutionName',
              'unitName',
              'footerNote',
              'template',
              'frameColorA',
              'frameColorB',
              'orientation',
              'duplicatePolicy',
              'formUrl',
              'spreadsheetId'
            ];
            const sanitized: Record<string, any> = {};
            for (const key of allowedStringKeys) {
              if (typeof parsed[key] === 'string') {
                sanitized[key] = parsed[key];
              }
            }
            if (typeof parsed.darkMode === 'boolean') {
              sanitized.darkMode = parsed.darkMode;
            }
            const saved = writeDiskSettings(sanitized);
            res.statusCode = 200;
            res.end(JSON.stringify({ ok: true, settings: saved }));
          } catch (err: any) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: err?.message || 'Invalid JSON' }));
          }
        });
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    });

    // Endpoint proxy gambar Google Drive
    middlewares.use('/api/drive-image', async (req: any, res: any) => {
      try {
        const reqUrl = new URL(req.url || '', 'http://localhost');
        const fileId = reqUrl.searchParams.get('id');

        if (!fileId || !/^[a-zA-Z0-9_-]{15,}$/.test(fileId)) {
          res.statusCode = 400;
          res.end('Invalid Google Drive file ID');
          return;
        }

        // Urutan URL kandidat: prioritaskan endpoint thumbnail/lh3 yang otomatis
        // mengonversi .HEIC menjadi JPEG di sisi server Google terlebih dahulu
        const candidateUrls = [
          `https://drive.google.com/thumbnail?id=${fileId}&sz=w1200`,
          `https://drive.google.com/thumbnail?authuser=0&sz=w1200&id=${fileId}`,
          `https://lh3.googleusercontent.com/d/${fileId}=s1200`,
          `https://lh3.googleusercontent.com/d/${fileId}=w1200`,
          `https://drive.google.com/uc?export=download&id=${fileId}`,
          `https://drive.google.com/uc?export=view&id=${fileId}`
        ];

        let fallbackHeicBuffer: Buffer | null = null;

        for (const targetUrl of candidateUrls) {
          try {
            const response = await fetch(targetUrl, {
              redirect: 'follow',
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'image/jpeg,image/png,image/webp,image/*,*/*;q=0.8'
              }
            });

            if (response.ok) {
              const contentType = (response.headers.get('content-type') || '').toLowerCase();
              if (
                !contentType.includes('text/html') &&
                (contentType.startsWith('image/') || contentType.includes('octet-stream'))
              ) {
                const arrayBuffer = await response.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                if (buffer.length > 100) {
                  if (isHeicBuffer(buffer) || contentType.includes('heic') || contentType.includes('heif')) {
                    if (!fallbackHeicBuffer) {
                      fallbackHeicBuffer = buffer;
                    }
                    continue;
                  }

                  res.setHeader(
                    'Content-Type',
                    contentType.startsWith('image/') ? contentType : 'image/jpeg'
                  );
                  res.setHeader('Cache-Control', 'public, max-age=86400');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.statusCode = 200;
                  res.end(buffer);
                  return;
                }
              }
            }
          } catch {
            // Lanjut coba URL kandidat berikutnya
          }
        }

        if (fallbackHeicBuffer) {
          res.setHeader('Content-Type', 'image/heic');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.statusCode = 200;
          res.end(fallbackHeicBuffer);
          return;
        }

        res.statusCode = 404;
        res.end('Drive image not accessible or not shared publicly');
      } catch (err) {
        res.statusCode = 500;
        res.end('Proxy error');
      }
    });
  };

  return {
    name: 'local-backend-plugin',
    configureServer(server) {
      configureMiddlewares(server.middlewares);
    },
    configurePreviewServer(server) {
      configureMiddlewares(server.middlewares);
    }
  };
}

export default defineConfig(() => {
  return {
    define: {
      __SERVER_BOOT_ID__: JSON.stringify(Date.now().toString()),
    },
    plugins: [react(), tailwindcss(), localBackendPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via AI Studio env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Abaikan perubahan app-settings.json dari file watcher agar halaman tidak reload saat menyimpan pengaturan
      watch:
        process.env.DISABLE_HMR === 'true'
          ? null
          : {
              ignored: ['**/app-settings.json']
            },
    },
  };
});
