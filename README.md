# INTELLIX Association Event & Achievement Management Portal

A full-stack, mobile-first **Association Event & Achievement Management Portal** engineered for college department associations and optimized for **Render free tier deployment**.

---

## 🌟 Key Features

* **Monochrome Premium Design**: High-contrast black & white aesthetic with dark mode default (`#0a0a0a`), clean light mode toggle, ambient particle background, and full `prefers-reduced-motion` support.
* **Mobile-First & Touch-Optimized**: Bottom app bar on mobile, responsive sidebar on desktop, touch targets $\ge$ 44px.
* **Public Portal**:
  * **Homepage**: Dynamic real-time statistics (Events Conducted, Participants, Certificates, Key Achievements), featured upcoming events, recent accolades.
  * **Events Schedule**: Live filtering by Upcoming/Past, categories, seats remaining, and registration status.
  * **Event Details & In-Page Registration**: Direct registration with dynamic form questions, deadline checks, seat limits, and duplicate protection.
  * **Printable Registration Pass**: Displays unique Registration ID (e.g. `INTELLIX-CH-2026-0001`) with embedded QR pass.
  * **Achievements Showcase**: Podium finishes, hackathons, and medals.
  * **Event Gallery**: Filterable photo gallery with captions.
  * **Public Certificate Verification (`/verify`)**: Instant authenticity verification via Certificate ID or camera QR code lookup.
* **Administrative Subsystem (Role-Based Access Control)**:
  * **Student Coordinator (Main Admin)**: Primary operational control over events, forms, registrations, attendance, certificates, achievements, and sub-admin accounts.
  * **HOD (Supervisory Admin)**: View metrics, events, registrations, attendance, and certificates.
  * **Registration Admins**: Event-scoped access with granular permission flags (`View Reg`, `Manage Reg`, `Mark Attendance`, `Certificates`).
* **Dynamic Registration Form Builder**: Built directly inside the Create Event page. Add text, number, email, dropdown, radio, checkbox, and textarea fields with custom options and required toggles.
* **Touch-Friendly Attendance Marking**: 1-click `Present` / `Absent` toggle with instant synchronization.
* **Digital PDF Certificates (`pdfkit`)**: Generates vector PDF certificates with college header, signatures, unique Certificate ID, and embedded verification QR code without heavy headless browser requirements.

---

## 🛠️ Technology Stack

* **Frontend**: Vanilla HTML5, CSS3 (Design Tokens & CSS Variables), Vanilla JavaScript (No heavy frameworks).
* **Backend**: Node.js & Express.js.
* **Database**: MySQL 8.0+ (with connection pooling, parameterized queries, and automatic local fallback for immediate out-of-the-box execution).
* **Authentication**: Session-based auth (`express-session`), `bcryptjs` password hashing, RBAC middleware.
* **PDF & QR Engine**: `pdfkit` (pure Node.js vector PDF generator, 512MB RAM friendly) + `qrcode`.
* **File Uploads**: `multer` with file extension, MIME type, and size limits.

---

## 🚀 Running Locally

### 1. Prerequisites
* Node.js v18+ installed
* MySQL 8.0+ (Optional: if not configured, the app runs smoothly in local fallback mode)

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone <repo-url>
cd msd
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default `.env` values:
```ini
PORT=3000
NODE_ENV=development
SESSION_SECRET=intellix_association_portal_secret_key_2026

ASSOCIATION_NAME="INTELLIX Association"
ASSOCIATION_CODE="INTELLIX"
COLLEGE_NAME="Apex Institute of Engineering & Technology"

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=association_portal

INITIAL_ADMIN_USERNAME=coordinator
INITIAL_ADMIN_PASSWORD=admin123
```

### 4. Database Setup
To initialize the database and seed initial accounts and events:
```bash
npm run db:init
```

### 5. Start Application
```bash
npm start
```
Open your browser and visit:
* **Public Portal**: [http://localhost:3000](http://localhost:3000)
* **Admin Login**: [http://localhost:3000/login.html](http://localhost:3000/login.html)
  * Default Student Coordinator: `coordinator` / `admin123`
  * Default HOD: `hod_aiml` / `hodpassword123`
  * Default Registration Admin: `regadmin1` / `regpassword123`
* **Verify Certificate**: [http://localhost:3000/verify.html](http://localhost:3000/verify.html)

---

## ☁️ Deployment on Render (Free Tier)

This application is engineered specifically for Render's Web Service:

### Step 1: Provision a Free MySQL Database
Create a free database on any cloud MySQL provider:
* **TiDB Cloud** (Free Serverless Tier: 5GB storage, high performance MySQL compatible)
* **Aiven MySQL** (Free tier)
* **Clever Cloud** (Free MySQL addon)

Note your connection credentials: `Host`, `Port`, `User`, `Password`, and `Database Name`.

### Step 2: Push Code to GitHub
```bash
git init
git add .
git commit -m "Initial commit of Association Event Portal"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 3: Create Render Web Service
1. Log into [Render Dashboard](https://dashboard.render.com).
2. Click **New +** &rarr; **Web Service**.
3. Connect your GitHub repository.
4. Fill in configuration:
   * **Name**: `intellix-association-portal`
   * **Runtime**: `Node`
   * **Build Command**: `npm install`
   * **Start Command**: `node server.js`
   * **Instance Type**: `Free`

### Step 4: Add Environment Variables in Render
In the **Environment** tab, add:
* `PORT` = `10000` (Render handles this automatically via `process.env.PORT`)
* `NODE_ENV` = `production`
* `SESSION_SECRET` = `<generate-a-random-secure-string>`
* `DB_HOST` = `<your-cloud-mysql-host>`
* `DB_PORT` = `<your-cloud-mysql-port>`
* `DB_USER` = `<your-cloud-mysql-user>`
* `DB_PASSWORD` = `<your-cloud-mysql-password>`
* `DB_NAME` = `<your-cloud-mysql-database>`
* `INITIAL_ADMIN_USERNAME` = `coordinator`
* `INITIAL_ADMIN_PASSWORD` = `<your-strong-coordinator-password>`

### Step 5: Deploy
Click **Deploy Web Service**. Render will install packages, automatically initialize the database schema and seed the initial Student Coordinator on first boot, and provide your live HTTPS URL!

---

## 🔒 Security Measures

* Passwords hashed using `bcrypt` (10 rounds).
* Prepared statements (`?` parameters) across all database queries preventing SQL injection.
* Role-Based Access Control (RBAC) enforced on backend routes.
* Event-scoped isolation ensuring registration admins can only modify designated events.
* File upload extension, MIME type, and size validation (`multer`).
* Sensitive participant details (email, phone, register number) are never exposed on the public certificate verification page.

---

## 📜 License
MIT License. Developed for Department Student Associations.
