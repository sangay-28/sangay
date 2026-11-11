const loginPanel = document.getElementById('loginPanel');
const loginForm = document.getElementById('loginForm');
const dashboard = document.getElementById('dashboard');
const list = document.getElementById('submissionList');
const labels = {
  memberships: 'Membership applications',
  registrations: 'Event registrations',
  contacts: 'Contact messages',
};
const statuses = {
  memberships: ['pending', 'approved', 'rejected'],
  registrations: ['registered', 'attended', 'cancelled'],
  contacts: ['new', 'read', 'resolved'],
};
let activeTab = 'memberships';
let submissions = {};

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function text(value) {
  return String(value ?? '');
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function showDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  document.getElementById('logoutButton').hidden = false;
}

function showLogin() {
  loginPanel.hidden = false;
  loginForm.hidden = false;
  dashboard.hidden = true;
  document.getElementById('logoutButton').hidden = true;
}

function render() {
  const counts = Object.fromEntries(
    Object.keys(labels).map((key) => [key, (submissions[key] || []).length]),
  );
  const summary = document.getElementById('summary');
  summary.replaceChildren();
  for (const [key, label] of Object.entries(labels)) {
    const stat = element('div', 'stat');
    stat.append(element('b', '', counts[key]), element('span', '', label));
    summary.append(stat);
  }

  list.replaceChildren();
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('active', tab.dataset.tab === activeTab);
  }
  const rows = submissions[activeTab] || [];
  if (!rows.length) {
    list.append(element('div', 'empty', `No ${labels[activeTab].toLowerCase()} yet.`));
    return;
  }

  for (const row of rows) {
    const card = element('article', 'card');
    const content = element('div');
    let title = '';
    let meta = '';
    let detail = '';
    if (activeTab === 'memberships') {
      title = row.full_name;
      meta = [row.email, row.club, row.course, `Year ${row.year}`, row.created_at]
        .filter(Boolean)
        .join(' · ');
    } else if (activeTab === 'registrations') {
      title = `${row.first_name} ${row.last_name}`;
      meta = `${row.event_id} · ${row.student_id} · ${row.email} · ${row.created_at}`;
      detail = [row.department, row.year, row.phone, row.role, row.message]
        .filter(Boolean)
        .join(' · ');
    } else {
      title = row.subject;
      meta = `${row.name} · ${row.email} · ${row.created_at}`;
      detail = row.message;
    }
    content.append(element('h3', '', text(title)), element('p', 'meta', text(meta)));
    if (detail) content.append(element('p', 'body-copy', text(detail)));

    const select = document.createElement('select');
    select.setAttribute('aria-label', `Status for ${text(title)}`);
    for (const status of statuses[activeTab]) {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status[0].toUpperCase() + status.slice(1);
      select.append(option);
    }
    select.value = row.status || statuses[activeTab][0];
    select.addEventListener('change', async () => {
      select.disabled = true;
      try {
        await api(`/api/admin/${activeTab}/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: select.value }),
        });
        row.status = select.value;
      } catch (error) {
        document.getElementById('dashboardFeedback').textContent = error.message;
        select.value = row.status;
      } finally {
        select.disabled = false;
      }
    });
    card.append(content, select);
    list.append(card);
  }
}

async function load() {
  const feedback = document.getElementById('dashboardFeedback');
  try {
    submissions = await api('/api/admin/submissions');
    feedback.textContent = '';
    showDashboard();
    render();
  } catch (error) {
    if (error.message.includes('administrator')) showLogin();
    else {
      showDashboard();
      feedback.textContent = error.message;
    }
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = new FormData(loginForm);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const button = loginForm.querySelector('button[type="submit"]');
  const feedback = document.getElementById('loginFeedback');
  button.disabled = true;
  feedback.textContent = 'Signing in…';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    loginForm.reset();
    await load();
  } catch (error) {
    feedback.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById('logoutButton').addEventListener('click', async () => {
  const button = document.getElementById('logoutButton');
  button.disabled = true;
  try {
    await api('/api/admin/logout', { method: 'POST', body: '{}' });
    showLogin();
  } catch (error) {
    document.getElementById('dashboardFeedback').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

document.getElementById('refreshButton').addEventListener('click', load);
document.getElementById('tabs').addEventListener('click', (event) => {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    activeTab = tab.dataset.tab;
    render();
  }
});

load();
