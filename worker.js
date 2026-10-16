/**
 * The Championship 2026 — Worker de notificaciones push
 * ------------------------------------------------------
 * Recibe un pedido de la app (solo desde el dispositivo del administrador,
 * que conoce el token) y entrega la notificación a cada suscripción.
 *
 * Implementa Web Push con cifrado aes128gcm (RFC 8291) y firma VAPID (RFC 8292).
 *
 * Variables de entorno a configurar en Cloudflare:
 *   VAPID_PUBLIC   clave pública (la misma que usa la app)
 *   VAPID_PRIVATE  clave privada  ← secreta
 *   VAPID_SUBJECT  mailto:tu-correo@ejemplo.com
 *   SEND_TOKEN     clave que habilita el envío ← secreta
 */

const enc = new TextEncoder();

const b64urlToBytes = (s) => {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const bytesToB64url = (b) => {
  let s = '';
  const a = new Uint8Array(b);
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const concat = (...arrs) => {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
};

// ── HKDF (RFC 5869) ────────────────────────────────────────────────────────
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
  return new Uint8Array(bits);
}

// ── Firma VAPID: JWT ES256 ─────────────────────────────────────────────────
async function vapidHeaders(endpoint, env) {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(enc.encode(JSON.stringify({
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT || 'mailto:admin@thechampionship2026',
  })));
  const unsigned = header + '.' + payload;

  const pub = b64urlToBytes(env.VAPID_PUBLIC);
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    d: env.VAPID_PRIVATE,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
  };
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned));

  return {
    Authorization: 'vapid t=' + unsigned + '.' + bytesToB64url(sig) + ', k=' + env.VAPID_PUBLIC,
  };
}

// ── Cifrado del cuerpo (aes128gcm, RFC 8291) ───────────────────────────────
async function encryptPayload(plaintext, p256dhB64, authB64) {
  const clientPub = b64urlToBytes(p256dhB64);   // 65 bytes, sin comprimir
  const authSecret = b64urlToBytes(authB64);    // 16 bytes

  // Par efímero del servidor
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));

  const clientKey = await crypto.subtle.importKey(
    'raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientKey }, eph.privateKey, 256));

  // IKM = HKDF(auth, shared, "WebPush: info" || clientPub || serverPub)
  const infoKey = concat(enc.encode('WebPush: info\0'), clientPub, ephPubRaw);
  const ikm = await hkdf(authSecret, shared, infoKey, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek   = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  // El texto va con un delimitador 0x02 al final (último registro)
  const padded = concat(enc.encode(plaintext), new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // Cabecera: salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([ephPubRaw.length]), ephPubRaw, ct);
}

// ── Envío a una suscripción ────────────────────────────────────────────────
async function sendOne(sub, payload, env) {
  const body = await encryptPayload(payload, sub.keys.p256dh, sub.keys.auth);
  const headers = await vapidHeaders(sub.endpoint, env);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'high',
    },
    body,
  });
  return { status: res.status, ok: res.ok, endpoint: sub.endpoint.slice(-14) };
}

// ── Punto de entrada ───────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response('Championship push worker', { headers: cors });
    }

    let data;
    try { data = await request.json(); }
    catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400, headers: cors }); }

    if (!env.SEND_TOKEN || data.token !== env.SEND_TOKEN) {
      return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401, headers: cors });
    }

    const subs = Array.isArray(data.subs) ? data.subs : [];
    if (!subs.length) {
      return new Response(JSON.stringify({ error: 'sin suscripciones' }), { status: 400, headers: cors });
    }

    const payload = JSON.stringify({
      title: data.title || 'The Championship 2026',
      body:  data.body  || '',
      url:   data.url   || '/thechampionship2026/',
      tag:   data.tag   || 'championship',
    });

    const results = [];
    for (const sub of subs) {
      try {
        if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
          results.push({ ok: false, status: 0, error: 'suscripción incompleta' });
          continue;
        }
        results.push(await sendOne(sub, payload, env));
      } catch (e) {
        results.push({ ok: false, status: 0, error: String(e && e.message || e) });
      }
    }

    const enviados = results.filter(r => r.ok).length;
    // 404 y 410 = la suscripción ya no existe: la app debe borrarla
    const caducadas = results
      .map((r, i) => (r.status === 404 || r.status === 410) ? subs[i].endpoint : null)
      .filter(Boolean);

    return new Response(JSON.stringify({ enviados, total: subs.length, caducadas, results }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
