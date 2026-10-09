// POST /api/log – uložení záznamu tréninku (detekce úderů, sledování rukou) pro analýzu.
// Neobsahuje osobní údaje: jen časy, rychlosti, vzdálenosti, nastavení citlivosti a typ prohlížeče.
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || body.v !== 1 || !Array.isArray(body.items)) return res.status(400).json({ error: 'Neplatný záznam' });
    const json = JSON.stringify(body);
    if (json.length > 600000) return res.status(413).json({ error: 'Záznam je příliš velký' });
    const d = new Date();
    const day = d.toISOString().slice(0, 10);
    const name = `logs/${day}/${d.toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 8)}.json`;
    await put(name, json, { access: 'public', contentType: 'application/json', addRandomSuffix: false });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message) });
  }
}
