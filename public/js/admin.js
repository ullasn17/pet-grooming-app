/**
 * Admin Portal Management for Sanjay (PetAdmin@gmail.com)
 * Salon: Pawfect Glow Pet Grooming
 */

let allAppointments = [];
let currentFilter = 'all';
let currentSearch = '';
let currentAdmin = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Enforce strict Admin authentication
  currentAdmin = await checkAdminAccess();
  if (!currentAdmin) return;

  // Reveal Admin view
  const adminBody = document.getElementById('adminBody');
  if (adminBody) adminBody.style.display = 'block';

  // Display admin name
  const nameEl = document.getElementById('adminNameDisplay');
  if (nameEl) nameEl.textContent = currentAdmin.name || 'Sanjay';

  // Load stats and appointment list
  await loadAdminData();
});

// Guard: verify admin role
async function checkAdminAccess() {
  const token = localStorage.getItem('pet_grooming_token');
  if (!token) {
    showToast('Admin session required. Please sign in.', 'error');
    window.location.replace('/login.html');
    return null;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      localStorage.removeItem('pet_grooming_token');
      localStorage.removeItem('pet_grooming_user');
      window.location.replace('/login.html');
      return null;
    }

    const data = await res.json();
    if (!data.success || !data.user || data.user.role !== 'admin') {
      showToast('Access denied: Administrator privileges required.', 'error');
      setTimeout(() => {
        window.location.replace('/dashboard.html');
      }, 1000);
      return null;
    }

    return data.user;
  } catch (err) {
    console.error('Admin verification error:', err);
    window.location.replace('/login.html');
    return null;
  }
}

// Load statistics & appointments
async function loadAdminData() {
  await Promise.all([
    loadStats(),
    loadAppointments()
  ]);
}

