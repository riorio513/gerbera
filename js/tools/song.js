'use strict';
/* ツール: 楽曲メモ（持ち歌保存・リクエスト管理・並び替え・次に歌う曲・歌唱履歴） */
(function () {
  const { register, Store, h, uid, toast } = Gerbera;
  const KEY = 'song';

  register({
    id: 'song', name: '楽曲メモ', icon: '🎤',
    mount(root) {
      const st = Object.assign({ repertoire: [], requests: [], history: [] }, Store.get(KEY, {}));
      const save = () => Store.set(KEY, st);
      let tab = 'req';

      const nextArea = h('div');
      const body = h('div');

      function sung(req) {
        st.history.unshift({ title: req.title, from: req.from || '', at: Date.now() });
        st.requests = st.requests.filter(r => r.id !== req.id);
        save();
        toast(`「${req.title}」を履歴に移しました🎶`);
        render();
      }

      function paintNext() {
        const next = st.requests[0];
        nextArea.replaceChildren(
          next
            ? h('div', { class: 'next-card' },
                h('div', { class: 'section-label', style: 'margin-bottom:2px' }, '🎵 次に歌う曲'),
                h('div', { class: 'hstack' },
                  h('div', { class: 'grow' },
                    h('div', { style: 'font-size:18px;font-weight:900' }, next.title),
                    next.from ? h('div', { class: 'row-sub' }, next.from + ' さんのリクエスト') : null),
                  h('button', { class: 'btn btn-primary btn-sm', onclick: () => sung(next) }, '✓ 歌った')))
            : h('div', { class: 'next-card center' },
                h('div', { class: 'note' }, 'リクエストはまだありません🎵')));
      }

      /* --- リクエストタブ --- */
      function reqView() {
        const titleIn = h('input', { class: 'input grow', placeholder: '曲名',
          onkeydown: e => { if (e.key === 'Enter') add(); } });
        const fromIn = h('input', { class: 'input', style: 'width:40%', placeholder: 'リクエストした人（省略OK）' });
        function add() {
          const v = titleIn.value.trim();
          if (!v) return;
          st.requests.push({ id: uid(), title: v, from: fromIn.value.trim() });
          titleIn.value = ''; fromIn.value = '';
          save();
          render();
        }
        const rows = st.requests.map((r, i) =>
          h('div', { class: 'list-row' },
            h('span', { class: 'badge' }, i + 1),
            h('div', { class: 'grow' },
              h('div', { class: 'row-main' }, r.title),
              r.from ? h('div', { class: 'row-sub' }, r.from + ' さん') : null),
            h('button', { class: 'icon-btn', 'aria-label': '上へ', onclick: () => {
              if (i === 0) return;
              [st.requests[i - 1], st.requests[i]] = [st.requests[i], st.requests[i - 1]];
              save(); render();
            } }, '↑'),
            h('button', { class: 'icon-btn', 'aria-label': '下へ', onclick: () => {
              if (i === st.requests.length - 1) return;
              [st.requests[i + 1], st.requests[i]] = [st.requests[i], st.requests[i + 1]];
              save(); render();
            } }, '↓'),
            h('button', { class: 'icon-btn', 'aria-label': '歌った', onclick: () => sung(r) }, '✓'),
            h('button', { class: 'icon-btn danger', 'aria-label': '削除', onclick: () => {
              st.requests = st.requests.filter(x => x.id !== r.id);
              save(); render();
            } }, '🗑')));
        return h('div', {},
          h('div', { class: 'vstack' },
            h('div', { class: 'hstack' }, titleIn, fromIn),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: add }, '＋ リクエストを追加')),
          h('div', { class: 'mt8' },
            rows.length ? rows : h('div', { class: 'empty' }, 'リクエストが入るとここに並びます')));
      }

      /* --- 持ち歌タブ --- */
      function repView() {
        const input = h('input', { class: 'input grow', placeholder: '持ち歌を追加',
          onkeydown: e => { if (e.key === 'Enter') add(); } });
        function add() {
          const v = input.value.trim();
          if (!v) return;
          st.repertoire.push({ id: uid(), title: v });
          input.value = '';
          save();
          render();
        }
        const rows = st.repertoire.map(s =>
          h('div', { class: 'list-row' },
            h('span', { class: 'row-main' }, s.title),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
              st.requests.push({ id: uid(), title: s.title, from: '' });
              save();
              toast(`「${s.title}」をリクエストに入れました`);
              paintNext();
            } }, '→ リクエストへ'),
            h('button', { class: 'icon-btn danger', 'aria-label': '削除', onclick: () => {
              st.repertoire = st.repertoire.filter(x => x.id !== s.id);
              save(); render();
            } }, '🗑')));
        return h('div', {},
          h('div', { class: 'hstack' }, input,
            h('button', { class: 'btn btn-ghost btn-sm', onclick: add }, '追加')),
          h('div', { class: 'mt8' },
            rows.length ? rows : h('div', { class: 'empty' }, '持ち歌を登録しておくと、ワンタップでリクエストに追加できます')));
      }

      /* --- 履歴タブ --- */
      function histView() {
        const rows = st.history.map(hh =>
          h('div', { class: 'list-row' },
            h('div', { class: 'grow' },
              h('div', { class: 'row-main' }, hh.title),
              h('div', { class: 'row-sub' },
                new Date(hh.at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
                + (hh.from ? `・${hh.from} さん` : '')))));
        return h('div', {},
          rows.length ? rows : h('div', { class: 'empty' }, '歌った曲がここに残ります'),
          st.history.length ? h('button', { class: 'btn btn-danger btn-sm btn-full mt12',
            onclick: () => {
              if (!confirm('歌唱履歴を全部消しますか？')) return;
              st.history = [];
              save(); render();
            } }, '履歴をクリア') : null);
      }

      const seg = h('div', { class: 'seg' },
        ['req', 'rep', 'hist'].map((id, i) =>
          h('button', { class: tab === id ? 'on' : '', onclick: e => {
            tab = id;
            seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
            e.currentTarget.classList.add('on');
            paintBody();
          } }, ['リクエスト', '持ち歌', '歌唱履歴'][i])));

      function paintBody() {
        body.replaceChildren(tab === 'req' ? reqView() : tab === 'rep' ? repView() : histView());
      }
      function render() { paintNext(); paintBody(); }

      root.append(nextArea, h('div', { class: 'card' }, seg, h('div', { class: 'mt12' }, body)));
      render();
    }
  });
})();
