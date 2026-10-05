'use strict';
/* ログイン（メールアドレス＋パスワード）。メール確認はしない。
   POST /api/auth  { action: 'signup' | 'login' | 'me', email, password, token }
   ・パスワードは salt つき scrypt のハッシュだけを保存する（生の値は残さない）。
   ・ログイン後は、有効期限つきの署名つきトークン（HMAC-SHA256）を返す。
     サーバーにセッションは持たず、署名と期限で確かめる。
   ・管理者かどうかは、環境変数 ADMIN_EMAILS（カンマ区切り）に含まれるかで
     サーバー側が判定する。ブラウザ側のコードには管理者の情報を持たせない。
   パスワードを忘れたとき用に、メール送信を使わない「再設定用コード」を使う。
   ・登録時に1つ発行して一度だけ見せる（サーバーにはハッシュだけを残す）
   ・ログイン中は、設定から発行し直せる（前のコードは無効になる）
   ・再設定に成功したコードは使い捨てで、新しいコードをその場で発行して見せる
   保存先: users/<メールアドレスの sha256>.json（非公開の Blob ストア） */
import { randomBytes, randomInt, scryptSync, createHmac, timingSafeEqual } from 'node:crypto';
import { list, put, del } from '@vercel/blob';
import { TOKEN, sha256, json, readBody, guard, safeEqual } from './_poll-store.js';

const SECRET = process.env.AUTH_SECRET || '';
const ADMINS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const SESSION_MS = 180 * 86400000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 保存のしかた
     users/<h>/created        … 登録の目印（上書き不可＝同じメールの二重登録を防ぐ）
     users/<h>/v-<時刻>.json   … ユーザー情報。更新のたびに新しいものを書き足し、一番新しいものを使う
     users/<h>.json           … 旧形式（読むだけ）
   同じ場所を上書きすると、保管庫のキャッシュで古い内容が返り続けてしまう。
   一覧(list)はキャッシュされないので、「新しい名前で書き足して一覧から選ぶ」方式にしている。 */
const userDir = email => `users/${sha256(email)}/`;
const legacyKey = email => `users/${sha256(email)}.json`;
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

async function readBlob(b) {
  const auth = { Authorization: `Bearer ${TOKEN}` };
  let r = await fetch(b.downloadUrl || b.url, { headers: auth, cache: 'no-store' });
  if (!r.ok && b.url) r = await fetch(b.url, { headers: auth, cache: 'no-store' });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

async function userVersions(email) {
  const { blobs } = await list({ prefix: userDir(email) + 'v-', limit: 1000, token: TOKEN });
  return blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
}

async function loadUser(email) {
  const versions = await userVersions(email);
  if (versions.length) return readBlob(versions[versions.length - 1]);
  const { blobs } = await list({ prefix: legacyKey(email), limit: 1, token: TOKEN });
  return blobs.length ? readBlob(blobs[0]) : null;
}

/* 紛らわしい文字(0/O, 1/I/L)を除いた16文字。XXXX-XXXX-XXXX-XXXX の形で見せる */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newRecoveryCode() {
  let c = '';
  for (let i = 0; i < 16; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)];
  return c.match(/.{4}/g).join('-');
}
const normCode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/* isNew のときだけ登録の目印を置く。すでにあれば例外になり、呼び出し側が「登録済み」と返す */
async function saveUser(user, isNew) {
  if (isNew) {
    await put(userDir(user.email) + 'created', '{}', {
      access: 'private', contentType: 'application/json',
      addRandomSuffix: false, allowOverwrite: false, token: TOKEN
    });
  }
  const before = await userVersions(user.email);
  const stamp = String(Date.now()).padStart(15, '0') + '-' + randomBytes(3).toString('hex');
  await put(`${userDir(user.email)}v-${stamp}.json`, JSON.stringify(user), {
    access: 'private', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: false, token: TOKEN
  });
  if (before.length) {
    try { await del(before.map(b => b.pathname), { token: TOKEN }); } catch (e) {}
  }
}

function passwordOk(user, password) {
  const got = Buffer.from(hashPassword(password, user ? user.salt : '00'.repeat(16)), 'hex');
  const want = Buffer.from(user ? user.hash : '00'.repeat(64), 'hex');
  return !!user && got.length === want.length && timingSafeEqual(got, want);
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

  /* ログイン中の操作（パスワード変更・再設定用コードの発行し直し） */
  if (action === 'changepw' || action === 'newcode') {
    const p = verify(body.token);
    if (!p) return json(res, 401, { error: 'invalid_token' });
    const user = await loadUser(p.email);
    if (!user) return json(res, 401, { error: 'invalid_token' });
    if (!passwordOk(user, String(body.password || ''))) return json(res, 403, { error: 'bad_current' });
    if (action === 'changepw') {
      const np = String(body.newPassword || '');
      if (np.length < 8 || np.length > 128) return json(res, 400, { error: 'bad_password' });
      const salt = randomBytes(16).toString('hex');
      await saveUser({ ...user, salt, hash: hashPassword(np, salt) }, false);
      return json(res, 200, { ok: true });
    }
    const code = newRecoveryCode();
    await saveUser({ ...user, recoveryHash: sha256(normCode(code)) }, false);
    return json(res, 200, { recoveryCode: code });
  }

  /* パスワードを忘れたとき：メールアドレス＋再設定用コードで、新しいパスワードを決める */
  if (action === 'reset') {
    const em = String(body.email || '').trim().toLowerCase();
    const np = String(body.newPassword || '');
    if (!EMAIL_RE.test(em) || em.length > 254) return json(res, 400, { error: 'bad_email' });
    if (np.length < 8 || np.length > 128) return json(res, 400, { error: 'bad_password' });
    const user = await loadUser(em);
    const given = sha256(normCode(body.code));
    if (!user || !user.recoveryHash || !safeEqual(given, user.recoveryHash)) {
      return json(res, 403, { error: 'bad_recovery' });
    }
    const salt = randomBytes(16).toString('hex');
    const code = newRecoveryCode();
    await saveUser({ ...user, salt, hash: hashPassword(np, salt), recoveryHash: sha256(normCode(code)) }, false);
    return json(res, 200, { ...session(em), recoveryCode: code });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!EMAIL_RE.test(email) || email.length > 254) return json(res, 400, { error: 'bad_email' });
  if (password.length < 8 || password.length > 128) return json(res, 400, { error: 'bad_password' });

  if (action === 'signup') {
    if (await loadUser(email)) return json(res, 409, { error: 'email_taken' });
    const salt = randomBytes(16).toString('hex');
    const code = newRecoveryCode();
    try {
      await saveUser({
        email, salt, hash: hashPassword(password, salt),
        recoveryHash: sha256(normCode(code)), createdAt: Date.now()
      }, true);
    } catch (e) {
      return json(res, 409, { error: 'email_taken' });
    }
    return json(res, 200, { ...session(email), recoveryCode: code });
  }

  if (action === 'login') {
    const user = await loadUser(email);
    /* 存在しないメールでも同じ時間をかけて、存在の有無を時間から推測されにくくする */
    if (!passwordOk(user, password)) return json(res, 401, { error: 'bad_credentials' });
    return json(res, 200, session(email));
  }

  return json(res, 400, { error: 'bad_action' });
}

export default guard(handler);
