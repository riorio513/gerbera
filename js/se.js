'use strict';
/* SE（効果音）データ・再生
   - 効果音ラボ（soundeffect-lab.info）の音源を assets/se/ に配置して使用
   - 再生は音量固定・多重再生OK（都度 new Audio() で鳴らすだけのシンプル実装） */
(function () {
  const CATEGORIES = [
    { id: 'hype', label: '🎉 盛り上げ' },
    { id: 'quiz', label: '❓ クイズ' },
    { id: 'chime', label: '📻 進行・チャイム' },
    { id: 'reaction', label: '😅 リアクション' },
    { id: 'serious', label: '⚠️ シリアス' }
  ];

  const LIST = [
    { file: 'dodon.mp3', label: 'ドドン（和太鼓）', category: 'hype' },
    { file: 'fanfare.mp3', label: 'ファンファーレ（ラッパ）', category: 'hype' },
    { file: 'drumroll.mp3', label: 'ドラムロール', category: 'hype' },
    { file: 'shine.mp3', label: 'キラキラ', category: 'hype' },

    { file: 'quiz-question.mp3', label: 'クイズ出題', category: 'quiz' },
    { file: 'quiz-correct.mp3', label: 'クイズ正解', category: 'quiz' },
    { file: 'quiz-incorrect.mp3', label: 'クイズ不正解', category: 'quiz' },

    { file: 'chime-start.mp3', label: '放送開始チャイム', category: 'chime' },
    { file: 'chime-end.mp3', label: '放送終了チャイム', category: 'chime' },
    { file: 'chime-school.mp3', label: '学校のチャイム', category: 'chime' },
    { file: 'gong-start.mp3', label: '試合開始ゴング', category: 'chime' },
    { file: 'gong-end.mp3', label: '試合終了ゴング', category: 'chime' },

    { file: 'chanchan.mp3', label: 'ちゃんちゃん', category: 'reaction' },
    { file: 'tin.mp3', label: 'チーン', category: 'reaction' },
    { file: 'tsukkomi.mp3', label: 'ツッコみ', category: 'reaction' },
    { file: 'manuke-a.mp3', label: '間抜けA', category: 'reaction' },
    { file: 'manuke-b.mp3', label: '間抜けB', category: 'reaction' },
    { file: 'me-ga-ten.mp3', label: '目が点に', category: 'reaction' },

    { file: 'jishukisei.mp3', label: '自主規制', category: 'serious' },
    { file: 'scream.mp3', label: '男の悲鳴', category: 'serious' },
    { file: 'horror-violin.mp3', label: '恐怖（バイオリン）', category: 'serious' }
  ];

  /* 鳴っている最中の音。stopAll() でまとめて止めるために覚えておく */
  const playing = new Set();
  function track(audio) {
    playing.add(audio);
    const done = () => playing.delete(audio);
    audio.addEventListener('ended', done);
    audio.addEventListener('pause', done);
    audio.addEventListener('error', done);
  }

  function play(file) {
    try {
      const audio = new Audio('assets/se/' + file);
      track(audio);
      audio.play().catch(() => playing.delete(audio));
    } catch (e) {}
  }

  function stopAll() {
    Array.from(playing).forEach(a => {
      try { a.pause(); a.currentTime = 0; } catch (e) {}
    });
    playing.clear();
  }

  /* ループ再生。stop() で止める。ルーレット等「終わるまで鳴らし続けたい」用途 */
  function loop(file) {
    let audio = null;
    try {
      audio = new Audio('assets/se/' + file);
      audio.loop = true;
      track(audio);
      audio.play().catch(() => playing.delete(audio));
    } catch (e) {}
    return {
      stop() {
        if (!audio) return;
        try { audio.pause(); audio.currentTime = 0; } catch (e) {}
        audio = null;
      }
    };
  }

  /* シンバルのシャーン。音源ファイルを持たず、ノイズ＋金属的な倍音をその場で合成する。
     AudioContext はユーザー操作の中で作らないと鳴らないため、unlock() を
     ボタンを押した時点で呼んでおく。 */
  let actx = null;
  function unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!actx) actx = new AC();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) {}
  }

  function cymbal() {
    try {
      unlock();
      if (!actx) return;
      const t0 = actx.currentTime, dur = 2.4;
      const master = actx.createGain();
      master.gain.setValueAtTime(0.0001, t0);
      master.gain.exponentialRampToValueAtTime(0.7, t0 + 0.005);
      master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      master.connect(actx.destination);

      const len = Math.floor(actx.sampleRate * dur);
      const buf = actx.createBuffer(1, len, actx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = actx.createBufferSource();
      noise.buffer = buf;
      const hp = actx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 5000;
      noise.connect(hp);
      hp.connect(master);
      noise.start(t0);

      [3520, 4990, 6210, 7860, 9340].forEach(f => {
        const osc = actx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = f;
        const g = actx.createGain();
        g.gain.setValueAtTime(0.05, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.2);
        osc.connect(g);
        g.connect(master);
        osc.start(t0);
        osc.stop(t0 + 1.3);
      });
    } catch (e) {}
  }

  Gerbera.SE = { categories: CATEGORIES, list: LIST, play, stopAll, loop, cymbal, unlock };
})();
