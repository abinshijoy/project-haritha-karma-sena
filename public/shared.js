/* Shared session, OTP login and UI shell for every Haritha Karma Sena page. */

'use strict';

const TOKEN_KEY = 'hks.token';
const USER_KEY = 'hks.user';

let readyPromise = null;
let pendingRole = 'RESIDENT';

function readUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

const HKS = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: readUser(),

  setSession(payload) {
    HKS.token = payload.token || '';
    HKS.user = payload.user || null;
    localStorage.setItem(TOKEN_KEY, HKS.token);
    localStorage.setItem(USER_KEY, JSON.stringify(HKS.user || {}));
    readyPromise = Promise.resolve(HKS.user);
    renderSession();
    window.dispatchEvent(new CustomEvent('hks:auth', { detail: HKS.user }));
  },

  clearSession() {
    HKS.token = '';
    HKS.user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    readyPromise = Promise.resolve(null);
    renderSession();
    window.dispatchEvent(new CustomEvent('hks:auth', { detail: null }));
  },

  async api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (HKS.token) headers.Authorization = `Bearer ${HKS.token}`;
    const response = await fetch(path, { ...options, headers });
    let data = {};
    try {
      data = await response.json();
    } catch (_) {
      data = {};
    }
    if (!response.ok) {
      const detail = data && data.error;
      const message =
        (detail && detail.message) ||
        (typeof detail === 'string' ? detail : '') ||
        'Request failed. Please try again.';
      const error = new Error(message);
      error.status = response.status;
      error.code = detail && detail.code;
      error.data = data;
      throw error;
    }
    return data && Object.prototype.hasOwnProperty.call(data, 'data') ? data.data : data;
  },

  ready() {
    if (!readyPromise) {
      readyPromise = (async () => {
        if (!HKS.token) return null;
        try {
          const payload = await HKS.api('/api/auth/me');
          HKS.user = payload.user || null;
          localStorage.setItem(USER_KEY, JSON.stringify(HKS.user || {}));
          renderSession();
          return HKS.user;
        } catch (_) {
          HKS.clearSession();
          return null;
        }
      })();
    }
    return readyPromise;
  },

  async require(role) {
    const user = await HKS.ready();
    if (!user) {
      HKS.openLogin(role === 'ADMIN' ? 'ADMIN' : 'RESIDENT');
      throw new Error('Sign in required.');
    }
    if (role === 'ADMIN' && user.role !== 'ADMIN') {
      HKS.openLogin('ADMIN');
      setLoginMessage('This area needs the HKS admin account. Sign in with role “Admin / HKS”.', 'error');
      throw new Error('Admin access required.');
    }
    return user;
  },

  openLogin(role = 'RESIDENT') {
    pendingRole = role === 'ADMIN' ? 'ADMIN' : 'RESIDENT';
    const backdrop = document.getElementById('hksLoginBackdrop');
    if (!backdrop) return;
    selectRole(pendingRole);
    backdrop.hidden = false;
    const input = document.getElementById('hksPhone');
    if (input) input.focus();
  },

  closeLogin() {
    const backdrop = document.getElementById('hksLoginBackdrop');
    if (backdrop) backdrop.hidden = true;
  },
};

window.HKS = HKS;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function setLoginMessage(text, type = 'info') {
  const el = document.getElementById('hksLoginMsg');
  if (!el) return;
  if (!text) {
    el.className = 'notice hidden';
    el.textContent = '';
    return;
  }
  el.className = `notice ${type}`;
  el.textContent = text;
}

function selectRole(role) {
  pendingRole = role;
  document.querySelectorAll('[data-hks-role]').forEach((button) => {
    button.classList.toggle('active', button.dataset.hksRole === role);
    button.setAttribute('aria-pressed', String(button.dataset.hksRole === role));
  });
  const phone = document.getElementById('hksPhone');
  if (phone) phone.value = role === 'ADMIN' ? '9999999998' : '9999999999';
  const hint = document.getElementById('hksOtpHint');
  if (hint) {
    hint.textContent = role === 'ADMIN'
      ? 'Demo admin OTP: 123456 · phone 9999999998'
      : 'Demo member OTP: 123456 · phone 9999999999';
  }
  setLoginMessage('');
}

