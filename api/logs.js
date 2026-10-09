// GET /api/logs (hlavička x-pin) → seznam uložených záznamů tréninků (nejnovější první)
import { list } from '@vercel/blob';
import { pinOk, deny } from './_pin.js';

export default async function handler(req, res) {
  if (!pinOk(req.headers['x-pin'])) return deny(res);
  try {
    const out = [];
    let cursor;
    do {
      const r = await list({ prefix: 'logs/', cursor, limit: 1000 });
      for (const b of r.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor && out.length < 5000);
    out.sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ logs: out });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
}
