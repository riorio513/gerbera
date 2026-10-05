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
    /* 登録・再設定は、再設定用コードを返す（このとき一度しか見られない） */
    async signup(email, password) {
      const r = await call({ action: 'signup', email, password });
      save(r);
      return r.recoveryCode;
    },
    async login(email, password) { save(await call({ action: 'login', email, password })); },
    async reset(email, code, newPassword) {
      const r = await call({ action: 'reset', email, code, newPassword });
      save(r);
      return r.recoveryCode;
    },
    async changePassword(password, newPassword) {
      await call({ action: 'changepw', token: state.token, password, newPassword });
    },
    async newRecoveryCode(password) {
      const r = await call({ action: 'newcode', token: state.token, password });
      return r.recoveryCode;
    },
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
    bad_recovery: 'メールアドレスまたは再設定用コードが違います',
    bad_current: '今のパスワードが違います',
    invalid_token: 'ログインの有効期限が切れました。ログインし直してください',
    auth_unconfigured: 'サーバーの準備ができていません。しばらくしてからお試しください'
  };

  /* 再設定用コードを見せる画面。コピーして控えてもらい、「控えました」で次へ進む */
  function renderRecoveryCode(view, code, lead, onDone) {
    const copyBtn = h('button', { class: 'btn btn-ghost btn-full mt8', onclick: () => {
      const done = ok => toast(ok ? 'コピーしました' : 'コピーできませんでした。手で書き留めてください');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => done(true), () => done(false));
      } else done(false);
    } }, 'コードをコピー');
    const ok = h('input', { type: 'checkbox', id: 'authCodeOk' });
    const go = h('button', { class: 'btn btn-primary btn-big btn-full mt16', onclick: () => {
      if (!ok.checked) { toast('コードを控えたら、チェックを入れてください'); return; }
      onDone();
    } }, 'つぎへ');
    view.replaceChildren(
      h('div', { class: 'auth-page' },
        h('div', { class: 'auth-mark', 'aria-hidden': 'true' }, '🔑'),
        h('h1', { class: 'auth-title' }, '再設定用コード'),
        h('p', { class: 'auth-lead' }, lead),
        h('div', { class: 'card' },
          h('div', { class: 'auth-code' }, code),
          copyBtn,
          h('label', { class: 'auth-agree', for: 'authCodeOk' }, ok,
            h('span', {}, 'コードを控えました（このあと二度と表示されません）')),
          go)));
  }

  /* ログイン画面（新規登録／ログイン／パスワード再設定）。成功したら onDone を呼ぶ */
  function renderLogin(view, onDone) {
    let mode = 'signup';
    const email = h('input', { class: 'input', type: 'email', autocomplete: 'username',
      inputmode: 'email', placeholder: 'メールアドレス', 'aria-label': 'メールアドレス' });
    const code = h('input', { class: 'input', type: 'text', autocomplete: 'off', autocapitalize: 'characters',
      placeholder: '再設定用コード（XXXX-XXXX-XXXX-XXXX）', 'aria-label': '再設定用コード' });
    const pass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password',
      placeholder: 'パスワード（8文字以上）', 'aria-label': 'パスワード' });
    const agree = h('input', { type: 'checkbox', id: 'authAgree' });
    const agreeRow = h('label', { class: 'auth-agree', for: 'authAgree' }, agree,
      h('span', {}, h('a', { href: '#settings/terms' }, '利用規約'), ' と ',
        h('a', { href: '#settings/privacy' }, 'プライバシーポリシー'), ' に同意します'));
    const forgot = h('button', { class: 'auth-forgot', onclick: () => { mode = 'reset'; err.hidden = true; paint(); } },
      'パスワードを忘れた方');
    const back = h('button', { class: 'auth-forgot', onclick: () => { mode = 'login'; err.hidden = true; paint(); } },
      '← ログインにもどる');
    const err = h('p', { class: 'auth-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn-primary btn-big btn-full mt16' });
    const tabs = h('div', { class: 'seg auth-seg' });
    const form = h('div', { class: 'card' });

    function paint() {
      const signup = mode === 'signup', reset = mode === 'reset';
      pass.autocomplete = signup || reset ? 'new-password' : 'current-password';
      pass.placeholder = reset ? '新しいパスワード（8文字以上）' : 'パスワード（8文字以上）';
      pass.setAttribute('aria-label', reset ? '新しいパスワード' : 'パスワード');
      submit.textContent = signup ? '登録してはじめる' : reset ? 'パスワードを再設定する' : 'ログイン';
      tabs.replaceChildren(...(reset ? [] : [
        h('button', { class: signup ? 'on' : '', onclick: () => { mode = 'signup'; err.hidden = true; paint(); } }, '新規登録'),
        h('button', { class: signup ? '' : 'on', onclick: () => { mode = 'login'; err.hidden = true; paint(); } }, 'ログイン')]));
      form.replaceChildren(...[
        reset ? h('p', { class: 'auth-lead', style: 'margin:0 0 12px;text-align:left' },
          '登録したときに表示された「再設定用コード」と、新しいパスワードを入力してください。') : tabs,
        h('div', { class: 'mt16' }, email),
        reset ? h('div', { class: 'mt8' }, code) : null,
        h('div', { class: 'mt8' }, pass),
        signup ? agreeRow : null,
        err,
        submit,
        mode === 'login' ? forgot : null,
        reset ? back : null].filter(Boolean));
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
        if (mode === 'login') {
          await Auth.login(e, p);
          toast('ログインしました');
          onDone();
        } else {
          const newCode = mode === 'signup' ? await Auth.signup(e, p) : await Auth.reset(e, code.value, p);
          renderRecoveryCode(view, newCode,
            mode === 'signup'
              ? 'パスワードを忘れたときに、このコードで再設定できます。メールは使わないので、必ず控えておいてください。'
              : 'パスワードを再設定しました。新しい再設定用コードです。前のコードは使えなくなりました。必ず控えておいてください。',
            onDone);
        }
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
        form,
        h('p', { class: 'note auth-note' }, 'いま端末に入っているデータは、そのまま引き継がれます。')));
  }

  Gerbera.AuthUI = { renderLogin, renderRecoveryCode };
})();
