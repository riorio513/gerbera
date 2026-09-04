/* ============================================================
   IRIAM の公式イベント・キャンペーン情報／ニュースを取得して
   gerbera/data/iriam-feed.json を更新するスクリプト。

   - GitHub Actions（.github/workflows/iriam-monthly.yml）から
     毎月末（JST）に1回だけ呼ばれる想定。
   - ここでの「日付」は告知の投稿日。開催日はタイトル文から
     ベストエフォートで抜き出して eventDateText に入れる。
   - 取得に失敗しても、既存の JSON は壊さず（前回分を残して）
     終了コード0で抜ける。アプリ側は JSON が無い／古いときは
     「準備中」表示にフォールバックする。
   ============================================================ */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as cheerio from 'cheerio';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'iriam-feed.json');

const EVENTS_URL = 'https://info.iriam.com/6ddceb3cc87f48feae92c642359c0c9a'; // 「イベント・キャンペーン等お知らせ」
const NEWS_URL = 'https://iriam.com/news';
const UA = 'gerbera-bot/1.0 (+https://riorio513.github.io/gerbera/; displays IRIAM official event info)';

const EVENT_MAX = 8;          // 出すイベントの最大件数
const EVENT_RECENT_DAYS = 50; // イベント告知の「直近」の範囲（投稿日ベース）
const NEWS_RECENT_DAYS = 120; // 公式ニュースの「直近」の範囲

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA, 'accept-language': 'ja' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

/* "2026年08月26日" / "2026年8月3日" -> "2026-08-26" */
function jpDateToISO(s) {
  const m = (s || '').match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/* "2026.06.30" -> "2026-06-30" */
function dotDateToISO(s) {
  const m = (s || '').match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/* タイトル文から開催日・期間っぽい部分を抜く（ベストエフォート。無ければ null）
   例: "8/11から！…", "7/20まで！…", "8/11〜8/17…", "期間延長6/17まで！…" */
function extractEventDateText(title) {
  const t = String(title || '');
  // M/D(曜) 〜 M/D(曜) の範囲
  let m = t.match(/(\d{1,2}\/\d{1,2})(?:\([日月火水木金土]\))?\s*[〜~ー-]\s*(\d{1,2}\/\d{1,2})(?:\([日月火水木金土]\))?/);
  if (m) return `${m[1]}〜${m[2]}`;
  // M/D + から / まで
  m = t.match(/(\d{1,2}\/\d{1,2})(?:\([日月火水木金土]\))?\s*(から|まで)/);
  if (m) return `${m[1]}${m[2]}`;
  // M月D日 + から / まで
  m = t.match(/(\d{1,2}月\d{1,2}日)\s*(から|まで)?/);
  if (m) return `${m[1]}${m[2] || ''}`;
  // 単独の M/D
  m = t.match(/(?:^|[^\d])(\d{1,2}\/\d{1,2})(?:[^\d]|$)/);
  if (m) return m[1];
  return null;
}

function daysAgo(iso) {
  if (!iso) return Infinity;
  return (Date.now() - Date.parse(iso + 'T00:00:00+09:00')) / 86400000;
}

/* ランキングイベント・スコアイベントっぽいものか（配信者ランク別のイベント含む） */
const RANKING_RE = /ランキング|スコア|ランク別|SCORE|RANK/i;

async function getEventsRaw() {
  const html = await fetchText(EVENTS_URL);
  const $ = cheerio.load(html);
  const cards = $('.notion-collection-card');
  const items = [];
  cards.each((_, el) => {
    const $c = $(el);
    const $a = $c.find('.notion-collection-card__anchor').first();
    const title = $a.text().trim();
    let href = $a.attr('href') || '';
    if (!title || !href) return;
    if (href.startsWith('/')) href = 'https://info.iriam.com' + href;
    const category = $c.find('.notion-property__select').first().text().trim() || null;
    let postedDate = null;
    $c.find('.notion-collection-card__property').each((__, p) => {
      const iso = jpDateToISO($(p).text());
      if (iso && !postedDate) postedDate = iso;
    });
    items.push({
      title,
      category,
      postedDate,
      eventDateText: extractEventDateText(title),
      url: href
    });
  });

  const seen = new Set();
  const uniq = items.filter(it => (seen.has(it.url) ? false : seen.add(it.url)));
  uniq.sort((a, b) => String(b.postedDate || '').localeCompare(String(a.postedDate || '')));
  return uniq;
}

async function getEvents(uniq) {
  const rows = uniq.filter(it => !RANKING_RE.test((it.category || '') + ' ' + it.title));
  const recent = rows.filter(it => daysAgo(it.postedDate) <= EVENT_RECENT_DAYS);
  return (recent.length >= 3 ? recent : rows).slice(0, EVENT_MAX);
}

async function getRanking(uniq) {
  // 公開ページ（イベント・キャンペーン一覧）に出ている範囲でのランキング／スコアイベント。
  // ランク別のランキングイベント等は eventportal（要ログイン）にあることが多く、
  // ここで取れるのは公式が一覧に載せたぶんだけ。
  return uniq
    .filter(it => RANKING_RE.test((it.category || '') + ' ' + it.title))
    .filter(it => daysAgo(it.postedDate) <= EVENT_RECENT_DAYS + 30)
    .slice(0, EVENT_MAX);
}

async function getNews() {
  const html = await fetchText(NEWS_URL);
  const $ = cheerio.load(html);
  const out = [];
  $('a[href]').each((_, el) => {
    const $a = $(el);
    const raw = $a.text().replace(/\s+/g, ' ').trim();
    const href = $a.attr('href') || '';
    const dm = raw.match(/DATE\s*([\d.]+)/);
    if (!dm) return;
    const date = dotDateToISO(dm[1]);
    const title = raw.replace(/DATE\s*[\d.]+/, '').trim();
    if (!title) return;
    // IRIAM 運営自身のお知らせだけに絞る（外部メディアの記事は除外）
    const isInternal = href.startsWith('/news/') || href.includes('iriam.com/news/');
    const looksOfficial = /【(お知らせ|重要|重要なお知らせ|メンテナンス|アップデート)】/.test(title);
    if (!isInternal && !looksOfficial) return;
    let url = href;
    if (url.startsWith('/')) url = 'https://iriam.com' + url;
    out.push({ title, date, url });
  });
  const seen = new Set();
  return out
    .filter(it => (seen.has(it.url) ? false : seen.add(it.url)))
    .filter(it => daysAgo(it.date) <= NEWS_RECENT_DAYS) // 古いお知らせは出さない
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 3);
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(OUT, 'utf8'));
  } catch {
    return null;
  }
}

