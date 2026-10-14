# 🐾 Pet Grooming Booking & Management Platform

A modern, fullstack web application for pet grooming salon management, appointment booking, and customer administration. Built with **Node.js**, **Express**, **MongoDB (Mongoose)**, and a responsive **Vanilla JavaScript / HTML5 / CSS3** frontend with glassmorphism UI.

---

## 🌟 Features

### 👤 Customer Experience
- **User Authentication**: Secure signup and login with hashed passwords (bcrypt), JWT sessions, and optional **Clerk SSO / Google Sign-In**.
- **Pet Profiles**: Register and manage multiple pets (type, breed, age, special care notes).
- **Interactive Appointment Booking**:
  - Browse grooming services and pricing (Bath & Brush, Full Grooming, Teeth Cleaning, etc.).
  - Choose pet, service package, preferred appointment date, and time slot.
  - Track live appointment status (`Pending`, `Confirmed`, `Rejected`, `Completed`).
- **Payment Gateway Simulator**: Built-in checkout simulator to process payment cards safely, transitioning booking to `Paid` status.

### 🛡️ Admin Dashboard (`/admin`)
- **Protected Access**: Role-based access control (RBAC) ensuring only administrative users can access admin API routes and views.
- **Configurable Administrator**: Auto-seeded or verified via secure environment variables (`ADMIN_EMAIL` and `ADMIN_PASSWORD`).
- **Business Analytics**: High-level overview of total bookings, pending approvals, confirmed appointments, and total revenue.
- **Booking Management**: Accept or reject incoming customer bookings with real-time status updates.

---

## 🛠️ Tech Stack

- **Backend**: [Node.js](https://nodejs.org/), [Express 4](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) via [Mongoose ODM](https://mongoosejs.com/)
- **Security & Auth**: [bcryptjs](https://github.com/dcodeIO/bcrypt.js), [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken), [jwks-rsa](https://github.com/auth0/node-jwks-rsa)
- **Frontend**: Responsive HTML5, CSS3 (Modern Glassmorphism & Micro-animations), Vanilla JavaScript (ES6+)
- **Testing**: End-to-End automated test suite (`test_e2e.js`)

---

## 📁 Project Structure

```text
pet/
├── .env.example          # Environment variable template
├── .gitignore            # Git ignore configuration
├── package.json          # Dependencies and scripts
├── server.js             # Express application & API routes
├── test_e2e.js           # Automated end-to-end test suite
├── public/               # Client-side static assets
│   ├── index.html        # Landing page
│   ├── login.html        # Customer & Admin login
│   ├── signup.html       # Customer registration
│   ├── dashboard.html    # User dashboard & booking interface
│   ├── payment.html      # Payment processing simulator
│   ├── admin.html        # Admin management dashboard
│   ├── sso-callback.html # Clerk SSO redirect handler
│   ├── css/
│   │   └── style.css     # Styling & theme definitions
│   └── js/
│       ├── auth.js       # Auth state & token handling
│       ├── dashboard.js  # Customer booking logic
│       └── admin.js      # Admin management logic
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/)
- [MongoDB](https://www.mongodb.com/) (Local instance or MongoDB Atlas cluster)

### 1. Clone the Repository
```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and fill in your values:
```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/pet_grooming?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret_key_here

# Administrator Credentials
ADMIN_NAME=Admin
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_secure_admin_password_here

# Optional: Clerk SSO
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
CLERK_FRONTEND_API=your-app.clerk.accounts.dev
```

> ⚠️ **Security Warning**: Never commit your `.env` file to GitHub or any public repository. It is already included in `.gitignore`.

### 4. Run the Application

#### Development Mode (Auto-reload):
```bash
npm run dev
```

#### Production Mode:
```bash
npm start
```

Once running, visit:
- **Public Site**: [http://localhost:3000](http://localhost:3000)
- **Login / Signup**: [http://localhost:3000/login](http://localhost:3000/login)
- **Admin Portal**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🔑 Administrator Configuration

Administrative credentials are configured securely via your local `.env` file:
- `ADMIN_NAME`: Display name for the salon admin (e.g., `Salon Manager`).
- `ADMIN_EMAIL`: Administrator login email address.
- `ADMIN_PASSWORD`: Administrator password.

When the server starts, it automatically creates or syncs the administrator user according to these environment variables.

---

## 🧪 Running Automated Tests

Run the automated fullstack E2E verification test suite:
```bash
npm test
```
The test verifies:
- All static HTML routes and assets
- Services catalog endpoint
- User signup, login, and JWT generation
- Pet profile creation
- Appointment booking lifecycle (`Pending` -> `Paid` -> `Confirmed` / `Rejected`)
- Dummy payment processing simulation
- Role-based route protection (non-admin 403 verification)
- Admin analytics and appointment review workflows

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).
