/**
 * Dashboard Logic for Pawfect Glow Pet Grooming
 */

let currentUser = null;
let currentPets = [];
let currentAppointments = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Enforce route protection
  currentUser = await requireAuth();
  if (!currentUser) return;

  // Reveal protected dashboard UI immediately
  const dashboardBody = document.getElementById('dashboardBody');
  if (dashboardBody) {
    dashboardBody.style.display = 'flex';
  }

  // Populate personalized user greeting immediately
  const welcomeUserName = document.getElementById('welcomeUserName');
  const navUserName = document.getElementById('navUserName');
  if (welcomeUserName) welcomeUserName.textContent = currentUser.name || 'Pet Parent';
  if (navUserName) navUserName.textContent = currentUser.name || 'Pet Parent';

  // If logged in as admin (Sanjay), show Admin Portal link in navbar
  if (currentUser.role === 'admin') {
    const navActions = document.querySelector('.nav-actions');
    if (navActions && !document.getElementById('adminPortalLink')) {
      const adminLink = document.createElement('a');
      adminLink.id = 'adminPortalLink';
      adminLink.href = '/admin.html';
      adminLink.className = 'btn btn-primary btn-sm';
      adminLink.style.background = '#0d5c3a';
      adminLink.innerHTML = '🛡️ Admin Portal';
      navActions.insertBefore(adminLink, navActions.firstChild);
    }
  }

  // Set min date for booking to today
  const bookingDate = document.getElementById('bookingDate');
  if (bookingDate) {
    const today = new Date().toISOString().split('T')[0];
    bookingDate.min = today;
    bookingDate.value = today;
  }

  // Set up modal listeners and form handlers immediately
  setupModal();
  setupForms();

  // Load initial data in parallel
  loadPets();
  loadAppointments();

  // Mount Clerk UserButton if available in background (non-blocking)
  initClerk().then(clerk => {
    if (clerk && clerk.user && clerk.mountUserButton) {
      const userBtnEl = document.getElementById('clerkUserButton');
      if (userBtnEl) clerk.mountUserButton(userBtnEl);
    }
  }).catch(() => {});
});

// Load and Render Pets
async function loadPets() {
  try {
    const res = await authFetch('/api/pets');
    const data = await res.json();

    if (res.ok && data.success) {
      currentPets = data.pets || [];
      renderPets(currentPets);
      updatePetSelectOptions(currentPets);
      updateStats();
    }
  } catch (err) {
    console.error('Failed to load pets:', err);
    showToast('Could not load pets.', 'error');
  }
}

function renderPets(pets) {
  const container = document.getElementById('petsContainer');
  if (!container) return;

  if (pets.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <span class="empty-state-icon">🐾</span>
        <h3>No pets registered yet</h3>
        <p>Add your pet profile to easily book grooming appointments and track wellness.</p>
        <button class="btn btn-outline btn-sm" onclick="openModal()">+ Add Your Pet</button>
      </div>
    `;
    return;
  }

  const speciesIcons = {
    Dog: '🐶',
    Cat: '🐱',
    Rabbit: '🐰',
    Other: '🐾'
  };

  container.innerHTML = pets.map(pet => `
    <div class="pet-card">
      <div class="pet-card-top">
        <span class="pet-card-icon">${speciesIcons[pet.type] || '🐾'}</span>
        <button class="pet-delete-btn" onclick="deletePet('${pet._id}')" title="Remove Pet">✕</button>
      </div>
      <h4>${escapeHtml(pet.name)}</h4>
      <div class="pet-meta">
        <strong>${escapeHtml(pet.type)}</strong> ${pet.breed ? '• ' + escapeHtml(pet.breed) : ''}
      </div>
      ${pet.age ? `<div class="pet-meta" style="margin-top: 2px;">Age: ${escapeHtml(pet.age)}</div>` : ''}
      ${pet.specialNotes ? `<p style="font-size: 0.8rem; margin-top: 8px; color: var(--color-text-muted); font-style: italic;">“${escapeHtml(pet.specialNotes)}”</p>` : ''}
    </div>
  `).join('');
}

function updatePetSelectOptions(pets) {
  const select = document.getElementById('bookingPetSelect');
  if (!select) return;

  if (pets.length === 0) {
    select.innerHTML = '<option value="" disabled selected>Please add a pet first</option>';
    select.disabled = true;
    return;
  }

  select.disabled = false;
  select.innerHTML = `
    <option value="" disabled selected>Choose a pet...</option>
    ${pets.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)} (${p.type})</option>`).join('')}
  `;
}

// Load and Render Appointments
async function loadAppointments() {
  try {
    const res = await authFetch('/api/appointments');
    const data = await res.json();

    if (res.ok && data.success) {
      currentAppointments = data.appointments || [];
      renderAppointments(currentAppointments);
      updateStats();
    }
  } catch (err) {
    console.error('Failed to load appointments:', err);
  }
}

