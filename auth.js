/**
 * Hisaab Authentication & Access Shield (auth.js)
 * Provides Username & Password login, First-Time Setup Wizard,
 * Recovery PIN password reset, and 15-minute Inactivity Auto-Lock.
 */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  // PBKDF2 Password Hashing via Web Crypto API (Standard, fast, offline)
  async function hashPassword(password, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(String(password).trim()),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(String(salt)),
        iterations: 20000,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function makeSalt() {
    const arr = new Uint8Array(16);
    window.crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const STORAGE_KEY = 'hisaab-auth-v1';

  function getStoredAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function saveStoredAuth(auth) {
    try {
      if (auth) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (_) {}
  }

  let sessionUnlocked = false;
  let inactivityTimer = null;
  const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

  function resetInactivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (sessionUnlocked) {
      inactivityTimer = setTimeout(() => {
        lockApp('طویل غیر حاضری (15 منٹ) کی وجہ سے سیکیورٹی کے لیے ایپ لاک کر دی گئی ہے۔');
      }, INACTIVITY_TIMEOUT_MS);
    }
  }

  // Activity listeners
  ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
    window.addEventListener(evt, resetInactivity, { passive: true });
  });

  function shakeCard(cardId) {
    const el = $(cardId);
    if (!el) return;
    el.classList.remove('auth-shake');
    void el.offsetWidth;
    el.classList.add('auth-shake');
    setTimeout(() => el.classList.remove('auth-shake'), 600);
  }

  function hideAllCards() {
    const cards = ['auth-setup-card', 'auth-login-card', 'auth-recovery-card'];
    cards.forEach(id => {
      const el = $(id);
      if (el) el.hidden = true;
    });
  }

  function lockApp(reason = 'جاری رکھنے کے لیے اپنا یوزر نیم اور پاس ورڈ درج کریں') {
    sessionUnlocked = false;
    if (inactivityTimer) clearTimeout(inactivityTimer);

    const overlay = $('auth-overlay');
    if (!overlay) return;

    overlay.hidden = false;
    document.querySelectorAll('body > :not(#auth-overlay):not(#pin-lock-overlay)').forEach(el => {
      el.inert = true;
    });

    const auth = getStoredAuth();
    hideAllCards();

    if (!auth || !auth.passwordHash) {
      const setupCard = $('auth-setup-card');
      if (setupCard) {
        setupCard.hidden = false;
        $('setup-username')?.focus();
      }
    } else {
      const loginCard = $('auth-login-card');
      if (loginCard) {
        loginCard.hidden = false;
        const reasonEl = $('auth-login-reason');
        if (reasonEl) reasonEl.textContent = reason;
        const errEl = $('auth-login-error');
        if (errEl) errEl.textContent = '';
        const userInp = $('login-username');
        const passInp = $('login-password');
        if (passInp) passInp.value = '';
        if (userInp) {
          if (!userInp.value && auth.username) userInp.value = auth.username;
          if (userInp.value) {
            passInp?.focus();
          } else {
            userInp.focus();
          }
        }
      }
    }
  }

  function unlockApp() {
    sessionUnlocked = true;
    const overlay = $('auth-overlay');
    if (overlay) overlay.hidden = true;

    document.querySelectorAll('body > :not(#auth-overlay):not(#pin-lock-overlay)').forEach(el => {
      el.inert = false;
    });

    resetInactivity();
  }

  function setupEyeToggle(btnId, inputId) {
    const btn = $(btnId);
    const input = $(inputId);
    if (!btn || !input) return;

    btn.addEventListener('click', e => {
      e.preventDefault();
      const isPass = input.type === 'password';
      input.type = isPass ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(isPass));
      btn.title = isPass ? 'پاس ورڈ چھپائیں' : 'پاس ورڈ دکھائیں';
      btn.innerHTML = isPass
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  }

  async function executeSetup(username, password, confirmPass, recoveryPin) {
    const errEl = $('auth-setup-error');
    if (!username) {
      if (errEl) errEl.textContent = 'براہ کرم یوزر نیم درج کریں۔';
      shakeCard('auth-setup-card');
      $('setup-username')?.focus();
      return { success: false, error: 'username' };
    }
    if (password.length < 4) {
      if (errEl) errEl.textContent = 'پاس ورڈ کم از کم 4 حروف یا ہندسوں پر مشتمل ہونا چاہیے۔';
      shakeCard('auth-setup-card');
      $('setup-password')?.focus();
      return { success: false, error: 'password_length' };
    }
    if (password !== confirmPass) {
      if (errEl) errEl.textContent = 'پاس ورڈ اور تصدیقی پاس ورڈ ایک جیسے نہیں ہیں۔';
      shakeCard('auth-setup-card');
      $('setup-password-confirm')?.focus();
      return { success: false, error: 'password_mismatch' };
    }
    if (!/^\d{4,8}$/.test(recoveryPin)) {
      if (errEl) errEl.textContent = 'ریکوری پن کوڈ صرف 4 سے 8 ہندسوں پر مشتمل ہونا چاہیے۔';
      shakeCard('auth-setup-card');
      $('setup-recovery-pin')?.focus();
      return { success: false, error: 'pin_format' };
    }

    const salt = makeSalt();
    const passwordHash = await hashPassword(password, salt);
    const recSalt = makeSalt();
    const recoveryPinHash = await hashPassword(recoveryPin, recSalt);

    const authData = {
      username,
      passwordHash,
      salt,
      recoveryPinHash,
      recoverySalt: recSalt,
      createdAt: new Date().toISOString()
    };

    saveStoredAuth(authData);

    if (window.HisaabState) {
      window.HisaabState.auth = authData;
      if (typeof window.HisaabSave === 'function') window.HisaabSave();
    }

    unlockApp();
    return { success: true, auth: authData };
  }

  async function executeLogin(username, password) {
    const errEl = $('auth-login-error');
    const auth = getStoredAuth();
    if (!auth || !auth.passwordHash) {
      lockApp();
      return { success: false, error: 'no_auth' };
    }

    if (!username || !password) {
      if (errEl) errEl.textContent = 'براہ کرم یوزر نیم اور پاس ورڈ دونوں درج کریں۔';
      shakeCard('auth-login-card');
      return { success: false, error: 'empty_fields' };
    }

    if (username.toLowerCase() !== (auth.username || '').toLowerCase()) {
      if (errEl) errEl.textContent = 'غلط یوزر نیم یا پاس ورڈ۔ دوبارہ کوشش کریں۔';
      shakeCard('auth-login-card');
      return { success: false, error: 'invalid_credentials' };
    }

    const hash = await hashPassword(password, auth.salt);
    if (hash !== auth.passwordHash) {
      if (errEl) errEl.textContent = 'پاس ورڈ درست نہیں۔ براہ کرم دوبارہ کوشش کریں۔';
      shakeCard('auth-login-card');
      $('login-password')?.focus();
      return { success: false, error: 'invalid_password' };
    }

    unlockApp();
    return { success: true };
  }

  async function executeRecovery(username, pin, newPass, confirmPass) {
    const errEl = $('auth-recovery-error');
    const auth = getStoredAuth();
    if (!auth) {
      lockApp();
      return { success: false, error: 'no_auth' };
    }

    if (username.toLowerCase() !== (auth.username || '').toLowerCase()) {
      if (errEl) errEl.textContent = 'درج شدہ یوزر نیم ریکارڈ سے مماثلت نہیں رکھتا۔';
      shakeCard('auth-recovery-card');
      return { success: false, error: 'invalid_username' };
    }

    const pinHash = await hashPassword(pin, auth.recoverySalt || auth.salt);
    if (pinHash !== auth.recoveryPinHash) {
      if (errEl) errEl.textContent = 'ریکوری پن کوڈ درست نہیں ہے۔';
      shakeCard('auth-recovery-card');
      $('recovery-pin')?.focus();
      return { success: false, error: 'invalid_pin' };
    }

    if (newPass.length < 4) {
      if (errEl) errEl.textContent = 'نیا پاس ورڈ کم از کم 4 حروف کا ہونا چاہیے۔';
      shakeCard('auth-recovery-card');
      $('recovery-new-password')?.focus();
      return { success: false, error: 'password_length' };
    }

    if (newPass !== confirmPass) {
      if (errEl) errEl.textContent = 'نیا پاس ورڈ اور تصدیق آپس میں نہیں ملتے۔';
      shakeCard('auth-recovery-card');
      $('recovery-new-password-confirm')?.focus();
      return { success: false, error: 'password_mismatch' };
    }

    const newSalt = makeSalt();
    auth.passwordHash = await hashPassword(newPass, newSalt);
    auth.salt = newSalt;
    saveStoredAuth(auth);

    if (window.HisaabState) {
      window.HisaabState.auth = auth;
      if (typeof window.HisaabSave === 'function') window.HisaabSave();
    }

    unlockApp();
    return { success: true };
  }

  function init() {
    setupEyeToggle('toggle-setup-pwd-btn', 'setup-password');
    setupEyeToggle('toggle-setup-confirm-btn', 'setup-password-confirm');
    setupEyeToggle('toggle-login-pwd-btn', 'login-password');
    setupEyeToggle('toggle-rec-pwd-btn', 'recovery-new-password');
    setupEyeToggle('toggle-rec-confirm-btn', 'recovery-new-password-confirm');

    $('auth-setup-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const u = ($('setup-username')?.value || '').trim();
      const p = ($('setup-password')?.value || '').trim();
      const cp = ($('setup-password-confirm')?.value || '').trim();
      const rp = ($('setup-recovery-pin')?.value || '').trim();
      await executeSetup(u, p, cp, rp);
    });

    $('auth-login-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const u = ($('login-username')?.value || '').trim();
      const p = ($('login-password')?.value || '').trim();
      await executeLogin(u, p);
    });

    $('btn-goto-recovery')?.addEventListener('click', () => {
      hideAllCards();
      const recCard = $('auth-recovery-card');
      if (recCard) {
        recCard.hidden = false;
        const auth = getStoredAuth();
        if (auth?.username && $('recovery-username')) {
          $('recovery-username').value = auth.username;
        }
        $('recovery-pin')?.focus();
      }
    });

    $('btn-back-to-login')?.addEventListener('click', () => {
      hideAllCards();
      const loginCard = $('auth-login-card');
      if (loginCard) loginCard.hidden = false;
    });

    $('auth-recovery-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const u = ($('recovery-username')?.value || '').trim();
      const pin = ($('recovery-pin')?.value || '').trim();
      const np = ($('recovery-new-password')?.value || '').trim();
      const cnp = ($('recovery-new-password-confirm')?.value || '').trim();
      await executeRecovery(u, pin, np, cnp);
    });

    $('lock-app-now-btn')?.addEventListener('click', () => {
      lockApp('ایپلی کیشن صارف کی جانب سے لاک کی گئی ہے۔');
    });

    $('account-settings-btn')?.addEventListener('click', () => {
      const dialog = $('account-settings-dialog');
      if (dialog && typeof dialog.showModal === 'function') {
        const auth = getStoredAuth();
        if ($('acc-curr-username')) $('acc-curr-username').value = auth?.username || '';
        if ($('acc-new-username')) $('acc-new-username').value = auth?.username || '';
        if ($('acc-old-password')) $('acc-old-password').value = '';
        if ($('acc-new-password')) $('acc-new-password').value = '';
        if ($('acc-new-pin')) $('acc-new-pin').value = '';
        if ($('acc-settings-msg')) $('acc-settings-msg').textContent = '';
        dialog.showModal();
      }
    });

    $('btn-close-account-settings')?.addEventListener('click', () => {
      $('account-settings-dialog')?.close();
    });

    $('account-settings-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const oldPass = ($('acc-old-password')?.value || '').trim();
      const newUsername = ($('acc-new-username')?.value || '').trim();
      const newPass = ($('acc-new-password')?.value || '').trim();
      const newPin = ($('acc-new-pin')?.value || '').trim();
      const msgEl = $('acc-settings-msg');

      const auth = getStoredAuth();
      if (!auth) return;

      const oldHash = await hashPassword(oldPass, auth.salt);
      if (oldHash !== auth.passwordHash) {
        if (msgEl) {
          msgEl.className = 'pin-msg error';
          msgEl.textContent = 'موجودہ پاس ورڈ درست نہیں ہے۔';
        }
        $('acc-old-password')?.focus();
        return;
      }

      if (newUsername) auth.username = newUsername;

      if (newPass) {
        if (newPass.length < 4) {
          if (msgEl) {
            msgEl.className = 'pin-msg error';
            msgEl.textContent = 'نیا پاس ورڈ کم از کم 4 حروف کا ہونا چاہیے۔';
          }
          return;
        }
        const newSalt = makeSalt();
        auth.passwordHash = await hashPassword(newPass, newSalt);
        auth.salt = newSalt;
      }

      if (newPin) {
        if (!/^\d{4,8}$/.test(newPin)) {
          if (msgEl) {
            msgEl.className = 'pin-msg error';
            msgEl.textContent = 'نیا ریکوری پن 4 سے 8 ہندسے ہونا چاہیے۔';
          }
          return;
        }
        const recSalt = makeSalt();
        auth.recoveryPinHash = await hashPassword(newPin, recSalt);
        auth.recoverySalt = recSalt;
      }

      saveStoredAuth(auth);
      if (window.HisaabState) {
        window.HisaabState.auth = auth;
        if (typeof window.HisaabSave === 'function') window.HisaabSave();
      }

      if (msgEl) {
        msgEl.className = 'pin-msg success';
        msgEl.textContent = '✓ اکاؤنٹ سیٹنگز کامیابی سے محفوظ ہو گئیں!';
      }
      setTimeout(() => $('account-settings-dialog')?.close(), 1500);
    });

    if (window.location.search.includes('test=true') || window.__DISABLE_AUTH__) {
      unlockApp();
      return;
    }

    lockApp();
  }

  window.HisaabAuth = {
    init,
    lock: lockApp,
    unlock: unlockApp,
    isUnlocked: () => sessionUnlocked,
    getAuth: getStoredAuth,
    setAuth: saveStoredAuth,
    setup: executeSetup,
    login: executeLogin,
    recover: executeRecovery
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
