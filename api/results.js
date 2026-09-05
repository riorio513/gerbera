'use strict';
/* 集計。作った本人だけが見られるよう、投票を作ったときに一度だけ渡した
   合言葉（ownerKey）と突き合わせる。合言葉はライバーの端末にしか無い。 */
import {
  TOKEN, sha256, safeEqual, json, loadPoll, listVotes, isClosed, isExpired, guard
} from './_poll-store.js';

async function handler(req, res) {
  if (!TOKEN) return json(res, 500, { error: 'storage_unconfigured' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const id = String(req.query.id || '');
  const key = String(req.query.key || '');
  if (!/^[0-9a-f]{16,64}$/.test(id)) return json(res, 400, { error: 'bad_id' });

  const poll = await loadPoll(id);
  if (!poll || isExpired(poll)) return json(res, 404, { error: 'not_found' });
  if (!safeEqual(sha256(key), poll.ownerKeyHash)) return json(res, 403, { error: 'forbidden' });

  const votes = await listVotes(id);
  const counts = poll.options.map(() => 0);
  const voters = poll.options.map(() => []);
  for (const v of votes) {
    if (v.choice < counts.length) {
      counts[v.choice]++;
      if (v.name) voters[v.choice].push(v.name);
    }
  }

  const total = votes.length;
  const rows = poll.options.map((label, i) => ({
    label, count: counts[i],
    percent: total ? Math.round((counts[i] / total) * 1000) / 10 : 0,
    names: voters[i]
  })).sort((a, b) => b.count - a.count);

  return json(res, 200, {
    id, title: poll.title, total, rows,
    deadline: poll.deadline || null,
    closed: isClosed(poll)
  });
}

export default guard(handler);
