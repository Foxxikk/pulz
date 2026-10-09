// POST /api/delete {url} (hlavička x-pin) → smaže skladbu z knihovny
import { del } from '@vercel/blob';
import { pinOk, deny } from './_pin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!pinOk(req.headers['x-pin'])) return deny(res);
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body.url !== 'string' || !/\.blob\.vercel-storage\.com\/songs\//.test(body.url)) return res.status(400).json({ error: 'Neplatná skladba' });
    await del(body.url);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
}
