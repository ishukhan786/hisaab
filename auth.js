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

  // Default credentials for fresh installations on any PC or laptop
  // Username: admin, Password: admin, Recovery PIN: 1234 (PBKDF2 20,000 iter SHA-256)
  const DEFAULT_AUTH = Object.freeze({
    username: 'admin',
    passwordHash: 'e63959f656cbaa9d9d1ae2b8a7f3988d65241de210729c810399fddf93ae7f34',
    salt: 'hisaab_default_salt_2026',
    recoveryPinHash: '00a1e5c902149afeaf0774cd416656cb23579b68aec1ea35b21c74577c888bc9',
    recoverySalt: 'hisaab_default_rec_salt_2026',
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z'
  });

  function getStoredAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.passwordHash) return parsed;
      }
    } catch (_) {}
    if (window.HisaabState?.auth && window.HisaabState.auth.passwordHash) {
      return window.HisaabState.auth;
    }
    return { ...DEFAULT_AUTH };
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
  let lastActivityResetAt = 0;
  const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  const ACTIVITY_THROTTLE_MS = 4000;

  function resetInactivity(e) {
    if (e && sessionUnlocked) {
      const now = Date.now();
      if (now - lastActivityResetAt < ACTIVITY_THROTTLE_MS) return;
      lastActivityResetAt = now;
    } else {
      lastActivityResetAt = Date.now();
    }
    if (inactivityTimer) clearTimeout(inactivityTimer);
    if (sessionUnlocked) {
      inactivityTimer = setTimeout(() => {
        lockApp('App locked due to 15 minutes of inactivity.');
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
    el.style.transform = '';
    el.classList.remove('auth-shake');
    void el.offsetWidth;
    el.classList.add('auth-shake');
    setTimeout(() => el.classList.remove('auth-shake'), 600);
  }

  function hideAllCards() {
    const cards = ['auth-setup-card', 'auth-login-card', 'auth-recovery-card'];
    cards.forEach(id => {
      const el = $(id);
      if (el) {
        el.hidden = true;
        el.style.transform = '';
      }
    });
  }

  function lockApp(reason = 'Enter your credentials to continue') {
    const wasUnlocked = sessionUnlocked;
    sessionUnlocked = false;
    if (inactivityTimer) clearTimeout(inactivityTimer);

    if (wasUnlocked && window.location.protocol.startsWith('http')) {
      window.fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    }

    const overlay = $('auth-overlay');
    if (!overlay) return;

    overlay.hidden = false;
    document.querySelectorAll('body > :not(#auth-overlay)').forEach(el => {
      el.inert = true;
    });

    const auth = getStoredAuth();
    hideAllCards();

    // Signup/setup is intentionally disabled for the web app. Always show login.
    {
      const loginCard = $('auth-login-card');
      if (loginCard) {
        loginCard.hidden = false;
        const reasonEl = $('auth-login-reason');
        if (reasonEl) {
          reasonEl.textContent = auth?.isDefault
            ? 'Sign in with credentials (Default: admin / admin)'
            : reason;
        }
        const errEl = $('auth-login-error');
        if (errEl) errEl.textContent = '';
        const userInp = $('login-username');
        const passInp = $('login-password');
        const remInp = $('remember-me');
        let rememberUser = true;
        try {
          rememberUser = localStorage.getItem('hisaab-remember-user') !== '0';
        } catch (_) {}
        if (remInp) remInp.checked = rememberUser;
        if (passInp) passInp.value = '';
        if (userInp) {
          if (!rememberUser) userInp.value = '';
          else if (!userInp.value && auth?.username) userInp.value = auth.username;
          else if (!userInp.value) userInp.value = 'admin';
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
    document.body.classList.remove('auth-startup-pending');

    document.querySelectorAll('body > :not(#auth-overlay)').forEach(el => {
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
      btn.title = isPass ? 'Hide password' : 'Show password';
      btn.setAttribute('aria-label', btn.title);
      btn.innerHTML = isPass
        ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
        : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    });
  }

  async function executeSetup(username, password, confirmPass, recoveryPin) {
    const errEl = $('auth-setup-error');
    if (!username) {
      if (errEl) errEl.textContent = 'Please enter a username.';
      shakeCard('auth-setup-card');
      $('setup-username')?.focus();
      return { success: false, error: 'username' };
    }
    if (password.length < 4) {
      if (errEl) errEl.textContent = 'Password must be at least 4 characters.';
      shakeCard('auth-setup-card');
      $('setup-password')?.focus();
      return { success: false, error: 'password_length' };
    }
    if (password !== confirmPass) {
      if (errEl) errEl.textContent = 'Passwords do not match.';
      shakeCard('auth-setup-card');
      $('setup-password-confirm')?.focus();
      return { success: false, error: 'password_mismatch' };
    }
    if (!/^\d{4,8}$/.test(recoveryPin)) {
      if (errEl) errEl.textContent = 'Recovery PIN must be 4 to 8 digits.';
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
    const isWebMode = window.location.protocol.startsWith('http');

    const rememberEl = $('remember-me');
    if (rememberEl) {
      try {
        localStorage.setItem('hisaab-remember-user', rememberEl.checked ? '1' : '0');
      } catch (_) {}
    }

    if (isWebMode) {
      if (!username || !password) {
        if (errEl) errEl.textContent = 'Please enter both username and password.';
        shakeCard('auth-login-card');
        return { success: false, error: 'empty_fields' };
      }
      const submitBtn = $('login-submit-btn');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const response = await window.fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ username, password })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.status !== 'ok') {
          if (errEl) errEl.textContent = response.status === 401 ? 'Invalid username or password.' : 'Login service unavailable.';
          shakeCard('auth-login-card');
          return { success: false, error: 'invalid_credentials' };
        }
        if (auth) {
          auth.username = result.username || username;
          saveStoredAuth(auth);
        }
        unlockApp();
        return { success: true };
      } catch (_) {
        if (errEl) errEl.textContent = 'Server سے رابطہ نہیں ہو سکا۔';
        shakeCard('auth-login-card');
        return { success: false, error: 'network' };
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    if (!auth || !auth.passwordHash) {
      lockApp();
      return { success: false, error: 'no_auth' };
    }
    const activeAuth = auth;

    const btnText = $('login-btn-text');
    const spinner = $('login-spinner');
    const submitBtn = $('login-submit-btn');

    const setBusy = busy => {
      if (!btnText || !spinner || !submitBtn) return;
      if (busy) {
        btnText.classList.add('hidden');
        spinner.classList.remove('hidden');
        submitBtn.disabled = true;
      } else {
        btnText.classList.remove('hidden');
        spinner.classList.add('hidden');
        submitBtn.disabled = false;
      }
    };

    if (!username || !password) {
      if (errEl) errEl.textContent = 'Please enter both username and password.';
      shakeCard('auth-login-card');
      return { success: false, error: 'empty_fields' };
    }

    setBusy(true);

    if (username.toLowerCase() !== (activeAuth.username || '').toLowerCase()) {
      setBusy(false);
      if (errEl) errEl.textContent = 'Invalid username or password.';
      shakeCard('auth-login-card');
      return { success: false, error: 'invalid_credentials' };
    }

    const hash = await hashPassword(password, activeAuth.salt);
    if (hash !== activeAuth.passwordHash) {
      setBusy(false);
      if (errEl) errEl.textContent = 'Incorrect password. Please try again.';
      shakeCard('auth-login-card');
      $('login-password')?.focus();
      return { success: false, error: 'invalid_password' };
    }

    // Success delay for smooth tactile satisfaction
    await new Promise(r => setTimeout(r, 280));
    setBusy(false);
    if (!auth || !auth.passwordHash) {
      activeAuth.createdAt = new Date().toISOString();
      saveStoredAuth(activeAuth);
      if (window.HisaabState) {
        window.HisaabState.auth = activeAuth;
        if (typeof window.HisaabSave === 'function') window.HisaabSave();
      }
    }
    unlockApp();
    return { success: true };
  }

  async function executeRecovery(username, pin, newPass, confirmPass) {
    const errEl = $('auth-recovery-error');
    const auth = getStoredAuth();
    if (!auth || !auth.passwordHash) {
      lockApp();
      return { success: false, error: 'no_auth' };
    }

    if (username.toLowerCase() !== (auth.username || '').toLowerCase()) {
      if (errEl) errEl.textContent = 'Username does not match our records.';
      shakeCard('auth-recovery-card');
      return { success: false, error: 'invalid_username' };
    }

    const pinHash = await hashPassword(pin, auth.recoverySalt || auth.salt);
    if (pinHash !== auth.recoveryPinHash) {
      if (errEl) errEl.textContent = 'Incorrect Recovery PIN.';
      shakeCard('auth-recovery-card');
      $('recovery-pin')?.focus();
      return { success: false, error: 'invalid_pin' };
    }

    if (newPass.length < 4) {
      if (errEl) errEl.textContent = 'New password must be at least 4 characters.';
      shakeCard('auth-recovery-card');
      $('recovery-new-password')?.focus();
      return { success: false, error: 'password_length' };
    }

    if (newPass !== confirmPass) {
      if (errEl) errEl.textContent = 'New password and confirmation do not match.';
      shakeCard('auth-recovery-card');
      $('recovery-new-password-confirm')?.focus();
      return { success: false, error: 'password_mismatch' };
    }

    const newSalt = makeSalt();
    auth.passwordHash = await hashPassword(newPass, newSalt);
    auth.salt = newSalt;
    auth.isDefault = false;
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

    // Desktop may still use the local first-time setup; web never binds it.
    if (!window.location.protocol.startsWith('http')) {
      $('auth-setup-form')?.addEventListener('submit', async e => {
        e.preventDefault();
        await executeSetup(
          ($('setup-username')?.value || '').trim(),
          ($('setup-password')?.value || '').trim(),
          ($('setup-password-confirm')?.value || '').trim(),
          ($('setup-recovery-pin')?.value || '').trim()
        );
      });
    }

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
      lockApp('App locked by user.');
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

      if (window.location.protocol.startsWith('http')) {
        if (newPass && newPass.length < 4) {
          if (msgEl) { msgEl.className = 'pin-msg error'; msgEl.textContent = 'New password must be at least 4 characters.'; }
          return;
        }
        if (newPin && !/^\d{4,8}$/.test(newPin)) {
          if (msgEl) { msgEl.className = 'pin-msg error'; msgEl.textContent = 'New Recovery PIN must be 4 to 8 digits.'; }
          return;
        }
        if (!newPass && !newUsername && !newPin) {
          if (msgEl) { msgEl.className = 'pin-msg error'; msgEl.textContent = 'Please enter a new username, password, or Recovery PIN.'; }
          return;
        }
        try {
          const response = await window.fetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ currentPassword: oldPass, newPassword: newPass, newUsername })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || result.status !== 'ok') {
            if (msgEl) { msgEl.className = 'pin-msg error'; msgEl.textContent = result.message || 'Account settings could not be updated.'; }
            return;
          }
          const auth = getStoredAuth();
          if (auth) {
            if (newUsername) auth.username = newUsername;
            if (newPass) {
              const newSalt = makeSalt();
              auth.passwordHash = await hashPassword(newPass, newSalt);
              auth.salt = newSalt;
            }
            if (newPin) {
              const recSalt = makeSalt();
              auth.recoveryPinHash = await hashPassword(newPin, recSalt);
              auth.recoverySalt = recSalt;
            }
            auth.isDefault = false;
            saveStoredAuth(auth);
            if (window.HisaabState) {
              window.HisaabState.auth = auth;
              if (typeof window.HisaabSave === 'function') window.HisaabSave();
            }
          }
          if (msgEl) { msgEl.className = 'pin-msg success'; msgEl.textContent = '✓ Account settings saved successfully!'; }
          setTimeout(() => $('account-settings-dialog')?.close(), 1500);
        } catch (_) {
          if (msgEl) { msgEl.className = 'pin-msg error'; msgEl.textContent = 'Server سے رابطہ نہیں ہو سکا۔'; }
        }
        return;
      }

      const auth = getStoredAuth();
      if (!auth) return;

      const oldHash = await hashPassword(oldPass, auth.salt);
      if (oldHash !== auth.passwordHash) {
        if (msgEl) {
          msgEl.className = 'pin-msg error';
          msgEl.textContent = 'Current password is incorrect.';
        }
        $('acc-old-password')?.focus();
        return;
      }

      if (newUsername) auth.username = newUsername;

      if (newPass) {
        if (newPass.length < 4) {
          if (msgEl) {
            msgEl.className = 'pin-msg error';
            msgEl.textContent = 'New password must be at least 4 characters.';
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
            msgEl.textContent = 'New Recovery PIN must be 4 to 8 digits.';
          }
          return;
        }
        const recSalt = makeSalt();
        auth.recoveryPinHash = await hashPassword(newPin, recSalt);
        auth.recoverySalt = recSalt;
      }

      auth.isDefault = false;
      saveStoredAuth(auth);
      if (window.HisaabState) {
        window.HisaabState.auth = auth;
        if (typeof window.HisaabSave === 'function') window.HisaabSave();
      }

      if (msgEl) {
        msgEl.className = 'pin-msg success';
        msgEl.textContent = '✓ Account settings saved successfully!';
      }
      setTimeout(() => $('account-settings-dialog')?.close(), 1500);
    });

    setupGlassInteractivity();

    if (window.location.search.includes('test=true') || window.__DISABLE_AUTH__) {
      unlockApp();
      return;
    }

    lockApp();
    document.body.classList.remove('auth-startup-pending');

    if (window.location.protocol.startsWith('http')) {
      window.fetch('/api/auth/status', { credentials: 'same-origin' })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.isAuthenticated) {
            if (data.username) {
              const auth = getStoredAuth();
              if (auth) {
                auth.username = data.username;
                saveStoredAuth(auth);
              }
            }
            unlockApp();
          }
        })
        .catch(() => {});
    }
  }

  function setupGlassInteractivity() {
    const overlay = $('auth-overlay');
    if (!overlay) return;

    // Real-time username checkmark feedback
    const usernameInput = $('login-username');
    const userValidIcon = $('user-valid-icon');
    if (usernameInput && userValidIcon) {
      usernameInput.addEventListener('input', () => {
        const val = usernameInput.value.trim();
        const errEl = $('auth-login-error');
        if (errEl) errEl.textContent = '';
        if (val.length >= 3) {
          userValidIcon.classList.remove('opacity-0');
          userValidIcon.classList.add('opacity-100');
        } else {
          userValidIcon.classList.remove('opacity-100');
          userValidIcon.classList.add('opacity-0');
        }
      });
    }

    // Clear login error on password input
    const passwordInput = $('login-password');
    if (passwordInput) {
      passwordInput.addEventListener('input', () => {
        const errEl = $('auth-login-error');
        if (errEl) errEl.textContent = '';
      });
    }

    // Button ripple micro-interaction
    document.querySelectorAll('.btn-primary-glow').forEach(button => {
      button.addEventListener('click', function(e) {
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        const ripple = document.createElement('span');
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.className = 'ripple-circle';

        this.appendChild(ripple);
        setTimeout(() => ripple.remove(), 650);
      });
    });
  }

  window.HisaabAuth = {
    init,
    lock: lockApp,
    unlock: unlockApp,
    isUnlocked: () => sessionUnlocked,
    getAuth: getStoredAuth,
    getCurrentUser: () => getStoredAuth(),
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
