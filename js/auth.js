'use strict';
/* ============================================================
   ガーベラ ログイン
   メールアドレス＋パスワード。メールの確認はしない。
   サーバー処理は api/auth.js（Vercel）。ブラウザには、ログインしたときに
   受け取った署名つきトークンと、メールアドレス、管理者かどうかだけを保存する。
   ・ログインしていないあいだは、アプリのほとんどの画面を開けない（app.js 側で制御）
   ・通信できないときは、保存済みのログイン状態をそのまま信用して使えるようにする
     （配信中に回線が切れても使えなくならないように）
   ・サーバーが「トークンが無効」と答えたときだけログアウトさせる
   ============================================================ */
(function () {
  const { Store, h, toast } = Gerbera;
  const KEY = 'auth';

  function load() {
    const a = Store.get(KEY, null);
    return a && a.token && a.email ? a : null;
  }
  let state = load();

  async function call(body) {
    let r;
    try {
      r = await fetch(Gerbera.apiUrl('/api/auth'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch (e) {
      const err = new Error('network');
      err.code = 'network';
      throw err;
    }
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) {
      const err = new Error((data && data.error) || 'request_failed');
      err.code = (data && data.error) || 'request_failed';
      err.status = r.status;
      throw err;
    }
    return data;
  }

  function save(s) {
    state = { token: s.token, email: s.email, admin: !!s.admin, exp: s.exp };
    Store.set(KEY, state);
  }

  const Auth = {
    isLoggedIn() { return !!(state && state.exp > Date.now()); },
    email() { return state ? state.email : ''; },
    isAdmin() { return !!(state && state.admin && state.exp > Date.now()); },
    async signup(email, password) { save(await call({ action: 'signup', email, password })); },
    async login(email, password) { save(await call({ action: 'login', email, password })); },
    logout() { state = null; Store.remove ? Store.remove(KEY) : Store.set(KEY, null); },
    /* 起動時に、保存済みトークンがまだ有効かをサーバーに確かめる。
       通信できないだけなら何もしない。無効と言われたときだけ false を返す */
    async verify() {
      if (!state) return false;
      try {
        const me = await call({ action: 'me', token: state.token });
        save({ token: state.token, email: me.email, admin: me.admin, exp: me.exp });
        return true;
      } catch (e) {
        if (e.status === 401) { Auth.logout(); return false; }
        return true;
      }
    }
  };
  Gerbera.Auth = Auth;

  const ERRORS = {
    bad_email: 'メールアドレスの形を確認してください',
    bad_password: 'パスワードは8文字以上で入力してください',
    email_taken: 'このメールアドレスはすでに登録されています。「ログイン」からお入りください',
    bad_credentials: 'メールアドレスまたはパスワードが違います',
    network: '通信できませんでした。電波の良いところで、もう一度お試しください',
    auth_unconfigured: 'サーバーの準備ができていません。しばらくしてからお試しください'
  };

  /* ログイン画面。成功したら onDone を呼ぶ */
  function renderLogin(view, onDone) {
    let mode = 'signup';
    const email = h('input', { class: 'input', type: 'email', autocomplete: 'username',
      inputmode: 'email', placeholder: 'メールアドレス', 'aria-label': 'メールアドレス' });
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password',
      placeholder: 'パスワード（8文字以上）', 'aria-label': 'パスワード' });
    const agree = h('input', { type: 'checkbox', id: 'authAgree' });
    const agreeRow = h('label', { class: 'auth-agree', for: 'authAgree' }, agree,
      h('span', {}, h('a', { href: '#settings/terms' }, '利用規約'), ' と ',
        h('a', { href: '#settings/privacy' }, 'プライバシーポリシー'), ' に同意します'));
    const err = h('p', { class: 'auth-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn-primary btn-big btn-full mt16' });
    const tabs = h('div', { class: 'seg auth-seg' });

    function paint() {
      const signup = mode === 'signup';
      pass.autocomplete = signup ? 'new-password' : 'current-password';
      agreeRow.hidden = !signup;
      submit.textContent = signup ? '登録してはじめる' : 'ログイン';
      tabs.replaceChildren(
        h('button', { class: signup ? 'on' : '', onclick: () => { mode = 'signup'; err.hidden = true; paint(); } }, '新規登録'),
        h('button', { class: signup ? '' : 'on', onclick: () => { mode = 'login'; err.hidden = true; paint(); } }, 'ログイン'));
    }

    async function go() {
      err.hidden = true;
      const e = email.value.trim();
      const p = pass.value;
      if (mode === 'signup' && !agree.checked) {
        err.textContent = '利用規約とプライバシーポリシーへの同意が必要です';
        err.hidden = false;
        return;
      }
      submit.disabled = true;
      const label = submit.textContent;
      submit.textContent = '通信中…';
      try {
        if (mode === 'signup') await Auth.signup(e, p);
        else await Auth.login(e, p);
        toast(mode === 'signup' ? '登録しました' : 'ログインしました');
        onDone();
      } catch (x) {
        err.textContent = ERRORS[x.code] || 'うまくいきませんでした。もう一度お試しください';
        err.hidden = false;
        submit.disabled = false;
        submit.textContent = label;
      }
    }
    submit.addEventListener('click', go);
    pass.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
    paint();

    view.replaceChildren(
      h('div', { class: 'auth-page' },
        h('div', { class: 'auth-mark', 'aria-hidden': 'true' }, '🌸'),
        h('h1', { class: 'auth-title' }, 'ガーベラへようこそ'),
        h('p', { class: 'auth-lead' }, 'ガーベラは、ログインしてご利用いただくツールになりました。メールアドレスとパスワードだけで、すぐにはじめられます（メールの確認はありません）。'),
        h('div', { class: 'card' },
          tabs,
          h('div', { class: 'mt16' }, email),
          h('div', { class: 'mt8' }, pass),
          agreeRow,
          err,
          submit),
        h('p', { class: 'note auth-note' }, 'いま端末に入っているデータは、そのまま引き継がれます。')));
  }

  Gerbera.AuthUI = { renderLogin };
})();
