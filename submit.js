/**
 * Optional. Only used when GCC_USE_PROXY is on.
 *
 * Forwards a submission to the Apps Script web app, reading the URL from an
 * environment binding so it never appears in the page source. Same-origin,
 * so there's no CORS involved at all.
 *
 * Requires GCC_ENDPOINT to be set on the Pages project (Production and Preview).
 */

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'use POST' }, 405);
  }

  const target = env.GCC_ENDPOINT;
  if (!target) {
    return json({ ok: false, error: 'form is not configured — GCC_ENDPOINT is missing' }, 500);
  }

  const body = await request.text();
  if (body.length > 100000) {
    return json({ ok: false, error: 'submission too large' }, 413);
  }

  try {
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow'
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return json({ ok: false, error: 'could not reach the response sheet — try again' }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
