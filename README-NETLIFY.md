PolyGuard Demo — Netlify Deployment Guide

This project is now configured to deploy to Netlify as a full-stack application with serverless functions for the API endpoints.

Files added for Netlify:
- `netlify.toml` — Netlify build and deployment config
- `netlify/functions/hash.js` — serverless function for `/hash` endpoint (SHA-256 generation)
- `netlify/functions/deploy.js` — serverless function for `/deploy` endpoint (Hardhat deployment)
- `demo.html` — updated to call Netlify functions when deployed (or local server when running locally)

Deploying to Netlify
====================

1. Push your repo to GitHub (if not already done):
```bash
git add .
git commit -m "Configure for Netlify deployment"
git push origin main
```

2. Connect your GitHub repo to Netlify:
   - Go to https://app.netlify.com
   - Click "New site from Git"
   - Authorize GitHub and select your repo
   - Netlify will auto-detect `netlify.toml` and configure the build

3. Configure build settings (if needed):
   - Build command: `npm install`
   - Publish directory: `.` (repo root; Netlify serves static files)
   - Functions directory: `netlify/functions`

4. Deploy:
   - Netlify will install dependencies and start the build
   - Functions will be deployed to `/.netlify/functions/hash` and `/.netlify/functions/deploy`
   - Static files (`demo.html`, `main.html`, `main.css`, `main.js`) will be served at the root

Local Development
=================

To test locally with Netlify functions:

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Start the development server:
```bash
netlify dev
```

This will serve the site at `http://localhost:8888` and run functions locally at `http://localhost:8888/.netlify/functions/<function-name>`.

Important Notes
===============

- The `/deploy` function runs `node scripts/register_call.js` which expects a local Hardhat node to be running. This is intended for local demos only. On Netlify, the function will fail unless:
  - You have a persistent blockchain (not typical on serverless) running somewhere, or
  - You modify `scripts/register.js` to deploy to a public testnet (Sepolia, Goerli) using an RPC provider and private key passed via Netlify environment variables.

- If you want on-chain registration on Netlify, I recommend:
  1. Updating `scripts/register.js` to use a testnet RPC (Infura, Alchemy, Ankr)
  2. Adding `PRIVATE_KEY` and `RPC_URL` as Netlify environment variables
  3. Updating `netlify/functions/deploy.js` to pass these env vars to the deployment script

- The `/hash` function will work out-of-the-box on Netlify (it only does SHA-256, no blockchain needed).

Netlify Environment Variables
=============================

If you plan to deploy contracts to a testnet, add these in Netlify Site Settings → Environment:
- `PRIVATE_KEY` — your deployer account private key (keep this secret!)
- `RPC_URL` — testnet RPC endpoint (e.g., `https://sepolia.infura.io/v3/YOUR_PROJECT_ID`)

Then update `scripts/register.js` to read these variables and deploy to the testnet.

Troubleshooting
===============

- If functions are not deploying, check the Netlify deploy logs.
- If `/deploy` fails, ensure Hardhat node is running (local) or configure a testnet (cloud).
- If static files are not serving, verify `netlify.toml` has `publish = "."`.
