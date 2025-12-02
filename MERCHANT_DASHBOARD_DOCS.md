# PolyGuard B2B Merchant Dashboard - Complete System Documentation

## 🎯 Overview

A complete B2B SaaS platform for merchant authentication and verification using QR codes and SHA-256 hash verification.

## 📁 Project Structure

```
hackathon1/
├── database-schema.sql          # Complete PostgreSQL schema
├── migrate-merchant-db.js       # Database migration script
├── server-merchant.js           # Main API server with JWT auth
├── demo.html                    # Login/Registration page
├── merchant-dashboard.html      # Merchant dashboard UI
├── admin-dashboard.html         # Admin dashboard UI
├── verified-template.html       # QR code landing page template
└── main.css                     # Shared styles
```

## 🗄️ Database Schema

### Tables Created

1. **merchants** - Merchant account information
   - Authentication (PBKDF2 hashed passwords)
   - Company details (UEN, business type, etc.)
   - Approval status (pending/approved/rejected/suspended)
   
2. **merchant_qr_codes** - QR code storage
   - SVG QR code data
   - URLs linking to verification pages
   - Scan tracking
   
3. **merchant_hashes** - SHA-256 hashes for SMS verification
   - Original messages
   - Generated hashes
   - Verification tracking
   
4. **transaction_logs** - All platform activity
   - QR scans
   - Hash verifications
   - IP addresses and user agents

## 🔐 Security Implementation

### Password Hashing
- **Algorithm**: PBKDF2 with SHA-256
- **Iterations**: 100,000
- **Salt**: 32-byte random salt per user
- **Output**: 64-byte hex string

### Message Hashing
- **Algorithm**: SHA-256
- **Use case**: SMS authenticity verification

### Authentication
- **Method**: JWT (JSON Web Tokens)
- **Expiry**: 24 hours
- **Storage**: localStorage (client-side)
- **Header**: `Authorization: Bearer <token>`

## 🚀 API Endpoints

### Authentication Endpoints

#### POST /auth/register
Register new merchant account

**Request:**
```json
{
  "user_name": "string",
  "password": "string",
  "company_uen": "string",
  "company_name": "string",
  "business_type": "string",
  "company_website": "string (optional)",
  "job_position": "string",
  "phone_number": "string",
  "email": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful! Your account is pending approval.",
  "merchant": {
    "id": 1,
    "user_name": "merchantuser",
    "company_name": "Example Company",
    "status": "pending",
    "created_at": "2025-12-03T..."
  }
}
```

#### POST /auth/login
Login to merchant account

**Request:**
```json
{
  "user_name": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "merchant": {
    "id": 1,
    "user_name": "merchantuser",
    "company_name": "Example Company",
    "status": "approved",
    "is_admin": false
  }
}
```

### Merchant Endpoints (Require Authentication)

