const API_BASE_URL = 'http://localhost:5000/api';

function getToken() {
  return localStorage.getItem('quickwashToken') || '';
}

function getCurrentUser() {
  const raw = localStorage.getItem('quickwashUser');
  return raw ? JSON.parse(raw) : null;
}

function setSession(user) {
  localStorage.setItem('quickwashToken', user.token);
  localStorage.setItem('quickwashUser', JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem('quickwashToken');
  localStorage.removeItem('quickwashUser');
  localStorage.removeItem('quickwashCart');
}

async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }

  return data;
}

function requireAuth() {
  const user = getCurrentUser();
  if (!user || !getToken()) {
    alert('Please login first.');
    window.location.href = 'login.html';
    return null;
  }
  return user;
}

function updateNavUser() {
  const user = getCurrentUser();
  const userEls = document.querySelectorAll('[data-user-name]');
  userEls.forEach((el) => {
    el.textContent = user ? user.name : 'Guest';
  });
}

function logout() {
  clearSession();
  window.location.href = 'login.html';
}
