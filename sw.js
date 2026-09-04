'use strict';
/* ============================================================
   ガーベラ Service Worker（通知専用）
   - キャッシュ（fetchハンドラ）は持たない。既存の配信物には一切干渉しない。
   - カレンダーで「リマインドする」にした予定を、その日にOS通知として出す。
     * アプリを開いたとき   … window側（js/push.js）が showNotification する
     * アプリを閉じている間 … periodicsync（対応ブラウザのみ・PWA導入時）で拾う
     * 予約可能なら         … window側が TimestampTrigger で当日分を予約する
   - 予定のスナップショットと「通知済みキー」は Cache Storage 経由で
     window と SW が共有する（'gerbera-notify' / 'notify-state'）。
   ============================================================ */
const STATE_CACHE = 'gerbera-notify';
const STATE_KEY = 'notify-state';

async function getState() {
  try {
    const c = await caches.open(STATE_CACHE);
    const r = await c.match(STATE_KEY);
    if (!r) return { reminders: [], notified: [] };
    const s = await r.json();
    return { reminders: s.reminders || [], notified: s.notified || [] };
  } catch (e) {
    return { reminders: [], notified: [] };
  }
}
async function putState(state) {
  const c = await caches.open(STATE_CACHE);
  await c.put(STATE_KEY, new Response(JSON.stringify(state), {
    headers: { 'content-type': 'application/json' }
  }));
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function checkAndNotify() {
  const state = await getState();
  const t = todayISO();
  let changed = false;
  for (const r of state.reminders) {
    if (r.date === t && !state.notified.includes(r.key)) {
      await self.registration.showNotification(r.title || 'ガーベラ', {
        body: r.body || '今日の予定です',
        tag: 'gr-' + r.key,
        icon: 'icon.svg',
        badge: 'icon.svg',
        data: { url: './#calendar' }
      });
      state.notified.push(r.key);
      changed = true;
    }
  }
  if (changed) await putState(state);
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('periodicsync', e => {
  if (e.tag === 'gerbera-reminders') e.waitUntil(checkAndNotify());
});
self.addEventListener('sync', e => {
  if (e.tag === 'gerbera-reminders') e.waitUntil(checkAndNotify());
});
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'check') e.waitUntil(checkAndNotify());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './#calendar';
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('focus' in c) { c.focus(); if ('navigate' in c) { try { await c.navigate(url); } catch (err) {} } return; }
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
