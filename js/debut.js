'use strict';
/* ============================================================
   ガーベラ デビューサポート
   - ユーザー段階管理（初配信前→デビュー後→バナイベ終了後→通常利用）
   - デビュー日時（予定 vs 実績）
   - バナイベ参加予定
   - 初配信前タスク
   - 話題ストック
   ============================================================ */
(function () {
  const { Store, h, emitter, modal, toast } = Gerbera;
  const KEY = 'debut';

  const DEFAULTS = {
    stage: null,           // 'pre' | 'debut' | 'after_banner' | 'normal'（初回は null → 選択画面へ）
    liverName: '',         // ライバーネーム（Settings.liverNameと同期）
    plannedDebutDate: null, // 'YYYY-MM-DD' 予定初配信日
    plannedDebutTime: null, // 'HH:mm' 予定初配信時刻（未定の場合は null）
    actualDebutDate: null,  // 'YYYY-MM-DD' 実際の初配信日
    actualDebutTime: null,  // 'HH:mm' 実際の初配信時刻
    bannerEventJoinedDate: null, // 'YYYY-MM-DD' バナイベに実際に参加した開始日
    bannerEventParticipant: false, // バナイベ参加予定 ON/OFF
    bannerEventLocked: false,      // バナイベ開始後は参加予定トグルをロック
    bannerEventEndMessageShown: false, // バナイベ終了メッセージ表示済み
    initialDebutStartedAt: null,  // 初配信開始日時（タイムスタンプ）配信開始後に設定
    initialDebutEndedAt: null,    // 初配信終了日時（タイムスタンプ）
    initialDebutGoal: 0,          // 初配信の入室目標人数
    taskList: [],          // タスク（初配信前専用）
    topicStockTabs: {      // 話題ストック（既存メモを拡張利用）
      chatter: [],         // 雑談タブ
      qa: []               // 質疑応答タブ
    },
    bannerEventPlan: {     // バナイベ管理データ
      strategy: null,      // 全体的な作戦（最大6項目のテキスト）
      events: []           // 企画イベント一覧 {id, date, dayOfWeek, title, count, tools}
    },
    kpiRecords: {          // KPI記録・分析データ
      records: [],         // 配信ごとのKPI {id, date, 応援ポイント初期値, 応援ポイント最終値, バッジ初期値, バッジ最終値, ...}
      lastRecordDate: null // 前回のKPI記録日時（差分計算用）
    }
  };

  const ev = emitter();
  let data = Object.assign({}, DEFAULTS, Store.get(KEY, {}));

  function persist() { Store.set(KEY, data); }

  const Debut = {
    get() { return Object.assign({}, data); },
    set(patch) {
      data = Object.assign({}, data, patch);
      persist();
      ev.emit(Object.assign({}, data));
    },
    on(fn) { return ev.on(fn); },

    /* 初回起動か判定 */
    isFirstTime() {
      return data.stage === null;
    },

    /* ユーザー段階を判定（stage を更新する際に呼ぶ） */
    updateStageByDebutDate() {
      // actualDebutDate が設定されていれば、その日を基準に段階を決定
      if (data.actualDebutDate) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // バナイベ対象期間：初配信日から7日間（日曜〜土曜など、IRIAM仕様に依存）
        // 簡略化：初配信日 + 7日 = バナイベ終了日
        const debutD = new Date(data.actualDebutDate + 'T00:00:00');
        const bannerEndD = new Date(debutD);
        bannerEndD.setDate(bannerEndD.getDate() + 6); // 7日間＝初日を含めて 初日+6日
        const bannerEndStr = `${bannerEndD.getFullYear()}-${String(bannerEndD.getMonth() + 1).padStart(2, '0')}-${String(bannerEndD.getDate()).padStart(2, '0')}`;

        if (today > bannerEndStr) {
          // バナイベ終了後
          this.set({ stage: 'normal' });
        } else if (today >= data.actualDebutDate) {
          // デビュー後（バナイベ中または終了前）
          this.set({ stage: 'debut' });
        }
      } else if (data.plannedDebutDate) {
        // 実績日なし、予定日のみ
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (today >= data.plannedDebutDate) {
          // 予定日当日以降
          this.set({ stage: 'debut' });
        }
      }
    },

    /* 初配信カウントダウン用の対象日時を取得（実績 > 予定） */
    getCountdownTarget() {
      if (data.actualDebutDate && data.actualDebutTime) {
        return { date: data.actualDebutDate, time: data.actualDebutTime };
      }
      if (data.plannedDebutDate && data.plannedDebutTime) {
        return { date: data.plannedDebutDate, time: data.plannedDebutTime };
      }
      if (data.actualDebutDate) {
        return { date: data.actualDebutDate, time: null };
      }
      if (data.plannedDebutDate) {
        return { date: data.plannedDebutDate, time: null };
      }
      return null;
    },

    /* バナイベ対象週を計算（初配信日ベース） */
    getBannerEventWeek() {
      const targetDate = data.actualDebutDate || data.plannedDebutDate;
      if (!targetDate) return null;

      const d = new Date(targetDate + 'T00:00:00');
      const startOfWeek = new Date(d);
      startOfWeek.setDate(d.getDate() - d.getDay() + 1); // 月曜日に揃える

      const year = startOfWeek.getFullYear();
      const month = startOfWeek.getMonth() + 1;
      const dateStr = startOfWeek.getDate();

      return {
        startDate: `${year}-${String(month).padStart(2, '0')}-${String(dateStr).padStart(2, '0')}`,
        endDate: `${year}-${String(month).padStart(2, '0')}-${String(dateStr + 6).padStart(2, '0')}`
      };
    },

    /* 話題ストック操作 */
    addTopicStock(tab, title, content) {
      if (tab !== 'chatter' && tab !== 'qa') return null;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const item = { id, title, content, createdAt: Date.now() };
      data.topicStockTabs[tab].push(item);
      persist();
      ev.emit(Object.assign({}, data));
      return item;
    },

    getTopicStocks(tab) {
      if (tab !== 'chatter' && tab !== 'qa') return [];
      return data.topicStockTabs[tab] || [];
    },

    removeTopicStock(tab, id) {
      if (tab !== 'chatter' && tab !== 'qa') return;
      data.topicStockTabs[tab] = data.topicStockTabs[tab].filter(t => t.id !== id);
      persist();
      ev.emit(Object.assign({}, data));
    },

    updateTopicStock(tab, id, patch) {
      if (tab !== 'chatter' && tab !== 'qa') return;
      const list = data.topicStockTabs[tab];
      const i = list.findIndex(t => t.id === id);
      if (i >= 0) {
        list[i] = Object.assign(list[i], patch);
        persist();
        ev.emit(Object.assign({}, data));
      }
    }
  };

  Gerbera.Debut = Debut;
})();
