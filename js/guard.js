import { supabase } from './supabase.js';

const TIMEOUT_MS = 30 * 60 * 1000;   // 30 minutes
const WARNING_MS = 28 * 60 * 1000;   // warn at 28 minutes
let lastActivity = Date.now();
let warningShown = false;

function resetActivity() {
  lastActivity = Date.now();
  warningShown = false;
  const banner = document.getElementById('session-warning');
  if (banner) banner.remove();
}

function showWarning() {
  if (warningShown || document.getElementById('session-warning')) return;
  warningShown = true;
  const banner = document.createElement('div');
  banner.id = 'session-warning';
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
    'background:#b45309', 'color:#fff', 'text-align:center',
    'padding:12px 16px', 'font-size:0.9rem', 'font-weight:600',
    'box-shadow:0 2px 8px rgba(0,0,0,0.2)',
  ].join(';');
  banner.textContent = 'Your session will expire in 2 minutes due to inactivity. Move your mouse or press a key to stay signed in.';
  document.body.prepend(banner);
}

function initInactivityTimeout() {
  const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
  events.forEach(e => window.addEventListener(e, resetActivity, { passive: true }));

  setInterval(() => {
    const idle = Date.now() - lastActivity;
    if (idle >= TIMEOUT_MS) {
      logout();
    } else if (idle >= WARNING_MS) {
      showWarning();
    }
  }, 15_000); // check every 15 seconds
}

// Call at the top of every protected page
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }
  initInactivityTimeout();
  return session;
}

export function renderUser(session) {
  const el = document.getElementById('topbar-user');
  if (el) el.textContent = session.user.email;
}

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = '/index.html';
}
