/**
 * Automated Fullstack E2E Verification Script
 * Tests:
 * 1. Static HTML pages check (/, /login.html, /signup.html, /dashboard.html, /payment.html, /admin.html)
 * 2. GET /api/services
 * 3. User signup & login
 * 4. Add pet profile
 * 5. Book appointment -> Initial status 'Pending', paymentStatus 'Unpaid'
 * 6. Process Dummy Payment Simulator -> paymentStatus 'Paid', status 'Pending'
 * 7. Non-admin access to admin routes -> 403 Forbidden
 * 8. Admin login with PetAdmin@gmail.com & PetAdmin@123 -> Sanjay (role: 'admin')
 * 9. Admin view incoming appointments
 * 10. Admin accept appointment -> status 'Confirmed'
 * 11. Admin reject appointment -> status 'Rejected'
 * 12. Admin stats endpoint
 */

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('--- STARTING FULLSTACK & ADMIN E2E VERIFICATION ---');
  let userToken = '';
  let adminToken = '';
  let petId = '';
  let appointmentId = '';
  let secondAppointmentId = '';

  const testEmail = `sarah.test.${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const testName = 'Sarah Jenkins';

  // 1. Static pages check
  for (const page of ['/', '/login.html', '/signup.html', '/dashboard.html', '/payment.html', '/admin.html']) {
    const res = await fetch(`${BASE_URL}${page}`);
    if (!res.ok) throw new Error(`Static page ${page} returned status ${res.status}`);
    console.log(` Page ${page} loaded successfully (Status: ${res.status})`);
  }

  // 2. Services list
  const servicesRes = await fetch(`${BASE_URL}/api/services`);
  const servicesData = await servicesRes.json();
  if (!servicesRes.ok || !servicesData.services || servicesData.services.length === 0) {
    throw new Error('Failed to fetch grooming services');
  }
  console.log(` Grooming services available: ${servicesData.services.length} services`);

  // 3. User Signup & Login
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: testName, email: testEmail, password: testPassword })
  });
  const signupData = await signupRes.json();
  if (!signupRes.ok || !signupData.token) {
    throw new Error(`Signup failed: ${JSON.stringify(signupData)}`);
  }
  userToken = signupData.token;
  console.log(` User signup succeeded! Name: "${signupData.user.name}", Token received.`);

  // 4. Add Pet
  const addPetRes = await fetch(`${BASE_URL}/api/pets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      name: 'Barnaby',
      type: 'Dog',
      breed: 'Golden Retriever',
      age: '2 years',
      specialNotes: 'Sensitive to loud dryers'
    })
  });
  const addPetData = await addPetRes.json();
  if (!addPetRes.ok || !addPetData.pet) {
    throw new Error(`Add pet failed: ${JSON.stringify(addPetData)}`);
  }
  petId = addPetData.pet._id;
  console.log(` Pet registered: "${addPetData.pet.name}" (ID: ${petId})`);

  // 5. Book Appointment 1 (Initial: Pending & Unpaid)
  const bookRes = await fetch(`${BASE_URL}/api/appointments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      petName: 'Barnaby',
      service: 'Royal Full Grooming',
      date: '2026-09-25',
      timeSlot: '10:00 AM',
      notes: 'Please be gentle with paws'
    })
  });
  const bookData = await bookRes.json();
  if (!bookRes.ok || !bookData.appointment) {
    throw new Error(`Booking appointment failed: ${JSON.stringify(bookData)}`);
  }
  appointmentId = bookData.appointment._id;
  if (bookData.appointment.status !== 'Pending' || bookData.appointment.paymentStatus !== 'Unpaid') {
    throw new Error(`Expected Pending & Unpaid, got: ${bookData.appointment.status} & ${bookData.appointment.paymentStatus}`);
  }
  console.log(` Appointment 1 booked: Status="${bookData.appointment.status}", PaymentStatus="${bookData.appointment.paymentStatus}"`);

  // 6. Complete Dummy Payment Simulator
  const payRes = await fetch(`${BASE_URL}/api/appointments/${appointmentId}/dummy-pay`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  const payData = await payRes.json();
  if (!payRes.ok || !payData.appointment || payData.appointment.paymentStatus !== 'Paid') {
    throw new Error(`Dummy payment failed: ${JSON.stringify(payData)}`);
  }
  if (payData.appointment.status !== 'Pending') {
    throw new Error(`Expected appointment to remain 'Pending' after payment until admin approval, got ${payData.appointment.status}`);
  }
  console.log(` Dummy payment processed: PaymentStatus="${payData.appointment.paymentStatus}", Status remains="${payData.appointment.status}"`);

  // Book Appointment 2 for testing rejection
  const bookRes2 = await fetch(`${BASE_URL}/api/appointments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify({
      petName: 'Barnaby',
      service: 'Signature Bath & Brush',
      date: '2026-09-28',
      timeSlot: '02:00 PM',
      notes: 'Test reject appointment'
    })
  });
  const bookData2 = await bookRes2.json();
  secondAppointmentId = bookData2.appointment._id;

  // 7. Security check: Regular user cannot access Admin routes
  const unauthorizedAdminRes = await fetch(`${BASE_URL}/api/admin/appointments`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  });
  if (unauthorizedAdminRes.status !== 403) {
    throw new Error(`Expected 403 Forbidden for regular user accessing admin routes, got ${unauthorizedAdminRes.status}`);
  }
  console.log(` Security verified: Regular user blocked from admin routes (403 Forbidden)`);

  // 8. Admin Login with PetAdmin@gmail.com / PetAdmin@123
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'PetAdmin@gmail.com', password: 'PetAdmin@123' })
  });
  const adminLoginData = await adminLoginRes.json();
  if (!adminLoginRes.ok || !adminLoginData.token) {
    throw new Error(`Admin login failed: ${JSON.stringify(adminLoginData)}`);
  }
  if (adminLoginData.user.name !== 'Sanjay' || adminLoginData.user.role !== 'admin') {
    throw new Error(`Expected Admin Sanjay with role 'admin', got: ${JSON.stringify(adminLoginData.user)}`);
  }
  adminToken = adminLoginData.token;
  console.log(` Admin authentication verified: Name="${adminLoginData.user.name}", Role="${adminLoginData.user.role}"`);

  // 9. Admin view all incoming appointments
  const adminApptsRes = await fetch(`${BASE_URL}/api/admin/appointments`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const adminApptsData = await adminApptsRes.json();
  if (!adminApptsRes.ok || !Array.isArray(adminApptsData.appointments)) {
    throw new Error('Admin failed to fetch appointments list');
  }
  console.log(` Admin retrieved incoming appointments: found ${adminApptsData.appointments.length} appointment(s)`);

  // 10. Admin accepts Appointment 1 -> Confirmed
  const acceptRes = await fetch(`${BASE_URL}/api/admin/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ status: 'Confirmed' })
  });
  const acceptData = await acceptRes.json();
  if (!acceptRes.ok || acceptData.appointment.status !== 'Confirmed') {
    throw new Error(`Admin accept failed: ${JSON.stringify(acceptData)}`);
  }
  console.log(` Admin ACCEPT verified: Appointment 1 status changed to "${acceptData.appointment.status}"`);

  // 11. Admin rejects Appointment 2 -> Rejected
  const rejectRes = await fetch(`${BASE_URL}/api/admin/appointments/${secondAppointmentId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({ status: 'Rejected' })
  });
  const rejectData = await rejectRes.json();
  if (!rejectRes.ok || rejectData.appointment.status !== 'Rejected') {
    throw new Error(`Admin reject failed: ${JSON.stringify(rejectData)}`);
  }
  console.log(` Admin REJECT verified: Appointment 2 status changed to "${rejectData.appointment.status}"`);

  // 12. Admin stats endpoint verification
  const statsRes = await fetch(`${BASE_URL}/api/admin/stats`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const statsData = await statsRes.json();
  if (!statsRes.ok || !statsData.stats) {
    throw new Error('Admin stats failed');
  }
  console.log(` Admin stats verified: Total=${statsData.stats.totalBookings}, Confirmed=${statsData.stats.confirmedCount}, Rejected=${statsData.stats.rejectedCount}, Revenue=$${statsData.stats.totalRevenue}`);

  console.log('\n🎉 ALL FULLSTACK, DUMMY PAYMENT, ADMIN (SANJAY), ACCEPT & REJECT TESTS PASSED PERFECTLY!');
}

runTests().catch(err => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
