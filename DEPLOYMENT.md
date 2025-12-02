# PolyGuard Deployment Guide

## Architecture

PolyGuard uses a **split deployment** architecture:
- **Frontend**: Netlify (static hosting)
- **Backend**: Render/Railway/Heroku (Node.js server)

## Frontend Deployment (Netlify)

The frontend (demo.html, merchant-dashboard.html, admin-dashboard.html, payment-page.html, verify-hash.html) is deployed to Netlify.

### Steps:
1. Push code to GitHub
2. Netlify automatically deploys from `main` branch
3. Site URL: https://polyguard.netlify.app

### Configuration:
- Build command: `npm install`
- Publish directory: `.` (root)
- Redirects: All routes → `/demo.html`

## Backend Deployment (Render.com - RECOMMENDED)

The backend (server.js) needs to be deployed to a Node.js hosting platform.

### Deploy to Render:

1. Go to https://render.com
2. Create new **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name**: polyguard-api
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Port**: 3000

5. Add Environment Variables:
   ```
   DATABASE_URL=postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   JWT_SECRET=polyguard-production-secret-key-change-this
   PORT=3000
   ```

6. Deploy!

Your API will be at: `https://polyguard-api.onrender.com`

### Alternative: Railway

1. Go to https://railway.app
2. New Project → Deploy from GitHub
3. Add environment variables (same as above)
4. Deploy

## Update Frontend API URLs

After deploying the backend, update all frontend files to use your backend URL:

**Replace in all HTML files:**
```javascript
// Old (localhost)
const API_URL = 'http://localhost:3000';

// New (production)
const API_URL = 'https://polyguard-api.onrender.com';
```

**Files to update:**
- demo.html
- merchant-dashboard.html
- admin-dashboard.html
- payment-page.html
- verify-hash.html

## CORS Configuration

The server.js already has CORS enabled, but if you encounter issues, add your Netlify domain:

```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://polyguard.netlify.app');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
```

## Database (Neon)

Already configured! Your Neon PostgreSQL database is ready to use:
- Host: ep-shiny-sunset-ae0ezxj1-pooler.us-east-2.aws.neon.tech
- Database: neondb
- Connection string is in DATABASE_URL

## Testing Deployment

1. Visit https://polyguard.netlify.app
2. Try logging in with admin/Admin123!
3. Create a QR code with payment details
4. Verify the QR code displays the payment page correctly

## Current Status

✅ Frontend deployed to Netlify
⚠️ Backend needs deployment to Render/Railway/Heroku
⚠️ Frontend API URLs need updating after backend deployment

## Quick Fix for Now

To get it working immediately on Netlify (frontend only):

The site will load, but API calls to localhost:3000 won't work. You need to:
1. Deploy backend to Render (15 minutes)
2. Update API URLs in frontend files
3. Push changes to GitHub
4. Netlify auto-deploys

## Notes

- Netlify is **static hosting only** - cannot run server.js
- server.js needs a **Node.js hosting platform** like Render
- This is a standard deployment pattern for full-stack apps
