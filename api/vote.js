'use strict';
/* リスナーが1票入れる。返すのは受け付けたかどうかだけで、
   今どの選択肢が何票かは決して返さない。 */
import {
  TOKEN, MAX_NAME, sha256, safeEqual, json, readBody, loadPoll, castVote, isClosed, isExpired, guard
} from './_poll-store.js';

async function handler(req, res) {
  if (!TOKEN) return json(res, 500, { error: 'storage_unconfigured' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const body = await readBody(req);
  if (!body) return json(res, 400, { error: 'bad_json' });

  const id = String(body.id || '');
  const voterId = String(body.voterId || '');
  if (!/^[0-9a-f]{16,64}$/.test(id)) return json(res, 400, { error: 'bad_id' });
  if (!/^[0-9a-f]{8,64}$/.test(voterId)) return json(res, 400, { error: 'bad_voter' });

  const poll = await loadPoll(id);
  if (!poll || isExpired(poll)) return json(res, 404, { error: 'not_found' });
  if (isClosed(poll)) return json(res, 409, { error: 'closed' });

  /* 合言葉つきの投票は、投票の送信自体もその場で確かめる。
     ゲート画面を素通りしてAPIを直接叩かれても票が入らないようにするため。 */
  if (poll.passHash && !safeEqual(sha256(String(body.pass || '')), poll.passHash)) {
    return json(res, 403, { error: 'bad_pass' });
  }

  const choice = Number(body.choice);
  if (!Number.isInteger(choice) || choice < 0 || choice >= poll.options.length) {
    return json(res, 400, { error: 'bad_choice' });
  }

  /* 名前は空でよい（無記名＝匿名投票）。ハイフンはファイル名の区切りに
     使っているが、名前は16進にしてから入れるので混ざる心配はない。 */
  const name = String(body.name || '').trim().slice(0, MAX_NAME);

  await castVote(id, voterId, choice, name);
  return json(res, 200, { ok: true });
}

export default guard(handler);
