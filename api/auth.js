'use strict';
/* ログイン（メールアドレス＋パスワード）。メール確認はしない。
   POST /api/auth  { action: 'signup' | 'login' | 'me', email, password, token }
   ・パスワードは salt つき scrypt のハッシュだけを保存する（生の値は残さない）。
   ・ログイン後は、有効期限つきの署名つきトークン（HMAC-SHA256）を返す。
     サーバーにセッションは持たず、署名と期限で確かめる。
   ・管理者かどうかは、環境変数 ADMIN_EMAILS（カンマ区切り）に含まれるかで
     サーバー側が判定する。ブラウザ側のコードには管理者の情報を持たせない。
   保存先: users/<メールアドレスの sha256>.json（非公開の Blob ストア） */
import { randomBytes, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';
import { list, put } from '@vercel/blob';
import { TOKEN, sha256, json, readBody, guard } from './_poll-store.js';

const SECRET = process.env.AUTH_SECRET || '';
const ADMINS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const SESSION_MS = 180 * 86400000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userKey = email => `users/${sha256(email)}.json`;
const b64 = buf => Buffer.from(buf).toString('base64url');

function hashPassword(password, salt) {
  return scryptSync(String(password), salt, 64).toString('hex');
}

function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const mac = createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expect = createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    return p && p.exp > Date.now() && p.email ? p : null;
  } catch { return null; }
}

async function loadUser(email) {
  const { blobs } = await list({ prefix: userKey(email), limit: 1, token: TOKEN });
  if (!blobs.length) return null;
  const b = blobs[0];
  const auth = { Authorization: `Bearer ${TOKEN}` };
  let r = await fetch(b.downloadUrl || b.url, { headers: auth, cache: 'no-store' });
  if (!r.ok && b.url) r = await fetch(b.url, { headers: auth, cache: 'no-store' });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

function session(email) {
  const exp = Date.now() + SESSION_MS;
  return { token: sign({ email, exp }), email, admin: ADMINS.includes(email), exp };
}

async function handler(req, res) {
  if (!TOKEN || !SECRET) return json(res, 500, { error: 'auth_unconfigured' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }
  const body = await readBody(req);
  if (!body) return json(res, 400, { error: 'bad_json' });
  const action = String(body.action || '');

  if (action === 'me') {
    const p = verify(body.token);
    if (!p) return json(res, 401, { error: 'invalid_token' });
    return json(res, 200, { email: p.email, admin: ADMINS.includes(p.email), exp: p.exp });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 254) return json(res, 400, { error: 'bad_email' });
  if (password.length < 8 || password.length > 128) return json(res, 400, { error: 'bad_password' });

  if (action === 'signup') {
    if (await loadUser(email)) return json(res, 409, { error: 'email_taken' });
    const salt = randomBytes(16).toString('hex');
    try {
      await put(userKey(email), JSON.stringify({
        email, salt, hash: hashPassword(password, salt), createdAt: Date.now()
      }), {
        access: 'private', contentType: 'application/json',
        addRandomSuffix: false, allowOverwrite: false, token: TOKEN
      });
    } catch (e) {
      return json(res, 409, { error: 'email_taken' });
    }
    return json(res, 200, session(email));
  }

  if (action === 'login') {
    const user = await loadUser(email);
    /* 存在しないメールでも同じ時間をかけて、存在の有無を時間から推測されにくくする */
    const salt = user ? user.salt : '00'.repeat(16);
    const got = Buffer.from(hashPassword(password, salt), 'hex');
    const want = Buffer.from(user ? user.hash : '00'.repeat(64), 'hex');
    if (!user || got.length !== want.length || !timingSafeEqual(got, want)) {
      return json(res, 401, { error: 'bad_credentials' });
    }
    return json(res, 200, session(email));
  }

  return json(res, 400, { error: 'bad_action' });
}

export default guard(handler);
