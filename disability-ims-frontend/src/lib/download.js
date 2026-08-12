import { getToken } from './api.js';

// ─────────────────────────────────────────────────────────────
// Authenticated file download.
//
// Two problems shape this, and both have a cost if solved the obvious way.
//
// 1. A plain <a href> cannot carry an Authorization header, so the usual trick
//    is to put the token in the query string — where it lands in server logs,
//    browser history and any proxy in between. For a file containing
//    beneficiary names and national ID numbers that is not an acceptable
//    trade, so the file is fetched like any other API call.
//
// 2. Edge's bundled PDF handler claims any response whose body begins "%PDF",
//    including one being read by fetch(). Declaring
//    `Content-Type: application/octet-stream` and `X-Content-Type-Options:
//    nosniff` does not stop it: the extension takes the body and the page is
//    left with an empty 204, which showed up as a PDF report downloading as a
//    0-byte file. So the bytes travel base64-wrapped inside JSON, where no
//    content handler is looking, and the blob is rebuilt here.
//
// The ~33% transport overhead is real but small at report sizes, and it is
// paid only by the browser — scripts can still fetch the raw stream from
// /reports/:key/pdf.
// ─────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL || '/api';

function bytesFromBase64(b64) {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function saveBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the save in some browsers.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

export async function downloadFile(path, fallbackName) {
  const url = BASE + path + (path.includes('?') ? '&' : '?') + 'encoding=base64';
  const res = await fetch(url, {
    headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('ids:unauthorized'));
    const err = new Error(payload?.error || `Download failed (${res.status})`);
    err.status = res.status;
    throw err;
  }

  const filename = payload.filename || fallbackName;
  saveBlob(new Blob([bytesFromBase64(payload.data)], { type: payload.mime || 'application/octet-stream' }), filename);
  return filename;
}
