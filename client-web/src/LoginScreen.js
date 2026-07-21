// Portaria do mundo: nada de Phaser sobe antes de haver uma sessão.
//
// O beta entra por conta local (usuário + senha). O botão do Google só aparece
// quando o backend diz que o OAuth está configurado — e, uma vez dentro, a mesma
// conta pode ganhar o Google depois (auth.linkGoogle), sem perder progresso.

import { auth } from './auth.js';

const CSS = `
#login-gate,#session-ended{position:fixed;inset:0;z-index:200;display:grid;place-items:center;
  padding:20px;background:radial-gradient(120% 100% at 50% 0%,#2c2536,#181722 70%);
  font-family:Inter,system-ui,sans-serif}
#login-gate .panel,#session-ended .panel{display:grid;width:min(360px,100%);gap:12px;padding:20px;
  border:4px solid #2b1b20;outline:2px solid #d39a68;color:#fff0da;background:#24171c;
  box-shadow:0 0 0 5px #0f0a0c99,0 24px 80px #000c}
#login-gate h1,#session-ended h1{margin:0;font-size:20px;letter-spacing:.06em;text-transform:uppercase;
  text-align:center;text-shadow:2px 2px #2c1a1f}
#login-gate .tabs,#session-ended .tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px}
#login-gate .tabs button,#session-ended .tabs button{padding:8px;border:2px solid #2b1b20;color:#f0d9b8;
  background:#3b262a;cursor:pointer;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
#login-gate .tabs button[aria-selected="true"],#session-ended .tabs button[aria-selected="true"]{color:#241419;background:#d59b62;box-shadow:inset 0 -2px #8d5c3a}
#login-gate label,#session-ended label{display:grid;gap:4px;font-size:11px;letter-spacing:.05em;color:#e2c4a0;text-transform:uppercase}
#login-gate input,#session-ended input{padding:9px 10px;border:2px solid #2b1b20;color:#fff3e2;background:#160e12;
  font:14px Inter,system-ui,sans-serif}
#login-gate input:focus,#session-ended input:focus{border-color:#d39a68;outline:none}
#login-gate .primary,#session-ended .primary{padding:11px;border:3px solid #2b1b20;color:#241419;background:#d59b62;
  cursor:pointer;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;
  box-shadow:inset 0 -3px #8d5c3a}
#login-gate .primary:disabled,#session-ended .primary:disabled{opacity:.6;cursor:progress}
#login-gate .ghost,#session-ended .ghost{padding:10px;border:2px solid #6f5a4e;color:#f3ddc2;background:#2f2027;cursor:pointer;font-size:12px}
#login-gate .msg,#session-ended .msg{min-height:16px;font-size:12px;line-height:1.4;color:#ffb4a8}
#login-gate .hint,#session-ended .hint{font-size:11px;line-height:1.5;color:#b49a86;text-align:center}
`;

let stylesReady = false;
function ensureStyles() {
  if (stylesReady) return;
  document.head.append(el('style', { textContent: CSS }));
  stylesReady = true;
}

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function field(label, props) {
  const input = el('input', props);
  return { input, node: el('label', {}, [document.createTextNode(label), input]) };
}

/// Mostra a portaria e resolve com a identidade quando o login/cadastro der certo.
function promptLogin(config) {
  return new Promise((resolve) => {
    ensureStyles();

    let mode = 'login'; // 'login' | 'register'
    const gate = el('div', { id: 'login-gate' });
    const panel = el('div', { className: 'panel' });
    const message = el('div', { className: 'msg' });
    const submit = el('button', { className: 'primary', type: 'submit' });

    const tabLogin = el('button', { type: 'button', textContent: 'Entrar' });
    const tabRegister = el('button', { type: 'button', textContent: 'Criar conta' });
    const tabs = el('div', { className: 'tabs' }, [tabLogin, tabRegister]);

    const username = field('Usuário', { name: 'username', autocomplete: 'username', required: true });
    const password = field('Senha', { name: 'password', type: 'password', autocomplete: 'current-password', required: true });
    const displayName = field('Nome no jogo', { name: 'name', autocomplete: 'nickname' });

    const form = el('form', {}, [username.node, password.node, displayName.node, submit, message]);

    function applyMode(next) {
      mode = next;
      tabLogin.setAttribute('aria-selected', String(mode === 'login'));
      tabRegister.setAttribute('aria-selected', String(mode === 'register'));
      displayName.node.hidden = mode !== 'register';
      password.input.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
      submit.textContent = mode === 'register' ? 'Criar conta e entrar' : 'Entrar';
      message.textContent = '';
    }

    tabLogin.addEventListener('click', () => applyMode('login'));
    tabRegister.addEventListener('click', () => applyMode('register'));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = '';
      try {
        const credentials = { username: username.input.value, password: password.input.value };
        const identity = mode === 'register'
          ? await auth.register({ ...credentials, name: displayName.input.value })
          : await auth.signIn(credentials);
        gate.remove();
        resolve(identity);
      } catch (error) {
        message.textContent = error.message;
        submit.disabled = false;
      }
    });

    panel.append(el('h1', { textContent: 'Office Quest' }));
    if (config.passwordEnabled !== false) {
      if (config.registrationOpen) panel.append(tabs);
      panel.append(form);
    }
    if (config.googleEnabled) {
      panel.append(
        el('div', { className: 'hint', textContent: config.passwordEnabled === false ? '' : 'ou' }),
        el('button', {
          className: 'ghost',
          type: 'button',
          textContent: 'Entrar com Google',
          onclick: () => auth.login(location.href),
        }));
    }
    panel.append(el('div', {
      className: 'hint',
      textContent: 'Seu progresso — XP, horas, inventário e móveis — fica na conta.',
    }));

    gate.append(panel);
    document.body.append(gate);
    applyMode('login');
    username.input.focus();
  });
}

/// Tela final de sessão: o mundo continua rodando atrás, mas sem rede — o jogador
/// escolhe se retoma o mundo aqui (recarregar) ou deixa a outra janela com ele.
export function showSessionEnded(message) {
  ensureStyles();
  if (document.getElementById('session-ended')) return;
  const reload = el('button', { className: 'primary', type: 'button', textContent: 'Jogar aqui' });
  reload.addEventListener('click', () => location.reload());
  const gate = el('div', { id: 'session-ended' }, [
    el('div', { className: 'panel' }, [
      el('h1', { textContent: 'Sessão encerrada' }),
      el('div', { className: 'hint', textContent: message || 'Sua conta entrou no mundo em outra janela.' }),
      reload,
    ]),
  ]);
  document.body.append(gate);
}

/// Garante uma sessão antes de o jogo subir. Em dev, ?userId= continua entrando direto.
export async function ensureSession() {
  if (auth.isAuthenticated()) return;
  const query = new URLSearchParams(location.search);
  const config = await auth.config();
  if (config.devBypass && (query.get('userId') || query.get('user'))) return;
  await promptLogin(config);
}
