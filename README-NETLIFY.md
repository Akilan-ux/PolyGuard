PolyGuard Frontend — Netlify Deployment Guide

This project is now configured to deploy the frontend (static files) to Netlify. The backend APIs (`/hash`, `/deploy`) are NOT included in the Netlify deployment — they must be hosted separately or run locally.

Files deployed to Netlify:
- `main.html` — homepage with navigation and product info
- `demo.html` — interactive demo UI with Registration, Authentication, Proof of Transaction tabs
- `main.css` — styling
- `main.js` — frontend interactions

Deploying to Netlify
====================

1. Push your repo to GitHub (if not already done):
```bash
git add .
git commit -m "Deploy frontend to Netlify"
git push origin main
```

2. Connect your GitHub repo to Netlify:
   - Go to https://app.netlify.com
   - Click "New site from Git"
   - Authorize GitHub and select your repo
   - Netlify will auto-detect `netlify.toml` and configure the build

3. Deploy:
   - Netlify will install dependencies and serve the static files
   - Your site will be live at a Netlify URL

Backend Setup (Local or Separate Service)
=========================================

The frontend is now on Netlify, but it still calls `/hash` and `/deploy` endpoints. You need to run these locally or host them separately:

Option 1: Run backend locally
```bash
# Terminal 1: Start the hash API (Python)
python hash.py

# Terminal 2: Start the Node API and static server
npm run start-api
# or
node server.js
```

Then open `http://localhost:3000` and the demo will call the local APIs.

Option 2: Host backend on a separate service (Render, Railway, Heroku, etc.)
- Update `demo.html` to call the backend URL (e.g., `https://your-api.herokuapp.com/hash`)
- Deploy the backend service separately (using `server.js` or `hash.py`)

Option 3: Use environment variables for API URL (recommended)
- In `demo.html`, read the API URL from `window.ENV` or a config file
- On Netlify, set environment variables to the backend service URL
- Update the fetch calls to use the env var

Current Configuration
====================

- `netlify.toml` — minimal config: just install deps and publish static files
- `package.json` — includes `start` script to run `server.js` (for local testing)
- `demo.html` — calls `/hash` and `/deploy` (must be available at same origin or CORS-enabled)