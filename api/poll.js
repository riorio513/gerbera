'use strict';
/* 投票の作成（ライバー）と読み出し（リスナー）。
   GET はお題と選択肢しか返さない。票の内訳は results.js が
   ライバーの合言葉つきでしか返さないので、リンクを開いた人が
   他の人の投票を見ることはできない。 */
import {
  TOKEN, MIN_OPTIONS, MAX_OPTIONS, MAX_TITLE, MAX_OPTION, MAX_LIMIT_SEC,
  newId, newPin, sha256, safeEqual, json, readBody, loadPoll, savePoll, isClosed, isExpired, guard
} from './_poll-store.js';

async function handler(req, res) {
  if (!TOKEN) return json(res, 500, { error: 'storage_unconfigured' });

  if (req.method === 'GET') {
    const id = String(req.query.id || '');
    if (!/^[0-9a-f]{16,64}$/.test(id)) return json(res, 400, { error: 'bad_id' });
    const poll = await loadPoll(id);
    if (!poll || isExpired(poll)) return json(res, 404, { error: 'not_found' });

    const closed = isClosed(poll);
    /* 合言葉つきの投票は、正しい合言葉が来るまでお題も選択肢も一切渡さない */
    if (poll.passHash) {
      const pass = req.query.pass ? String(req.query.pass) : '';
      if (!pass) return json(res, 200, { id: poll.id, needsPass: true, closed });
      if (!safeEqual(sha256(pass), poll.passHash)) return json(res, 403, { error: 'bad_pass' });
    }
    return json(res, 200, {
      id: poll.id,
      title: poll.title,
      options: poll.options,
      deadline: poll.deadline || null,
      closed
    });
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    if (!body) return json(res, 400, { error: 'bad_json' });

    const title = String(body.title || '').trim();
    if (!title) return json(res, 400, { error: 'title_required' });
    if (title.length > MAX_TITLE) return json(res, 400, { error: 'title_too_long' });

    const options = Array.isArray(body.options)
      ? body.options.map(o => String(o || '').trim()).filter(Boolean)
      : [];
    if (options.length < MIN_OPTIONS) return json(res, 400, { error: 'need_two_options' });
    if (options.length > MAX_OPTIONS) return json(res, 400, { error: 'too_many_options' });
    if (options.some(o => o.length > MAX_OPTION)) return json(res, 400, { error: 'option_too_long' });

    let deadline = null;
    const sec = Math.floor(Number(body.limitSec) || 0);
    if (sec > 0) {
      if (sec > MAX_LIMIT_SEC) return json(res, 400, { error: 'limit_too_long' });
      deadline = Date.now() + sec * 1000;
    }

    /* 「誰でも投票可能」がOFF（既定）のときだけ合言葉を発行する。
       生の合言葉はこのレスポンスでライバーの端末に一度渡すだけで、
       サーバーにはハッシュしか残さない（ownerKeyと同じやり方）。 */
    const openToAll = body.openToAll === true;
    const pass = openToAll ? null : newPin();

    const id = newId(12);
    const ownerKey = newId(16);
    await savePoll({
      id, title, options, deadline,
      createdAt: Date.now(),
      ownerKeyHash: sha256(ownerKey),
      passHash: pass ? sha256(pass) : null
    });
    return json(res, 200, { id, ownerKey, deadline, pass });
  }

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { error: 'method_not_allowed' });
}

export default guard(handler);