function createLoginModal() {
  if (document.getElementById('hksLoginBackdrop')) return;
  const backdrop = document.createElement('div');
  backdrop.id = 'hksLoginBackdrop';
  backdrop.className = 'modal-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <div class="modal login-modal" role="dialog" aria-modal="true" aria-labelledby="hksLoginTitle">
      <button id="hksLoginClose" class="modal-close" type="button" aria-label="Close sign in">×</button>
      <div class="eyebrow">One account · every module</div>
      <h2 id="hksLoginTitle">Sign in to HKS</h2>
      <p class="muted small">The same login unlocks billing, payment history, HKS tools and your Green Points wallet.</p>
      <div class="role-switch" role="group" aria-label="Account type">
        <button type="button" data-hks-role="RESIDENT" class="active">Member</button>
        <button type="button" data-hks-role="ADMIN">Admin / HKS</button>
      </div>
      <form id="hksOtpForm">
        <label for="hksPhone">Phone number</label>
        <input id="hksPhone" type="tel" inputmode="numeric" value="9999999999" required autocomplete="tel" />
        <label for="hksName">Name (new members only)</label>
        <input id="hksName" type="text" placeholder="Your name" autocomplete="name" />
        <button id="hksRequestOtp" class="btn btn-secondary btn-small" type="button">Send OTP</button>
        <label for="hksOtp">OTP code</label>
        <input id="hksOtp" type="text" inputmode="numeric" placeholder="123456" maxlength="6" required autocomplete="one-time-code" />
        <p id="hksOtpHint" class="small muted">Demo OTP: 123456 · phone 9999999999</p>
        <button class="btn btn-primary" type="submit">Verify &amp; sign in</button>
      </form>
      <div id="hksLoginMsg" class="notice hidden"></div>
    </div>`;
  document.body.appendChild(backdrop);

  document.getElementById('hksLoginClose').addEventListener('click', HKS.closeLogin);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) HKS.closeLogin();
  });
  document.querySelectorAll('[data-hks-role]').forEach((button) => {
    button.addEventListener('click', () => selectRole(button.dataset.hksRole));
  });
  document.getElementById('hksRequestOtp').addEventListener('click', requestDemoOtp);
  document.getElementById('hksOtpForm').addEventListener('submit', verifyDemoOtp);
}

async function requestDemoOtp() {
  const button = document.getElementById('hksRequestOtp');
  button.disabled = true;
  button.textContent = 'Sending…';
  setLoginMessage('');
  try {
    const result = await HKS.api('/api/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({
        phone: document.getElementById('hksPhone').value.trim(),
        name: document.getElementById('hksName').value.trim() || undefined,
        role: pendingRole,
      }),
    });
    const hint = document.getElementById('hksOtpHint');
    if (hint && result.devCode) hint.textContent = `Your demo OTP is ${result.devCode}`;
    setLoginMessage('OTP ready. Enter the code shown above to continue.', 'success');
  } catch (error) {
    setLoginMessage(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Send OTP';
  }
}

async function verifyDemoOtp(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Signing in…';
  setLoginMessage('');
  try {
    const result = await HKS.api('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({
        phone: document.getElementById('hksPhone').value.trim(),
        code: document.getElementById('hksOtp').value.trim(),
        name: document.getElementById('hksName').value.trim() || undefined,
      }),
    });
    HKS.setSession(result);
    HKS.closeLogin();
    if (document.body.dataset.auth) window.location.reload();
  } catch (error) {
    setLoginMessage(error.message, 'error');
    button.disabled = false;
    button.textContent = 'Verify & sign in';
  }
}

function renderSession() {
  const user = HKS.user;
  document.querySelectorAll('[data-session-slot]').forEach((slot) => {
    if (!user || !user.id) {
      slot.innerHTML = '<button class="btn btn-secondary btn-small" data-hks-login type="button">Sign in</button>';
      return;
    }
    const roleLabel = user.role === 'ADMIN' ? 'Admin / HKS' : 'Member';
    slot.innerHTML = `
      <span class="session-chip">
        <span class="session-avatar">${escapeHtml((user.name || 'H')[0].toUpperCase())}</span>
        <span class="session-copy"><strong>${escapeHtml(user.name || 'Member')}</strong><small>${escapeHtml(roleLabel)} · ${escapeHtml(user.phone || '')}</small></span>
        <button class="btn btn-ghost btn-small" data-hks-logout type="button">Sign out</button>
      </span>`;
  });
}

function ensureAuthGate() {
  let gate = document.getElementById('hksAuthGate');
  if (!gate) {
    gate = document.createElement('div');
    gate.id = 'hksAuthGate';
    gate.className = 'panel auth-gate hidden';
    gate.innerHTML = `
      <div class="eyebrow">Protected area</div>
      <h2>Sign in to continue</h2>
      <p class="muted">Use the same HKS account on every page. Your billing, HKS actions and Green Points stay in sync.</p>
      <button class="btn btn-primary" data-hks-login type="button">Open sign in</button>`;
    const main = document.querySelector('main');
    if (main) main.prepend(gate);
    else document.body.appendChild(gate);
  }
  return gate;
}

async function applyAuthGate() {
  const required = document.body.dataset.auth;
  const content = document.querySelectorAll('[data-auth-content]');
  const gate = ensureAuthGate();
  if (!required) {
    content.forEach((el) => el.classList.remove('hidden'));
    gate.classList.add('hidden');
    return;
  }
  try {
    const user = await HKS.require(required === 'admin' ? 'ADMIN' : 'RESIDENT');
    content.forEach((el) => el.classList.remove('hidden'));
    gate.classList.add('hidden');
    return user;
  } catch (_) {
    content.forEach((el) => el.classList.add('hidden'));
    gate.classList.remove('hidden');
    return null;
  }
}

document.addEventListener('click', (event) => {
  const login = event.target.closest('[data-hks-login]');
  if (login) {
    HKS.openLogin(document.body.dataset.auth === 'admin' ? 'ADMIN' : 'RESIDENT');
    return;
  }
  const logout = event.target.closest('[data-hks-logout]');
  if (logout) {
    HKS.api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    HKS.clearSession();
    if (document.body.dataset.auth) window.location.reload();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  createLoginModal();
  renderSession();
  HKS.ready().then(applyAuthGate);
});
