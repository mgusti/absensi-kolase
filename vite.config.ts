import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
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

/**
 * Middleware proxy di server Vite (Node.js) untuk mengambil foto Google Drive
 * (termasuk .heic/.heif) secara langsung tanpa terblokir CORS / ORB oleh browser.
 */
function googleDriveImageProxyPlugin(): Plugin {
  const configureProxy = (middlewares: any) => {
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
                    // Simpan buffer HEIC mentah sebagai cadangan jika endpoint thumbnail belum siap,
                    // lalu lanjut cek URL kandidat lain siapa tahu ada yang sudah terkonversi ke JPEG
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

        // Jika file adalah .HEIC mentah dari Google Drive, kirim dengan Content-Type image/heic
        // agar otomatis dikonversi ke JPEG oleh heicConverter di sisi browser
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
    name: 'google-drive-image-proxy',
    configureServer(server) {
      configureProxy(server.middlewares);
    },
    configurePreviewServer(server) {
      configureProxy(server.middlewares);
    }
  };
}

export default defineConfig(() => {
  return {
    define: {
      __SERVER_BOOT_ID__: JSON.stringify(Date.now().toString()),
    },
    plugins: [react(), tailwindcss(), googleDriveImageProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via AI Studio env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
