const list = document.getElementById('accountList');
const feedback = document.getElementById('feedback');
const eventList = document.getElementById('eventList');
const eventFeedback = document.getElementById('eventFeedback');
const clubs = [
  'Sherubtse Tarayana',
  'Sherubtse Art Club',
  'SMS',
  'GNH Youth Club',
  'Cultural Unit',
  'Democracy Club',
  'Y-PEER',
  'Taekwondo Club',
  'UN Club',
];
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
function node(tag, cls, text) {
  const item = document.createElement(tag);
  if (cls) item.className = cls;
  if (text !== undefined) item.textContent = String(text);
  return item;
}
async function loadAccounts() {
  try {
    const data = await api('/api/admin/accounts');
    list.replaceChildren();
    if (!data.accounts.length) {
      list.append(node('div', 'empty', 'No member or leader accounts yet.'));
      return;
    }
    data.accounts.forEach((account) => {
      const content = node('div');
      content.append(
        node(
          'h3',
          '',
          `${account.full_name} · ${account.role === 'leader' ? account.club : 'Member'}`,
        ),
      );
      content.append(node('p', 'meta', `${account.email} · Created ${account.created_at}`));
      if (account.role === 'leader') {
        const assignment = document.createElement('select');
        assignment.setAttribute('aria-label', `Assigned club for ${account.full_name}`);
        clubs.forEach((club) => {
          const option = document.createElement('option');
          option.value = club;
          option.textContent = club;
          assignment.append(option);
        });
        assignment.value = account.club;
        assignment.addEventListener('change', async () => {
          assignment.disabled = true;
          try {
            const result = await api(`/api/admin/accounts/${account.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ club: assignment.value }),
            });
            account.club = assignment.value;
            feedback.textContent = result.message;
            await loadAccounts();
          } catch (error) {
            feedback.textContent = error.message;
            assignment.disabled = false;
          }
        });
        content.append(assignment);
      }
      const toggle = node(
        'button',
        'button button-outline',
        account.active ? 'Disable account' : 'Enable account',
      );
      toggle.type = 'button';
      toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        try {
          await api(`/api/admin/accounts/${account.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: !account.active }),
          });
          await loadAccounts();
        } catch (error) {
          feedback.textContent = error.message;
          toggle.disabled = false;
        }
      });
      const card = node('article', 'card');
      card.append(content, toggle);
      list.append(card);
    });
  } catch (error) {
    feedback.textContent = `${error.message} Sign in at the administrator page, then return here.`;
  }
}
async function loadEvents() {
  try {
    const data = await api('/api/admin/events');
    eventList.replaceChildren();
    data.events.forEach((event) => {
      const details = node('div');
      details.append(node('h3', '', event.title));
      details.append(node('p', 'meta', `${event.category} · ${event.date} · ${event.status}`));
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Club responsible for ${event.title}`);
      const unassigned = document.createElement('option');
      unassigned.value = '';
      unassigned.textContent = 'Assign to a club';
      select.append(unassigned);
      clubs.forEach((club) => {
        const option = document.createElement('option');
        option.value = club;
        option.textContent = club;
        select.append(option);
      });
      select.value = event.club;
      select.addEventListener('change', async () => {
        select.disabled = true;
        try {
          const result = await api(`/api/admin/events/${encodeURIComponent(event.id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ club: select.value }),
          });
          event.club = select.value;
          eventFeedback.textContent = `${event.title}: ${result.message}`;
        } catch (error) {
          eventFeedback.textContent = error.message;
          select.value = event.club;
        } finally {
          select.disabled = false;
        }
      });
      const card = node('article', 'card');
      card.append(details, select);
      eventList.append(card);
    });
  } catch (error) {
    eventFeedback.textContent = `${error.message} Sign in at the administrator page, then return here.`;
  }
}
document.getElementById('leaderForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const body = Object.fromEntries(new FormData(form));
  button.disabled = true;
  feedback.textContent = 'Creating account…';
  try {
    const result = await api('/api/admin/leaders', { method: 'POST', body: JSON.stringify(body) });
    feedback.textContent = result.message;
    form.reset();
    await loadAccounts();
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
    window.location.href = 'admin.html';
  } catch (error) {
    document.getElementById('accountFeedback').textContent = error.message;
    button.disabled = false;
  }
});
loadAccounts();
loadEvents();
