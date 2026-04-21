import { supabase } from './supabase.js';

// Call at the top of every protected page
export async function requireAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = '/index.html';
    return null;
  }
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