function nextMonthKey() {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // JST
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 今月
  const nm = m === 12 ? 1 : m + 1;
  const ny = m === 12 ? y + 1 : y;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

async function main() {
  const prev = await readExisting();
  let events = [];
  let ranking = [];
  let news = [];
  const errors = [];

  try {
    const uniq = await getEventsRaw();
    events = await getEvents(uniq);
    ranking = await getRanking(uniq);
  } catch (e) {
    errors.push(`events: ${e.message}`);
    if (prev?.events) events = prev.events; // 前回分を維持
    if (prev?.ranking) ranking = prev.ranking;
  }
  try {
    news = await getNews();
  } catch (e) {
    errors.push(`news: ${e.message}`);
    if (prev?.news) news = prev.news;
  }

  if (!events.length && !ranking.length && !news.length) {
    console.error('取得結果が空。既存 JSON を維持して終了。', errors);
    process.exit(0);
  }

  const payload = {
    source: {
      events: 'https://info.iriam.com/イベントキャンペーン等お知らせ',
      news: NEWS_URL
    },
    generated: new Date().toISOString(),
    targetMonth: nextMonthKey(),
    note: '本データは IRIAM 公式ページ（info.iriam.com / iriam.com）から自動取得した案内です。日付は告知の投稿日、開催日はタイトルからの推定です。',
    events,
    ranking,
    news
  };
  if (errors.length) payload.partialErrors = errors;

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`書き出し: ${OUT}  events=${events.length} ranking=${ranking.length} news=${news.length}${errors.length ? '  (partial: ' + errors.join('; ') + ')' : ''}`);
}

main().catch(e => {
  console.error('想定外のエラー:', e);
  process.exit(1);
});
