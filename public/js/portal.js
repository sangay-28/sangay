const role = document.body.dataset.role;
const feedback = document.getElementById('feedback');
const list = document.getElementById('memberships');
function node(tag, cls, value) { const item = document.createElement(tag); if (cls) item.className = cls; if (value !== undefined) item.textContent = String(value ?? ''); return item; }
async function request(url, options) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}
function empty(container, message) { container.replaceChildren(node('div', 'empty-state', message)); }
function renderMemberships(rows, editable) {
  if (!rows.length) return empty(list, role === 'leader' ? 'There are no applications for your club yet.' : 'You have not applied to a club yet.');
  list.replaceChildren();
  for (const row of rows) {
    const content = node('div');
    content.append(node('h3', '', editable ? row.full_name : row.club));
    const detail = editable ? [row.email, row.course, `Year ${row.year}`, row.created_at].filter(Boolean).join(' · ') : `Year ${row.year} · ${row.course} · ${row.created_at}`;
    content.append(node('p', 'portal-meta', detail));
    const status = document.createElement(editable ? 'select' : 'span');
    if (editable) {
      status.setAttribute('aria-label', `Application status for ${row.full_name}`);
      for (const value of ['pending', 'approved', 'rejected']) { const option = document.createElement('option'); option.value = value; option.textContent = value[0].toUpperCase() + value.slice(1); status.append(option); }
      status.value = row.status;
      status.addEventListener('change', async () => {
        status.disabled = true;
        try {
          await request(`/api/leader/memberships/${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: status.value }) });
          row.status = status.value;
          await load();
        }
        catch (error) { feedback.textContent = error.message; status.value = row.status; }
        finally { status.disabled = false; }
      });
    } else { status.className = 'status-pill'; status.textContent = row.status; }
    const card = node('article', 'portal-row'); card.append(content, status); list.append(card);
  }
}
function renderMembers(rows) {
  const container = document.getElementById('members');
  if (!rows.length) return empty(container, 'Your club has no approved members yet.');
  container.replaceChildren();
  rows.forEach((member) => {
    const content = node('div');
    content.append(node('h3', '', member.full_name));
    content.append(node('p', 'portal-meta', [member.email, member.course, `Year ${member.year}`].filter(Boolean).join(' · ')));
    const card = node('article', 'portal-row');
    card.append(content, node('span', 'status-pill', 'Approved member'));
    container.append(card);
  });
}
function renderRegistrations(rows) {
  const container = document.getElementById('registrations');
  if (!rows.length) return empty(container, 'You have not registered for an event yet.');
  container.replaceChildren();
  rows.forEach((row) => { const content = node('div'); content.append(node('h3', '', row.event_id), node('p', 'portal-meta', row.created_at)); const status = node('span', 'status-pill', row.status); const card = node('article', 'portal-row'); card.append(content, status); container.append(card); });
}
function renderClubEvents(rows) {
  const container = document.getElementById('clubEvents');
  if (!rows.length) return empty(container, 'No events are assigned to your club yet.');
  container.replaceChildren();
  rows.forEach((event) => {
    const content = node('div');
    content.append(node('h3', '', event.title));
    content.append(node('p', 'portal-meta', `${event.category} · ${event.date} · ${event.status} · ${event.registrations} registrations`));
    const card = node('article', 'portal-row');
    card.append(content, node('span', 'status-pill', event.status));
    container.append(card);
  });
}
function renderEventActivity(rows, events) {
  const container = document.getElementById('eventActivity');
  if (!rows.length) return empty(container, 'No one has registered for your club events yet.');
  const eventTitles = new Map(events.map((event) => [event.id, event.title]));
  container.replaceChildren();
  rows.forEach((activity) => {
    const content = node('div');
    content.append(node('h3', '', `${activity.first_name} ${activity.last_name}`));
    content.append(node('p', 'portal-meta', `${eventTitles.get(activity.event_id) || activity.event_id} · ${activity.email} · ${activity.student_id} · ${activity.created_at}`));
    const card = node('article', 'portal-row');
    card.append(content, node('span', 'status-pill', activity.status));
    container.append(card);
  });
}
async function load() {
  try {
    const data = await request(role === 'leader' ? '/api/leader/dashboard' : '/api/member/dashboard');
    document.getElementById('accountName').textContent = data.account.fullName;
    if (role === 'leader') {
      document.getElementById('clubTitle').textContent = `${data.account.club} dashboard`;
      document.getElementById('approvedMembers').textContent = data.stats.approvedMembers;
      document.getElementById('pendingApplications').textContent = data.stats.pendingApplications;
      document.getElementById('totalApplications').textContent = data.stats.totalApplications;
      document.getElementById('eventRegistrations').textContent = data.stats.eventRegistrations;
      renderClubEvents(data.events);
      renderMembers(data.members);
      renderMemberships(data.memberships, true);
      renderEventActivity(data.eventActivity, data.events);
    }
    else { renderMemberships(data.memberships, false); renderRegistrations(data.registrations); }
  } catch (error) {
    if (error.message.includes('sign in')) window.location.replace('login.html');
    else feedback.textContent = error.message;
  }
}
document.getElementById('logoutButton').addEventListener('click', async () => {
  const button = document.getElementById('logoutButton'); button.disabled = true;
  try { await request('/api/auth/logout', { method: 'POST', body: '{}' }); window.location.href = 'login.html'; }
  catch (error) { feedback.textContent = error.message; button.disabled = false; }
});
load();
