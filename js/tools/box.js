'use strict';
/* ツール: 抽選箱（項目追加・ランダム抽選・抽選済み自動除外・リセット） */
(function () {
  const { register, Store, h, uid, toast, openX, shareResultImage } = Gerbera;
  const KEY = 'box.items';

  register({
    id: 'box', name: '抽選箱', icon: '📦',
    mount(root) {
      let items = Store.get(KEY, []); // {id, label, drawn}
      const save = () => Store.set(KEY, items);

      const nameInput = h('input', { class: 'input', placeholder: '抽選する人の名前（省略OK）' });
      const resultArea = h('div');
      let last = null; // {who, label}
      function postText() {
        const subject = last.who ? `${last.who}さんの抽選結果` : '抽選結果';
        return `【抽選結果】\n${subject}は${last.label}でした！`;
      }
      const postBtn = h('button', { class: 'btn btn-lav grow', hidden: true,
        onclick: () => { if (last) openX(postText()); } }, '🐦 文章でポスト');
      const postImgBtn = h('button', { class: 'btn btn-ghost grow', hidden: true,
        onclick: () => {
          if (!last) return;
          shareResultImage({ badge: '【抽選結果】' + (last.who ? `${last.who}さんの結果` : ''),
            main: last.label, note: '', postText: postText() });
        } }, '🖼️ 画像でポスト');
      const postRow = h('div', { class: 'hstack mt8' }, postBtn, postImgBtn);
      const poolChips = h('div', { class: 'chip-wrap mt8' });
      const drawnList = h('div');
      const countNote = h('div', { class: 'section-label' });

      const addInput = h('input', { class: 'input grow', placeholder: '項目を入力（リスナー名など）',
        onkeydown: e => { if (e.key === 'Enter') addItem(); } });

      function pool() { return items.filter(it => !it.drawn); }

      function paint() {
        const rest = pool();
        countNote.textContent = `📦 箱の中身（残り ${rest.length} 件）`;
        poolChips.replaceChildren(...(
          rest.length
            ? rest.map(it => h('span', { class: 'chip' }, it.label,
                h('button', { class: 'chip-x', 'aria-label': 'この項目を削除',
                  onclick: () => {
                    items = items.filter(x => x.id !== it.id);
                    save();
                    paint();
                  } }, '×')))
            : [h('div', { class: 'empty grow' }, '箱は空っぽです。項目を追加してね')]));
        const drawn = items.filter(it => it.drawn);
        drawnList.replaceChildren(...drawn.map((it, i) =>
          h('div', { class: 'list-row' },
            h('span', { class: 'badge' }, i + 1),
            h('span', { class: 'row-main' }, it.label))));
      }

      function addItem() {
        const v = addInput.value.trim();
        if (!v) return;
        items.push({ id: uid(), label: v, drawn: false });
        addInput.value = '';
        save();
        paint();
      }

      function draw() {
        const rest = pool();
        if (!rest.length) { toast('箱が空です。リセットするか項目を追加してね'); return; }
        const hit = rest[Math.floor(Math.random() * rest.length)];
        hit.drawn = true;
        save();
        last = { who: nameInput.value.trim(), label: hit.label };
        postBtn.hidden = false;
        postImgBtn.hidden = false;
        resultArea.replaceChildren(
          h('div', { class: 'result-card pop' },
            h('div', { class: 'result-sub' }, '当たったのは…'),
            h('div', { class: 'result-main' }, hit.label),
            h('div', { class: 'result-note' }, `残り ${pool().length} 件`)));
        paint();
      }

      root.append(
        h('div', { class: 'card' },
          nameInput,
          h('div', { class: 'hstack mt8' }, addInput,
            h('button', { class: 'btn btn-ghost btn-sm', onclick: addItem }, '追加')),
          h('button', { class: 'btn btn-primary btn-big btn-full mt12', onclick: draw }, '📦 抽選する'),
          h('div', { class: 'mt16' }, resultArea),
          postRow,
          h('div', { class: 'mt16' }, countNote, poolChips)),
        h('div', { class: 'card' },
          h('div', { class: 'section-label' }, '✅ 抽選済み'),
          drawnList,
          h('button', { class: 'btn btn-danger btn-sm btn-full mt12',
            onclick: () => {
              if (!items.some(it => it.drawn)) { toast('まだ抽選していません'); return; }
              if (!confirm('抽選済みの項目をぜんぶ箱に戻しますか？')) return;
              items.forEach(it => { it.drawn = false; });
              save();
              resultArea.replaceChildren();
              paint();
              toast('箱をリセットしました');
            } }, 'リセット（全部箱に戻す）'))
      );
      paint();
    }
  });
})();
