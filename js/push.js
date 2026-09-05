'use strict';
/* ============================================================
   ガーベラ 通知（プッシュ通知トグル ON のときだけ動く）
   - 静的サイト（GitHub Pages）＝通知サーバーは持てないので、
     「OSに出せる範囲で」実際の通知を出す：
       1) アプリを開いたとき、今日ぶんの未通知リマインドを showNotification
       2) TimestampTrigger 対応ブラウザでは、当日〜数日先ぶんを予約
       3) periodicSync 対応かつPWA導入時は、閉じている間もSWが拾う
   - どれも未対応の環境では、アプリ内のリマインド表示（ダッシュボード）が
     フォールバックとして残る。
   ============================================================ */
(function () {
  const { toast } = Gerbera;
  const STATE_CACHE = 'gerbera-notify';
  const STATE_KEY = 'notify-state';
  const HORIZON_DAYS = 45;   // スナップショットに載せる先の範囲
  const TRIGGER_DAYS = 14;   // TimestampTrigger で予約する先の範囲
  const FIRE_HOUR = 9;       // 予約通知を鳴らす時刻（現地9:00）

  function iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function todayISO() { return iso(new Date()); }
  function parseISO(s) { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d; }

  /* カレンダーの「リマインドする」項目を、絶対日付つきに展開 */
  function buildReminders() {
    const Cal = Gerbera.Calendar;
    if (!Cal) return [];
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + HORIZON_DAYS * 86400000);
    const out = [];
    Cal.all().forEach(it => {
      if (!it.remind) return;
      if (it.type === 'todo' && it.done) return;
      let dates = [];
      if (it.type === 'birthday') {
        // 今年・来年の該当日で範囲内のもの
        const mmdd = it.date.slice(5);
        [start.getFullYear(), start.getFullYear() + 1].forEach(y => {
          const d = parseISO(`${y}-${mmdd}`);
          if (d && d >= start && d <= end) dates.push(iso(d));
        });
      } else {
        const d = parseISO(it.date);
        if (d && d >= start && d <= end) dates.push(it.date);
      }
      dates.forEach(dt => {
        out.push({
          key: it.id + '@' + dt,
          date: dt,
          title: titleFor(it),
          body: bodyFor(it, dt)
        });
      });
    });
    return out;
  }
  function titleFor(it) {
    if (it.type === 'event') return '🎪 ' + (it.title || 'イベント');
    if (it.type === 'plan') return '🎬 ' + (it.title || '企画');
    if (it.type === 'birthday') return '🎂 ' + (it.who || '') + ' さんの誕生日';
    if (it.type === 'todo') return '✅ ' + (it.task || 'Todo');
    return 'ガーベラ';
  }
  function bodyFor(it, dt) {
    const d = parseISO(dt);
    const md = d ? `${d.getMonth() + 1}月${d.getDate()}日` : dt;
    if (it.type === 'event') return `${md} からのイベントです`;
    if (it.type === 'plan') return `${md} の企画です` + (it.tools && it.tools.length ? `（予約ツール ${it.tools.length}件）` : '');
    if (it.type === 'birthday') return `今日は ${it.who || ''} さんの誕生日です`;
    if (it.type === 'todo') return `${md} のタスクです`;
    return md;
  }

  async function readState() {
    try {
      const c = await caches.open(STATE_CACHE);
      const r = await c.match(STATE_KEY);
      if (!r) return { reminders: [], notified: [] };
      const s = await r.json();
      return { reminders: s.reminders || [], notified: s.notified || [] };
    } catch (e) { return { reminders: [], notified: [] }; }
  }
  async function writeState(state) {
    const c = await caches.open(STATE_CACHE);
    await c.put(STATE_KEY, new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json' }
    }));
  }

  async function registerSW() {
    if (!('serviceWorker' in navigator)) return null;
    try {
      await navigator.serviceWorker.register('sw.js');
      return await navigator.serviceWorker.ready;
    } catch (e) { return null; }
  }

  const TIMER_TAG = 'gerbera-timer-end';

  const Push = {
    supported() { return 'Notification' in window && 'serviceWorker' in navigator; },
    granted() { return 'Notification' in window && Notification.permission === 'granted'; },

    /* 今すぐOS通知を出す（タイマー終了など、その場で起きたことを知らせる用）。
       許可が無いときは何もしない＝アプリ内の音とトーストだけが残る。 */
    async notifyNow(title, body) {
      if (!this.granted()) return false;
      try {
        const reg = navigator.serviceWorker ? await navigator.serviceWorker.ready : null;
        if (!reg) return false;
        await reg.showNotification(title, {
          body, tag: TIMER_TAG, renotify: true, icon: 'icon.svg', badge: 'icon.svg',
          vibrate: [200, 100, 200], data: { url: './' }
        });
        return true;
      } catch (e) { return false; }
    },

    /* 終了時刻を予約しておく（対応ブラウザのみ）。
       IRIAMアプリに切り替えてガーベラが止められても、この予約なら通知が出る。 */
    async scheduleAt(when, title, body) {
      await this.cancelScheduled();
      if (!this.granted()) return false;
      if (!('showTrigger' in Notification.prototype) || !window.TimestampTrigger) return false;
      if (when <= Date.now()) return false;
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body, tag: TIMER_TAG, icon: 'icon.svg', badge: 'icon.svg',
          showTrigger: new TimestampTrigger(when), data: { url: './' }
        });
        return true;
      } catch (e) { return false; }
    },
    async cancelScheduled() {
      try {
        const reg = navigator.serviceWorker ? await navigator.serviceWorker.ready : null;
        if (!reg) return;
        const list = await reg.getNotifications({ tag: TIMER_TAG, includeTriggered: true });
        list.forEach(n => n.close());
      } catch (e) {}
    },

    /* 設定でトグルON時に呼ぶ。許可が取れたら true */
    async enable() {
      if (!('Notification' in window)) { toast('この端末では通知を出せません'); return false; }
      let perm = Notification.permission;
      if (perm === 'default') perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast('通知がブロックされています。ブラウザの設定で許可してください');
        return false;
      }
      await registerSW();
      await this.sync();
      toast('通知をオンにしました');
      return true;
    },

    /* 起動時・カレンダー更新時に呼ぶ。スナップショット更新＋当日ぶん通知＋予約 */
    async sync() {
      const S = Gerbera.Settings ? Gerbera.Settings.get() : {};
      if (!S.notify) return;
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const reminders = buildReminders();
      const state = await readState();

      // 通知済みキーは、まだ有効なリマインドに含まれるものだけ残す（＋当日ぶんは保持）
      const validKeys = new Set(reminders.map(r => r.key));
      state.reminders = reminders;
      state.notified = state.notified.filter(k => validKeys.has(k));

      const reg = await (navigator.serviceWorker ? navigator.serviceWorker.ready : Promise.resolve(null));
      if (!reg) { await writeState(state); return; }

      // 1) 今日ぶんの未通知を今すぐ出す
      const t = todayISO();
      for (const r of reminders) {
        if (r.date === t && !state.notified.includes(r.key)) {
          try {
            await reg.showNotification(r.title, {
              body: r.body, tag: 'gr-' + r.key, icon: 'icon.svg', badge: 'icon.svg',
              data: { url: './#calendar' }
            });
            state.notified.push(r.key);
          } catch (e) {}
        }
      }
      await writeState(state);

      // 2) periodicSync（対応環境のみ）
      try {
        if (reg.periodicSync) {
          await reg.periodicSync.register('gerbera-reminders', { minInterval: 12 * 3600 * 1000 });
        }
      } catch (e) {}

      // 3) TimestampTrigger（対応環境のみ）：当日〜TRIGGER_DAYS先ぶんを予約
      try {
        if ('showTrigger' in Notification.prototype && window.TimestampTrigger) {
          const limit = new Date(); limit.setDate(limit.getDate() + TRIGGER_DAYS);
          for (const r of reminders) {
            const d = parseISO(r.date);
            if (!d) continue;
            d.setHours(FIRE_HOUR, 0, 0, 0);
            if (d.getTime() < Date.now() || d > limit) continue;
            await reg.showNotification(r.title, {
              body: r.body, tag: 'gr-' + r.key, icon: 'icon.svg', badge: 'icon.svg',
              showTrigger: new TimestampTrigger(d.getTime()),
              data: { url: './#calendar' }
            });
          }
        }
      } catch (e) {}
    }
  };

  Gerbera.Push = Push;

  // 起動時：PWA導入・通知許可済みなら黙ってSW登録して同期
  if (Push.supported() && Notification.permission === 'granted') {
    registerSW().then(() => Push.sync());
  }
})();
