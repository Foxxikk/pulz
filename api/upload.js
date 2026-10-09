// POST /api/upload – vydá jednorázový token pro přímé nahrání MP3 z prohlížeče do Vercel Blob (jen se správným PINem)
import { handleUpload } from '@vercel/blob/client';
import { pinOk } from './_pin.js';

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let pin = '';
        try {
          pin = JSON.parse(clientPayload || '{}').pin;
        } catch (e) {}
        if (!pinOk(pin)) throw new Error('Špatný PIN');
        if (!pathname.startsWith('songs/')) throw new Error('Neplatná cesta');
        return {
          allowedContentTypes: ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/flac'],
          maximumSizeInBytes: 40 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {},
    });
    res.status(200).json(json);
  } catch (e) {
    res.status(400).json({ error: String(e && e.message) });
  }
}
