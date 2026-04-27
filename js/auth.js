import { supabase } from './supabase.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const STORAGE_KEY = 'ta_login_attempts';

function getLockState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { count: 0, lockedUntil: 0 }; }
  catch { return { count: 0, lockedUntil: 0 }; }
}
function setLockState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function clearLockState() { localStorage.removeItem(STORAGE_KEY); }

// If already logged in, go straight to dashboard
const { data: { session } } = await supabase.auth.getSession();
if (session) window.location.href = '/dashboard.html';

const form = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');
const submitBtn = document.getElementById('submitBtn');

function isLocked() {
  const state = getLockState();
  if (state.lockedUntil && Date.now() < state.lockedUntil) {
    const mins = Math.ceil((state.lockedUntil - Date.now()) / 60000);
    errorMsg.textContent = `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
    errorMsg.classList.add('show');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sign In';
    return true;
  }
  return false;
}

isLocked();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (isLocked()) return;

  errorMsg.classList.remove('show');
  submitBtn.textContent = 'Signing in…';
  submitBtn.disabled = true;

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const state = getLockState();
    const newCount = (state.count || 0) + 1;
    if (newCount >= MAX_ATTEMPTS) {
      setLockState({ count: newCount, lockedUntil: Date.now() + LOCKOUT_MS });
      errorMsg.textContent = 'Too many failed attempts. Please try again in 15 minutes.';
      submitBtn.disabled = true;
    } else {
      setLockState({ count: newCount, lockedUntil: 0 });
      const left = MAX_ATTEMPTS - newCount;
      errorMsg.textContent = `Invalid email or password. ${left} attempt${left !== 1 ? 's' : ''} remaining.`;
      submitBtn.textContent = 'Sign In';
      submitBtn.disabled = false;
    }
    errorMsg.classList.add('show');
  } else {
    clearLockState();
    window.location.href = '/dashboard.html';
  }
});