function renderAppointments(appointments) {
  const container = document.getElementById('appointmentsContainer');
  if (!container) return;

  if (appointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon">📅</span>
        <h3>No appointments scheduled</h3>
        <p>Pick a service and date above to book your furry friend's next spa day!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="appointments-table">
      <thead>
        <tr>
          <th>Pet</th>
          <th>Service</th>
          <th>Date & Time</th>
          <th>Price & Payment</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${appointments.map(app => `
          <tr>
            <td><strong>${escapeHtml(app.petName)}</strong></td>
            <td>${escapeHtml(app.service)}</td>
            <td>${escapeHtml(app.date)} <br><small style="color: var(--color-text-light);">${escapeHtml(app.timeSlot)}</small></td>
            <td>
              <strong>$${app.price || 45}</strong>
              ${app.paymentStatus === 'Paid' 
                ? '<span class="badge badge-paid" style="margin-left: 4px; font-size: 0.72rem;">✓ Paid</span>' 
                : (app.status !== 'Cancelled' && app.status !== 'Rejected' 
                    ? `<br><a href="/payment.html?appointmentId=${app._id}" class="btn btn-outline btn-sm" style="font-size: 0.72rem; padding: 2px 8px; margin-top: 4px; display: inline-block;">Pay Now 💳</a>` 
                    : '')}
            </td>
            <td>
              <span class="badge badge-${(app.status || 'Pending').toLowerCase()}">
                ${app.status === 'Confirmed' 
                  ? '● Confirmed' 
                  : (app.status === 'Rejected' 
                      ? '✕ Rejected' 
                      : (app.status === 'Cancelled' ? '✕ Cancelled' : '⏳ Pending Approval'))}
              </span>
            </td>
            <td>
              ${(app.status === 'Pending' || app.status === 'Confirmed') ? `
                <button class="btn btn-danger btn-sm" onclick="cancelAppointment('${app._id}')">
                  Cancel
                </button>
              ` : (app.status === 'Rejected' ? `
                <span style="font-size: 0.8rem; color: #e53e3e; font-weight: 500;">Rejected by Salon</span>
              ` : `
                <span style="font-size: 0.85rem; color: var(--color-text-light);">No actions</span>
              `)}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// Stats Updater
function updateStats() {
  const statsPets = document.getElementById('statsPetsCount');
  const statsApps = document.getElementById('statsAppointmentsCount');

  if (statsPets) statsPets.textContent = currentPets.length;
  if (statsApps) {
    const activeCount = currentAppointments.filter(a => a.status !== 'Cancelled').length;
    statsApps.textContent = activeCount;
  }
}

// Modal Setup
function setupModal() {
  const modal = document.getElementById('addPetModal');
  const openBtn = document.getElementById('openAddPetModalBtn');
  const closeBtn = document.getElementById('closeAddPetModalBtn');
  const cancelBtn = document.getElementById('cancelAddPetModalBtn');

  window.openModal = () => {
    if (modal) modal.classList.add('active');
    document.getElementById('petName')?.focus();
  };

  const closeModal = () => {
    if (modal) modal.classList.remove('active');
    document.getElementById('addPetForm')?.reset();
  };

  if (openBtn) openBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

  window.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// Forms Setup
function setupForms() {
  // Add Pet Form
  const addPetForm = document.getElementById('addPetForm');
  if (addPetForm) {
    addPetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('savePetBtn');
      saveBtn.disabled = true;

      const petData = {
        name: document.getElementById('petName').value.trim(),
        type: document.getElementById('petType').value,
        breed: document.getElementById('petBreed').value.trim(),
        age: document.getElementById('petAge').value.trim(),
        specialNotes: document.getElementById('petSpecialNotes').value.trim()
      };

      try {
        const res = await authFetch('/api/pets', {
          method: 'POST',
          body: JSON.stringify(petData)
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`${petData.name} added to your pet family! 🐾`, 'success');
          document.getElementById('addPetModal').classList.remove('active');
          addPetForm.reset();
          await loadPets();
        } else {
          showToast(data.message || 'Failed to add pet.', 'error');
        }
      } catch (err) {
        showToast('Network error while adding pet.', 'error');
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  // Book Appointment Form
  const bookForm = document.getElementById('bookAppointmentForm');
  if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (currentPets.length === 0) {
        showToast('Please add a pet first before booking!', 'error');
        openModal();
        return;
      }

      const submitBtn = document.getElementById('submitBookingBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = 'Scheduling...';

      const bookingData = {
        petName: document.getElementById('bookingPetSelect').value,
        service: document.getElementById('bookingServiceSelect').value,
        date: document.getElementById('bookingDate').value,
        timeSlot: document.getElementById('bookingTime').value,
        notes: document.getElementById('bookingNotes').value.trim()
      };

      try {
        const res = await authFetch('/api/appointments', {
          method: 'POST',
          body: JSON.stringify(bookingData)
        });

        const data = await res.json();
        if (res.ok && data.success && data.appointment) {
          showToast('Appointment reserved! Redirecting to Dummy Payment Mode... 💳', 'info');
          document.getElementById('bookingNotes').value = '';
          setTimeout(() => {
            window.location.href = `/payment.html?appointmentId=${data.appointment._id}`;
          }, 600);
          return;
        } else {
          showToast(data.message || 'Failed to book appointment.', 'error');
        }
      } catch (err) {
        showToast('Network error while booking appointment.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Schedule Appointment';
      }
    });
  }
}

// Delete Pet
window.deletePet = async function(petId) {
  if (!confirm('Are you sure you want to remove this pet profile?')) return;

  try {
    const res = await authFetch(`/api/pets/${petId}`, {
      method: 'DELETE'
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showToast('Pet profile removed.', 'info');
      await loadPets();
    } else {
      showToast(data.message || 'Failed to delete pet.', 'error');
    }
  } catch (err) {
    showToast('Network error while deleting pet.', 'error');
  }
};

// Cancel Appointment
window.cancelAppointment = async function(appointmentId) {
  if (!confirm('Are you sure you want to cancel this appointment?')) return;

  try {
    const res = await authFetch(`/api/appointments/${appointmentId}/cancel`, {
      method: 'PATCH'
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showToast('Appointment cancelled.', 'info');
      await loadAppointments();
    } else {
      showToast(data.message || 'Failed to cancel appointment.', 'error');
    }
  } catch (err) {
    showToast('Network error while cancelling appointment.', 'error');
  }
};

// Helper to escape HTML characters for safety
function escapeHtml(string) {
  if (!string) return '';
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
