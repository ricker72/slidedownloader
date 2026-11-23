export const config = {
  runtime: 'edge'
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export default async function handler(request) {
  const target = new URL(request.url).searchParams.get('url');
  if (!target) return Response.json({ error: 'falta url' }, { status: 400 });

  try {
    const parsed = new URL(target);
    if (!/(^|\.)scribd\.com$/.test(parsed.hostname)) {
      return Response.json({ error: 'host no permitido' }, { status: 400 });
    }

    const response = await fetch(parsed.href, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      },
      redirect: 'follow'
    });

    const text = await response.text();
    return Response.json({
      status: response.status,
      finalUrl: response.url,
      len: text.length,
      pages: (text.match(/docManager\.addPage\(/g) || []).length,
      challenge: /Client Challenge/i.test(text.slice(0, 8000)),
      region: process.env.VERCEL_REGION || null,
      head: text.slice(0, 80).replace(/\s+/g, ' ')
    });
  } catch (error) {
    return Response.json({ error: String(error && error.message ? error.message : error) }, { status: 502 });
  }
}