#### POST /merchants/create-qr
Create new QR code

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "label": "Main Payment QR",
  "description": "For customer payments"
}
```

**Response:**
```json
{
  "success": true,
  "qr_code": {
    "id": 1,
    "svg": "<svg>...</svg>",
    "url": "https://polyguard.netlify.app/verified-example-company",
    "label": "Main Payment QR",
    "created_at": "2025-12-03T..."
  }
}
```

#### GET /merchants/list-qr
List all QR codes for authenticated merchant

**Response:**
```json
{
  "success": true,
  "qr_codes": [
    {
      "id": 1,
      "qr_url": "https://polyguard.netlify.app/verified-...",
      "label": "Main Payment QR",
      "description": "For customer payments",
      "is_active": true,
      "scan_count": 15,
      "last_scanned": "2025-12-03T...",
      "created_at": "2025-12-03T..."
    }
  ]
}
```

#### GET /merchants/qr/:id
Get QR code SVG image

**Response:** SVG image (Content-Type: image/svg+xml)

#### POST /merchants/regenerate-qr/:id
Regenerate QR code (same URL, new SVG)

**Response:**
```json
{
  "success": true,
  "message": "QR code regenerated successfully",
  "svg": "<svg>...</svg>"
}
```

#### POST /merchants/create-hash
Create SHA-256 hash for message authentication

**Request:**
```json
{
  "message": "Your verification code is 123456",
  "purpose": "Account verification SMS"
}
```

**Response:**
```json
{
  "success": true,
  "hash": {
    "id": 1,
    "message_hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
    "original_message": "Your verification code is 123456",
    "purpose": "Account verification SMS",
    "created_at": "2025-12-03T..."
  }
}
```

#### GET /merchants/list-hashes
List all hashes for authenticated merchant

**Response:**
```json
{
  "success": true,
  "hashes": [
    {
      "id": 1,
      "original_message": "Your verification code is 123456",
      "message_hash": "a665a45920422f9d...",
      "purpose": "Account verification SMS",
      "is_verified": true,
      "verification_count": 3,
      "created_at": "2025-12-03T..."
    }
  ]
}
```

#### GET /merchants/recent-transactions
Get recent transaction logs (default: 50)

**Query params:** `?limit=100`

**Response:**
```json
{
  "success": true,
  "transactions": [
    {
      "id": 1,
      "transaction_type": "qr_scan",
      "scanned_hash": null,
      "user_info": {},
      "ip_address": "192.168.1.1",
      "verification_result": "success",
      "result_message": "QR code scanned",
      "created_at": "2025-12-03T..."
    }
  ]
}
```

### Admin Endpoints (Require Admin Authentication)

#### GET /admin/merchants
Get all merchants with usage statistics

**Response:**
```json
{
  "success": true,
  "merchants": [
    {
      "id": 2,
      "user_name": "merchant1",
      "company_name": "Example Company",
      "status": "approved",
      "total_qr_codes": 5,
      "total_hashes": 12,
      "total_qr_scans": 45,
      "total_scan_transactions": 45,
      "total_hash_verifications": 23,
      "created_at": "2025-12-03T...",
      "last_login": "2025-12-03T..."
    }
  ]
}
```

#### POST /admin/approve/:merchantId
Approve pending merchant

**Response:**
```json
{
  "success": true,
  "message": "Merchant approved successfully",
  "merchant": {
    "id": 2,
    "user_name": "merchant1",
    "company_name": "Example Company",
    "status": "approved"
  }
}
```

#### POST /admin/reject/:merchantId
Reject pending merchant

**Request:**
```json
{
  "reason": "Invalid business documentation"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Merchant rejected",
  "merchant": {
    "id": 2,
    "user_name": "merchant1",
    "company_name": "Example Company",
    "status": "rejected"
  }
}
```

### Public Endpoints (No Authentication Required)

#### POST /public/verify-hash
Verify SHA-256 hash from customer

**Request:**
```json
{
  "hash": "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3"
}
```

**Response (Success):**
```json
{
  "verified": true,
  "merchant": {
    "company_name": "Example Company",
    "company_uen": "ABC123"
  },
  "message": "Your verification code is 123456",
  "purpose": "Account verification SMS",
  "created_at": "2025-12-03T..."
}
```

**Response (Not Found):**
```json
{
  "verified": false,
  "error": "Hash not found or merchant not approved"
}
```

#### POST /public/log-qr-scan
Log QR code scan (called automatically by verification page)

**Request:**
```json
{
  "qr_url": "https://polyguard.netlify.app/verified-example-company"
}
```

**Response:**
```json
{
  "success": true
}
```

## 🎨 Frontend Pages

### 1. demo.html - Login/Registration
- User login with JWT authentication
- New merchant registration
- Redirects to merchant or admin dashboard based on role
- All fields required per specifications

### 2. merchant-dashboard.html - Merchant Dashboard

**Features:**
- **Overview Tab**
  - Statistics cards (QR codes, hashes, scans, verifications)
  - Recent activity table
  - Pending approval notification

- **QR Codes Tab**
  - Create new QR codes with label/description
  - View generated QR code with SVG display
  - List all created QR codes
  - View and regenerate existing QR codes
  - Track scan counts

- **Hash Generator Tab**
  - Create SHA-256 hashes for messages
  - Display generated hash
  - Copy hash to clipboard
  - List all created hashes
  - Track verification counts

- **Transactions Tab**
  - View all transaction logs
  - Filter by type (QR scan, hash verification, etc.)
  - IP address tracking
  - Timestamp information

- **Settings Tab**
  - View company information
  - Account settings

### 3. admin-dashboard.html - Admin Dashboard

**Features:**
- Platform statistics overview
- All merchants list with usage stats
- Pending approvals management
- Approve/reject merchant accounts
- View merchant activity metrics

### 4. verified-template.html - QR Code Landing Page

**Features:**
- Verified merchant badge
- Company name display
- Quick Transfer card with bank details
  - Bank name
  - Account number
  - Account name
- Copy account number to clipboard
- Security reminder
- Automatic scan logging to backend

## 🔧 Setup Instructions

### 1. Install Dependencies
```bash
npm install express pg qrcode jsonwebtoken
```

### 2. Run Database Migration
```bash
node migrate-merchant-db.js
```

This creates all required tables and the admin account:
- Username: `admin`
- Password: `Admin123!`

### 3. Start Server
```bash
node server-merchant.js
```

Server runs on: `http://localhost:3000`