async function loadStats() {
  try {
    const res = await authFetch('/api/admin/stats');
    const data = await res.json();

    if (res.ok && data.success && data.stats) {
      const s = data.stats;
      document.getElementById('statTotalBookings').textContent = s.totalBookings || 0;
      document.getElementById('statPendingCount').textContent = s.pendingCount || 0;
      document.getElementById('statConfirmedCount').textContent = s.confirmedCount || 0;
      document.getElementById('statRejectedCount').textContent = s.rejectedCount || 0;
      document.getElementById('statTotalRevenue').textContent = `$${s.totalRevenue || 0}`;
    }
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

async function loadAppointments() {
  try {
    const res = await authFetch('/api/admin/appointments');
    const data = await res.json();

    if (res.ok && data.success) {
      allAppointments = data.appointments || [];
      renderAppointmentsTable();
    } else {
      showToast(data.message || 'Could not fetch appointments.', 'error');
    }
  } catch (err) {
    console.error('Failed to load appointments:', err);
    showToast('Error loading appointments.', 'error');
  }
}

// Filter and Search logic
function setFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  const activeBtn = Array.from(document.querySelectorAll('.filter-btn')).find(b => {
    if (filter === 'all' && b.textContent.includes('All')) return true;
    return b.textContent.includes(filter);
  });
  if (activeBtn) activeBtn.classList.add('active');

  renderAppointmentsTable();
}

function handleSearch() {
  currentSearch = document.getElementById('searchInput').value.toLowerCase().trim();
  renderAppointmentsTable();
}

function renderAppointmentsTable() {
  const container = document.getElementById('appointmentsTableContainer');
  if (!container) return;

  // Filter list
  let filtered = allAppointments;

  if (currentFilter !== 'all') {
    filtered = filtered.filter(a => a.status === currentFilter);
  }

  if (currentSearch) {
    filtered = filtered.filter(a => {
      const clientName = (a.userId?.name || '').toLowerCase();
      const clientEmail = (a.userId?.email || '').toLowerCase();
      const petName = (a.petName || '').toLowerCase();
      const service = (a.service || '').toLowerCase();
      return clientName.includes(currentSearch) ||
             clientEmail.includes(currentSearch) ||
             petName.includes(currentSearch) ||
             service.includes(currentSearch);
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 60px 20px;">
        <span class="empty-state-icon">📋</span>
        <h3>No appointments match your filters</h3>
        <p>Try switching filter tabs or clearing your search term.</p>
        <button class="btn btn-outline btn-sm" onclick="setFilter('all'); document.getElementById('searchInput').value=''; currentSearch='';">
          Reset Filters
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="appointments-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Pet</th>
          <th>Service Package</th>
          <th>Date & Time</th>
          <th>Price & Payment</th>
          <th>Status</th>
          <th style="text-align: right;">Admin Action</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(app => `
          <tr id="row-${app._id}">
            <td>
              <strong>${escapeHtml(app.userId?.name || 'Customer')}</strong>
              <div style="font-size: 0.8rem; color: var(--color-text-muted);">${escapeHtml(app.userId?.email || 'No email')}</div>
            </td>
            <td>
              <strong>🐶 ${escapeHtml(app.petName)}</strong>
              ${app.notes ? `<div style="font-size: 0.78rem; color: var(--color-text-light); font-style: italic;">“${escapeHtml(app.notes)}”</div>` : ''}
            </td>
            <td>
              ${escapeHtml(app.service)}
            </td>
            <td>
              <strong>${escapeHtml(app.date)}</strong>
              <div style="font-size: 0.8rem; color: var(--color-text-light);">${escapeHtml(app.timeSlot)}</div>
            </td>
            <td>
              <strong>$${app.price || 45}</strong>
              <br>
              ${app.paymentStatus === 'Paid' 
                ? '<span class="badge badge-paid" style="font-size: 0.72rem;">✓ Paid</span>' 
                : '<span class="badge badge-unpaid" style="font-size: 0.72rem;">Unpaid</span>'}
            </td>
            <td>
              <span class="badge badge-${(app.status || 'Pending').toLowerCase()}">
                ${app.status === 'Confirmed' 
                  ? '● Confirmed' 
                  : (app.status === 'Rejected' 
                      ? '✕ Rejected' 
                      : (app.status === 'Cancelled' ? '✕ Cancelled' : '⏳ Pending'))}
              </span>
            </td>
            <td style="text-align: right;">
              <div style="display: inline-flex; gap: 6px; justify-content: flex-end;">
                ${app.status !== 'Confirmed' ? `
                  <button class="action-btn-accept" onclick="updateAppointmentStatus('${app._id}', 'Confirmed')" title="Accept Appointment">
                    ✓ Accept
                  </button>
                ` : `
                  <span style="font-size: 0.8rem; color: #059669; font-weight: 700; margin-right: 6px; display: inline-flex; align-items: center;">✓ Approved</span>
                `}

                ${app.status !== 'Rejected' ? `
                  <button class="action-btn-reject" onclick="updateAppointmentStatus('${app._id}', 'Rejected')" title="Reject Appointment">
                    ✕ Reject
                  </button>
                ` : `
                  <span style="font-size: 0.8rem; color: #dc2626; font-weight: 700; margin-left: 6px; display: inline-flex; align-items: center;">✕ Declined</span>
                `}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Accept or Reject appointment action
window.updateAppointmentStatus = async function(appointmentId, newStatus) {
  const actionText = newStatus === 'Confirmed' ? 'Accept' : 'Reject';
  if (!confirm(`Are you sure you want to ${actionText} this appointment?`)) return;

  try {
    const res = await authFetch(`/api/admin/appointments/${appointmentId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: newStatus })
    });

    const data = await res.json();

    if (res.ok && data.success && data.appointment) {
      showToast(`Appointment ${newStatus === 'Confirmed' ? 'Accepted' : 'Rejected'} successfully!`, newStatus === 'Confirmed' ? 'success' : 'info');

      // Update in local array
      const idx = allAppointments.findIndex(a => a._id === appointmentId);
      if (idx !== -1) {
        allAppointments[idx].status = newStatus;
      }

      // Re-render and refresh stats
      renderAppointmentsTable();
      loadStats();
    } else {
      showToast(data.message || 'Failed to update status.', 'error');
    }
  } catch (err) {
    console.error('Update status error:', err);
    showToast('Network error while updating appointment.', 'error');
  }
};

// HTML escaping helper
function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
