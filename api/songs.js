// GET /api/songs  (hlavička x-pin) → seznam skladeb v knihovně
import { list } from '@vercel/blob';
import { pinOk, deny } from './_pin.js';

export default async function handler(req, res) {
  if (!pinOk(req.headers['x-pin'])) return deny(res);
  try {
    const out = [];
    let cursor;
    do {
      const r = await list({ prefix: 'songs/', cursor, limit: 1000 });
      for (const b of r.blobs) out.push({ url: b.url, pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt });
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    out.sort((a, b) => a.pathname.localeCompare(b.pathname, 'cs'));
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ songs: out });
  } catch (e) {
    res.status(500).json({ error: 'Knihovna není dostupná', detail: String(e && e.message) });
  }
}