### 4. Access Dashboards

**Admin Login:**
- URL: `http://localhost:3000/demo.html`
- Username: `admin`
- Password: `Admin123!`
- Redirects to: `admin-dashboard.html`

**Merchant Registration:**
1. Go to `http://localhost:3000/demo.html`
2. Click "Register"
3. Fill all required fields
4. Account status: "Pending"
5. Admin must approve before full access

**Merchant Login (After Approval):**
- Login with credentials
- Redirects to: `merchant-dashboard.html`
- Full access to QR codes, hashes, transactions

## 📊 User Flow

### Merchant Registration & Approval Flow
```
1. Merchant registers → Status: "Pending"
2. Admin reviews in admin dashboard
3. Admin approves/rejects
4. If approved → Merchant can create QR codes & hashes
5. If rejected → Merchant sees rejection reason
```

### QR Code Usage Flow
```
1. Merchant creates QR code in dashboard
2. QR code points to: verified-{company-name}.html
3. Customer scans QR code
4. Verification page displays:
   - Verified badge
   - Company name
   - Bank transfer details
5. Customer can copy account number
6. Scan is logged in transaction_logs
```

### Hash Verification Flow
```
1. Merchant creates hash for outbound message
2. Merchant includes hash in SMS/email
3. Customer receives message with hash
4. Customer goes to public verification page
5. Customer enters hash
6. System verifies against database
7. If valid → Shows merchant info and original message
8. Verification is logged in transaction_logs
```

## 🔒 Security Features

1. **PBKDF2 Password Hashing** (100,000 iterations)
2. **JWT Authentication** (24-hour expiry)
3. **Role-based Access Control** (Admin vs Merchant)
4. **Status-based Permissions** (Approved merchants only)
5. **SQL Injection Protection** (Parameterized queries)
6. **Transaction Logging** (All activities tracked)

## 📈 Analytics & Monitoring

The platform tracks:
- Total QR codes created per merchant
- Total hashes generated per merchant
- QR scan counts and timestamps
- Hash verification counts
- IP addresses of scanners
- User agents
- Verification success/failure rates

All data available through:
- Merchant dashboard (own data)
- Admin dashboard (all merchants)
- Transaction logs API

## 🌐 Deployment to Netlify

### Files to Deploy:
- All HTML files (demo.html, merchant-dashboard.html, admin-dashboard.html, verified-template.html)
- main.css
- Any additional static assets

### Backend Deployment:
Deploy `server-merchant.js` to a Node.js hosting service (Render, Heroku, Railway, etc.)

### Environment Variables:
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key-here
PORT=3000
```

## 📝 Next Steps / Enhancements

1. **Email Notifications**
   - Notify merchants on approval/rejection
   - Send verification codes via email

2. **Two-Factor Authentication**
   - Add 2FA for admin accounts

3. **Rate Limiting**
   - Prevent abuse of public endpoints

4. **Analytics Dashboard**
   - Charts and graphs for usage trends
   - Export reports to CSV/PDF

5. **Mobile App**
   - Native mobile app for merchants
   - QR code scanner integration

6. **Webhook Integration**
   - Real-time notifications for scans
   - Third-party integrations

## 🐛 Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL is correct
- Check Neon console for connection limits
- Ensure SSL settings are correct

### JWT Token Errors
- Clear localStorage and login again
- Check token expiry (24 hours)
- Verify JWT_SECRET matches server

### QR Codes Not Displaying
- Check merchant approval status
- Verify QR code URL format
- Check browser console for errors

## 📞 Support

For issues or questions:
- Check transaction logs for errors
- Review server console output
- Verify database tables created correctly
- Ensure all npm packages installed

---

**Built with:**
- Express.js
- PostgreSQL (Neon)
- JWT Authentication
- QRCode.js
- Vanilla JavaScript

**Security:**
- PBKDF2 password hashing
- SHA-256 message hashing
- JWT token authentication
- Parameterized SQL queries
