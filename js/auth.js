import { supabase } from './supabase.js';

// If already logged in, go straight to dashboard
const { data: { session } } = await supabase.auth.getSession();
if (session) window.location.href = '/dashboard.html';

const form = document.getElementById('loginForm');
const errorMsg = document.getElementById('errorMsg');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.classList.remove('show');
  submitBtn.textContent = 'Signing in…';
  submitBtn.disabled = true;

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errorMsg.textContent = 'Invalid email or password. Please try again.';
    errorMsg.classList.add('show');
    submitBtn.textContent = 'Sign In';
    submitBtn.disabled = false;
  } else {
    window.location.href = '/dashboard.html';
  }
});
