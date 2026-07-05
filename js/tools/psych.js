'use strict';
/* ツール: 心理テスト（登録済みの問題をランダム表示）
   まずは質問と選択肢だけを表示し、「回答」ボタンを押すと
   全ての選択肢に対する結果が一斉に表示される。 */
(function () {
  const { register, h } = Gerbera;
  let lastIdx = -1;

  register({
    id: 'psych', name: '心理テスト', icon: '💭',
    mount(root) {
      const tests = Gerbera.DATA.psychTests;
      const box = h('div');

      function pickTest() {
        if (tests.length < 2) return tests[0];
        let i;
        do { i = Math.floor(Math.random() * tests.length); } while (i === lastIdx);
        lastIdx = i;
        return tests[i];
      }

      function render(test, revealed) {
        box.replaceChildren(
          h('div', { class: 'card' },
            h('div', { class: 'section-label' }, '💭 しんり テスト'),
            h('p', { style: 'font-size:16px;font-weight:700;line-height:1.7' }, test.q),
            h('div', { class: 'section-label mt12' }, revealed ? `🔮 ${test.theme}` : '選択肢'),
            h('div', { class: 'vstack mt8', style: 'gap:10px' },
              test.a.map(c =>
                h('div', { class: 'card-soft', style: 'border-radius:13px;padding:12px 14px' },
                  h('div', { style: 'font-weight:900;color:var(--main-strong)' + (revealed ? ';margin-bottom:4px' : '') },
                    revealed ? `「${c.t}」を選んだ人` : c.t),
                  revealed ? h('div', { style: 'font-size:13.5px;line-height:1.7' }, c.r) : null))),
            revealed
              ? h('button', { class: 'btn btn-ghost btn-full mt12',
                  onclick: () => showQuestion(pickTest()) }, '↻ 別の問題にする')
              : h('button', { class: 'btn btn-primary btn-full mt12',
                  onclick: () => render(test, true) }, '📣 回答')));
      }

      function showQuestion(test) { render(test, false); }

      root.append(box);
      showQuestion(pickTest());
    }
  });
})();
