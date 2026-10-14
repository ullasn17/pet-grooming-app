const dns = require('dns');
// Set public DNS to ensure robust SRV resolution on networks with restrictive local DNS
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // fallback silently if system restricts
}

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'pet_grooming_secret_jwt_key_2026';
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb+srv://gd6183514_db_user:fQBYJ5bb6lscouvj@login.7dppwwl.mongodb.net/pet_grooming?retryWrites=true&w=majority';
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || 'pk_test_c3RpbGwtc3dhbi05NTc0LmNsZXJrLmFjY291bnRzLmRldiQ';
const CLERK_FRONTEND_API = process.env.CLERK_FRONTEND_API || 'still-swan-9574.clerk.accounts.dev';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Clean URL routes
app.get('/sso-callback', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'sso-callback.html'));
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'payment.html'));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Clerk JWKS client for verifying RS256 session tokens
const clerkJwks = jwksClient({
  jwksUri: `https://${CLERK_FRONTEND_API}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000 // 10 mins
});

function getClerkKey(header, callback) {
  clerkJwks.getSigningKey(header.kid, function (err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

// --- SCHEMAS & MODELS ---
const userSchema = new mongoose.Schema({
  clerkId: { type: String, sparse: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  password: { type: String, required: false }, // optional for Clerk / Google SSO
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now }
});

const petSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['Dog', 'Cat', 'Rabbit', 'Other'], default: 'Dog' },
  breed: { type: String, default: '' },
  age: { type: String, default: '' },
  specialNotes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

const appointmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  petName: { type: String, required: true },
  service: { type: String, required: true },
  price: { type: Number, default: 45 },
  date: { type: String, required: true },
  timeSlot: { type: String, required: true },
  notes: { type: String, default: '' },
  paymentStatus: { type: String, enum: ['Unpaid', 'Paid'], default: 'Unpaid' },
  status: { type: String, enum: ['Pending', 'Confirmed', 'Rejected', 'Cancelled', 'Completed'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Pet = mongoose.model('Pet', petSchema);
const Appointment = mongoose.model('Appointment', appointmentSchema);

// --- SEED ADMIN ACCOUNT (Sanjay - PetAdmin@gmail.com) ---
async function seedAdminUser() {
  try {
    const adminEmail = 'petadmin@gmail.com';
    const adminPass = 'PetAdmin@123';
    const adminName = 'Sanjay';

    let admin = await User.findOne({ email: adminEmail });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(adminPass, salt);

    if (!admin) {
      admin = new User({
        name: adminName,
        email: adminEmail,
        password: hashedPassword,
        role: 'admin'
      });
      await admin.save();
      console.log('🛡️ Admin user seeded successfully: PetAdmin@gmail.com (Sanjay)');
    } else {
      // Ensure role is admin, name is Sanjay, and password is set correctly
      let changed = false;
      if (admin.role !== 'admin') { admin.role = 'admin'; changed = true; }
      if (admin.name !== adminName) { admin.name = adminName; changed = true; }
      const passwordMatch = admin.password ? await bcrypt.compare(adminPass, admin.password) : false;
      if (!passwordMatch) {
        admin.password = hashedPassword;
        changed = true;
      }
      if (changed) {
        await admin.save();
        console.log('🛡️ Admin user updated successfully: PetAdmin@gmail.com (Sanjay)');
      } else {
        console.log('🛡️ Admin user verified: PetAdmin@gmail.com (Sanjay)');
      }
    }
  } catch (err) {
    console.error('Failed to seed admin user:', err.message);
  }
}

// Database Connection
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log(' Connected to MongoDB Atlas successfully!');
    seedAdminUser();
  })
  .catch((err) => {
    console.error(' MongoDB connection error:', err.message);
  });

// --- AUTH MIDDLEWARE (Supports Clerk RS256 & Local HS256) ---
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    const decodedHeader = jwt.decode(token, { complete: true });

    if (!decodedHeader) {
      return res.status(401).json({ success: false, message: 'Invalid or malformed token.' });
    }

    // Clerk RS256 token verification
    if (decodedHeader.header.alg === 'RS256') {
      jwt.verify(token, getClerkKey, { algorithms: ['RS256'] }, async (err, decoded) => {
        if (err) {
          return res.status(401).json({ success: false, message: 'Invalid or expired Clerk session.' });
        }

        const clerkId = decoded.sub;
        let user = await User.findOne({ clerkId });

        // If user not in MongoDB yet, sync from headers or token claims
        if (!user) {
          const email = (req.headers['x-user-email'] || decoded.email || `${clerkId}@clerk.user`).toLowerCase().trim();
          const name = (req.headers['x-user-name'] || decoded.name || 'Pet Parent').trim();

          user = await User.findOne({ email });
          if (user) {
            user.clerkId = clerkId;
            if (!user.name || user.name === 'Pet Parent') user.name = name;
            await user.save();
          } else {
            user = new User({
              clerkId,
              name,
              email,
              createdAt: new Date()
            });
            await user.save();
          }
        }

        req.user = user;
        req.clerkUser = decoded;
        next();
      });
    } else {
      // Local HS256 token fallback
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
          return res.status(401).json({ success: false, message: 'User session expired or not found.' });
        }
        req.user = user;
        next();
      } catch (e) {
        return res.status(401).json({ success: false, message: 'Invalid token.' });
      }
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ success: false, message: 'Authentication failed.' });
  }
};

// --- ADMIN MIDDLEWARE ---
const adminMiddleware = async (req, res, next) => {
  try {
    authMiddleware(req, res, () => {
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access Denied: Administrator privileges required.'
        });
      }
      next();
    });
  } catch (err) {
    return res.status(403).json({ success: false, message: 'Admin verification failed.' });
  }
};

// --- SERVICES DATA ---
const GROOMING_SERVICES = [
  {
    id: 'full-grooming',
    title: 'Royal Full Grooming',
    category: 'Full Spa',
    price: 75,
    duration: '90 mins',
    description: 'Nourishing bath, custom breed haircut, styling, ear cleaning, paw pad balm, and nail clipping.',
    icon: '✂️'
  },
  {
    id: 'bath-brush',
    title: 'Signature Bath & Brush',
    category: 'Essential Care',
    price: 45,
    duration: '45 mins',
    description: 'Deep botanical hydro-bath, blow out, full coat brush out, nail trim, and organic spritz.',
    icon: '🛁'
  },
  {
    id: 'deshedding',
    title: 'De-Shedding Spa',
    category: 'Specialty',
    price: 60,
    duration: '60 mins',
    description: 'Undercoat blowout, specialized furminator rake, anti-shed shampoo, and gloss shine treatment.',
    icon: '✨'
  },
  {
    id: 'puppy-spa',
    title: 'Puppy & Kitten First Groom',
    category: 'Gentle Care',
    price: 35,
    duration: '35 mins',
    description: 'Gentle positive-reinforcement bath, sanitary trim, nail buffing, and warm soothing cuddle session.',
    icon: '🐾'
  },
  {
    id: 'teeth-breath',
    title: 'Dental & Breath Refresh',
    category: 'Hygiene',
    price: 22,
    duration: '20 mins',
    description: 'Ultrasonic enzymatic toothbrushing, gum massaging gel, and fresh minty breath spray.',
    icon: '🦷'
  },
  {
    id: 'paw-care',
    title: 'Nail File & Paw Rescue',
    category: 'Hygiene',
    price: 18,
    duration: '20 mins',
    description: 'Precision nail clipping and electric buffing with an organic shea butter paw wax treatment.',
    icon: '🐾'
  }
];

// --- PUBLIC CONFIG ROUTE ---
app.get('/api/config', (req, res) => {
  res.json({
    clerkPublishableKey: CLERK_PUBLISHABLE_KEY,
    clerkFrontendApi: CLERK_FRONTEND_API
  });
});

// --- CLERK USER SYNC ROUTE ---
// --- PUBLIC SSO SYNC ROUTE (Issues local JWT on Google sign-in) ---
app.post('/api/auth/sso-sync', async (req, res) => {
  try {
    const { clerkId, name, email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required for SSO sync.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = (name || 'Pet Parent').trim();

    let user = null;
    if (clerkId) {
      user = await User.findOne({ clerkId });
    }
    if (!user) {
      user = await User.findOne({ email: cleanEmail });
    }

    if (user) {
      if (clerkId && !user.clerkId) user.clerkId = clerkId;
      if (cleanName && (!user.name || user.name === 'Pet Parent')) user.name = cleanName;
      await user.save();
    } else {
      user = new User({
        clerkId: clerkId || undefined,
        name: cleanName,
        email: cleanEmail,
        createdAt: new Date()
      });
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user._id,
        clerkId: user.clerkId,
        name: user.name,
        email: user.email,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    console.error('SSO sync error:', error);
    return res.status(500).json({ success: false, message: 'Failed to sync SSO account.' });
  }
});

// --- LEGACY/DIRECT AUTH API ROUTES ---

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields: name, email, password.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists. Please log in.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      role: 'user'
    });

    await newUser.save();

    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, name: newUser.name, role: newUser.role || 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role || 'user'
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ success: false, message: 'Server error while creating your account.' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide both email and password.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user || !user.password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(200).json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role || 'user'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
});

// Verify Auth Token & Get Profile
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        clerkId: req.user.clerkId,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role || 'user',
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve profile.' });
  }
});

// --- SERVICES ROUTE ---
app.get('/api/services', (req, res) => {
  res.json({ success: true, services: GROOMING_SERVICES });
});

// --- PETS API ROUTES ---

// Get user's pets
app.get('/api/pets', authMiddleware, async (req, res) => {
  try {
    const pets = await Pet.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, pets });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch pets.' });
  }
});

// Add a pet
app.post('/api/pets', authMiddleware, async (req, res) => {
  try {
    const { name, type, breed, age, specialNotes } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Pet name is required.' });
    }

    const newPet = new Pet({
      userId: req.user._id,
      name: name.trim(),
      type: type || 'Dog',
      breed: breed ? breed.trim() : '',
      age: age ? age.trim() : '',
      specialNotes: specialNotes ? specialNotes.trim() : ''
    });

    await newPet.save();
    return res.status(201).json({ success: true, message: 'Pet added successfully!', pet: newPet });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to add pet.' });
  }
});

// Delete a pet
app.delete('/api/pets/:id', authMiddleware, async (req, res) => {
  try {
    const deletedPet = await Pet.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!deletedPet) {
      return res.status(404).json({ success: false, message: 'Pet not found or unauthorized.' });
    }
    return res.json({ success: true, message: 'Pet removed successfully.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to remove pet.' });
  }
});

// --- APPOINTMENTS API ROUTES ---

// Get user's appointments
app.get('/api/appointments', authMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, appointments });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to fetch appointments.' });
  }
});

// Book an appointment (Initial status: Pending, paymentStatus: Unpaid)
app.post('/api/appointments', authMiddleware, async (req, res) => {
  try {
    const { petName, service, date, timeSlot, notes } = req.body;

    if (!petName || !service || !date || !timeSlot) {
      return res.status(400).json({
        success: false,
        message: 'Please provide pet name, grooming service, date, and time slot.'
      });
    }

    // Match service price
    const matchedService = GROOMING_SERVICES.find(s => s.title === service || s.id === service);
    const price = matchedService ? matchedService.price : 45;

    const newAppointment = new Appointment({
      userId: req.user._id,
      petName: petName.trim(),
      service: matchedService ? matchedService.title : service,
      price,
      date,
      timeSlot,
      notes: notes ? notes.trim() : '',
      paymentStatus: 'Unpaid',
      status: 'Pending'
    });

    await newAppointment.save();
    return res.status(201).json({
      success: true,
      message: 'Appointment booked! Please complete payment to confirm slot request.',
      appointment: newAppointment
    });
  } catch (error) {
    console.error('Booking error:', error);
    return res.status(500).json({ success: false, message: 'Failed to book appointment.' });
  }
});

// Get single appointment details (for Payment gateway & confirmation)
app.get('/api/appointments/:id', authMiddleware, async (req, res) => {
  try {
    const query = req.user.role === 'admin'
      ? { _id: req.params.id }
      : { _id: req.params.id, userId: req.user._id };

    const appointment = await Appointment.findOne(query).populate('userId', 'name email');
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    return res.json({ success: true, appointment });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to retrieve appointment details.' });
  }
});

// Process Dummy Payment Simulator
app.post('/api/appointments/:id/dummy-pay', authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ _id: req.params.id, userId: req.user._id });
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized.' });
    }

    appointment.paymentStatus = 'Paid';
    appointment.status = 'Pending'; // Status displays pending until Sanjay (Admin) accepts or rejects
    await appointment.save();

    return res.json({
      success: true,
      message: 'Dummy payment authorized! Status is Pending until salon admin (Sanjay) accepts.',
      appointment
    });
  } catch (error) {
    console.error('Dummy payment error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process payment.' });
  }
});

// Cancel an appointment
app.patch('/api/appointments/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status: 'Cancelled' },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found or unauthorized.' });
    }

    return res.json({ success: true, message: 'Appointment cancelled.', appointment });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to cancel appointment.' });
  }
});

// --- ADMIN API ROUTES (Sanjay - PetAdmin@gmail.com) ---

// Get all appointments across all users
app.get('/api/admin/appointments', adminMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    return res.json({ success: true, appointments });
  } catch (error) {
    console.error('Admin fetch appointments error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch admin appointments.' });
  }
});

// Update appointment status (Accept -> Confirmed, Reject -> Rejected)
app.patch('/api/admin/appointments/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['Confirmed', 'Rejected', 'Pending', 'Cancelled', 'Completed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid appointment status.' });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('userId', 'name email');

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    return res.json({
      success: true,
      message: `Appointment successfully updated to "${status}".`,
      appointment
    });
  } catch (error) {
    console.error('Admin update status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update appointment status.' });
  }
});

// Admin stats summary
app.get('/api/admin/stats', adminMiddleware, async (req, res) => {
  try {
    const totalBookings = await Appointment.countDocuments();
    const pendingCount = await Appointment.countDocuments({ status: 'Pending' });
    const confirmedCount = await Appointment.countDocuments({ status: 'Confirmed' });
    const rejectedCount = await Appointment.countDocuments({ status: 'Rejected' });
    const cancelledCount = await Appointment.countDocuments({ status: 'Cancelled' });

    const paidAppointments = await Appointment.find({ paymentStatus: 'Paid' });
    const totalRevenue = paidAppointments.reduce((sum, item) => sum + (item.price || 0), 0);

    return res.json({
      success: true,
      stats: {
        totalBookings,
        pendingCount,
        confirmedCount,
        rejectedCount,
        cancelledCount,
        totalRevenue
      }
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch admin statistics.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🐾 Pet Grooming Server running at http://localhost:${PORT}`);
  console.log(`🔑 Clerk Auth enabled with Publishable Key: ${CLERK_PUBLISHABLE_KEY.substring(0, 12)}...`);
  console.log(`🛡️ Admin Portal available at http://localhost:${PORT}/admin`);
});
