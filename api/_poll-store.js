'use strict';
/* ============================================================
   投票機能の保存まわり（Vercel Blob）

   ガーベラは端末内のlocalStorageだけで動く静的サイトだが、
   投票だけはリスナーが自分の端末から書き込むためサーバー側の
   置き場所が要る。ここだけが唯一の例外で、保存するのは
   「そのとき配布された投票」のお題・選択肢・票だけ。

   置き方
     polls/<pollId>.json                          … 投票の定義
     polls/<pollId>/v/<voterId>-<choice>-<hex>.json … 1票

   票は中身を空にして、必要な情報をすべてファイル名に入れている。
   こうすると集計が list() 1回で済み、票の数だけ本文を読みに行かずに
   すむ（配信中に「集計を行う」を押してから待たせない）。
   1人1ファイルなので、同時に投票されても取りこぼしが起きない。
   ============================================================ */
import { list, put, del } from '@vercel/blob';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

export const MAX_OPTIONS = 5;
export const MIN_OPTIONS = 2;
export const MAX_TITLE = 200;
export const MAX_OPTION = 60;
export const MAX_NAME = 30;
export const MAX_LIMIT_SEC = 7 * 86400;   // 制限時間の上限は7日
export const POLL_TTL_MS = 7 * 86400000;  // 7日たった投票は取得を断る

export const pollKey = id => `polls/${id}.json`;
export const votePrefix = id => `polls/${id}/v/`;

export function newId(bytes = 12) { return randomBytes(bytes).toString('hex'); }
export function sha256(s) { return createHash('sha256').update(String(s)).digest('hex'); }
/* 合言葉は口頭やチャットで伝える想定なので、覚えやすい6桁の数字にする */
export function newPin() { return String(randomInt(0, 1000000)).padStart(6, '0'); }

/* 投票者の名前はそのままファイル名にできないので16進で持つ（空＝匿名） */
export const encName = s => Buffer.from(String(s || ''), 'utf8').toString('hex');
export const decName = hex => {
  if (!hex) return '';
  try { return Buffer.from(hex, 'hex').toString('utf8'); } catch { return ''; }
};

export function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  if (x.length !== y.length || !x.length) return false;
  return timingSafeEqual(x, y);
}

export function json(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body));
}

/* 本文は必ず生のストリームから読む。req.body は中身が壊れていると
   触った瞬間に例外を投げるゲッターで、関数ごと落ちてしまうため。
   読めなかったときは null を返し、呼び出し側が400で返す。 */
export async function readBody(req) {
  let raw = '';
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    raw = Buffer.concat(chunks).toString('utf8');
  } catch (e) { raw = ''; }
  if (!raw) {
    try {
      const b = req.body;
      if (b && typeof b === 'object') return b;
      if (typeof b === 'string') raw = b;
    } catch (e) { return null; }
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return null; }
}

/* 想定外の例外でも500の生エラーを返さず、JSONで返す */
export function guard(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (e) {
      console.error('[poll api]', e && e.stack || e);
      if (!res.headersSent) json(res, 500, { error: 'server_error' });
    }
  };
}

/* 非公開ストアなので、本文を読むにはトークンを添えて取りに行く */
export async function loadPoll(id) {
  const { blobs } = await list({ prefix: pollKey(id), limit: 1, token: TOKEN });
  if (!blobs.length) return null;
  const b = blobs[0];
  const auth = { Authorization: `Bearer ${TOKEN}` };
  let r = await fetch(b.downloadUrl || b.url, { headers: auth, cache: 'no-store' });
  if (!r.ok && b.url) r = await fetch(b.url, { headers: auth, cache: 'no-store' });
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

export async function savePoll(poll) {
  await put(pollKey(poll.id), JSON.stringify(poll), {
    access: 'private', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true, token: TOKEN
  });
}

/* 票のファイル名を読み解く。<voterId>-<choice>-<hexName>.json */
function parseVote(pathname) {
  const file = pathname.slice(pathname.lastIndexOf('/') + 1).replace(/\.json$/, '');
  const parts = file.split('-');
  if (parts.length < 3) return null;
  const choice = Number(parts[1]);
  if (!Number.isInteger(choice) || choice < 0) return null;
  return { voterId: parts[0], choice, name: decName(parts[2]) };
}

export async function listVotes(id) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix: votePrefix(id), cursor, limit: 1000, token: TOKEN });
    for (const b of page.blobs) {
      const v = parseVote(b.pathname);
      if (v) out.push({ ...v, pathname: b.pathname });
    }
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  return out;
}

/* 同じ端末から入れ直したときは前の票を消してから入れる（1人1票） */
export async function castVote(id, voterId, choice, name) {
  const existing = (await listVotes(id)).filter(v => v.voterId === voterId);
  if (existing.length) {
    await del(existing.map(v => v.pathname), { token: TOKEN });
  }
  await put(`${votePrefix(id)}${voterId}-${choice}-${encName(name)}.json`, '{}', {
    access: 'private', contentType: 'application/json',
    addRandomSuffix: false, allowOverwrite: true, token: TOKEN
  });
  return { replaced: existing.length > 0 };
}

/* 締め切りを過ぎているか。deadline が null なら制限時間なし */
export const isClosed = poll => !!poll.deadline && Date.now() >= poll.deadline;
export const isExpired = poll => Date.now() - (poll.createdAt || 0) > POLL_TTL_MS;
