PolyGuard Demo — Local private blockchain guide

This project includes a minimal Hardhat setup and a Solidity contract to demonstrate registering a SHA-256 product hash on a private local blockchain with zero gas cost (for local dev only).

Files added:
- `package.json` — Node/dev dependencies and scripts
- `hardhat.config.js` — Hardhat config (localhost network, gasPrice: 0)
- `contracts/PolyGuardRegistry.sol` — simple registry contract with `register` and `verify`
- `scripts/register.js` — Hardhat script to deploy the contract and optionally register a hash (reads env `HASH`)
- `scripts/register_call.js` — small wrapper to call the deploy+register script with a hash value

Quick start (Windows PowerShell):

1) Install dependencies (requires Node.js and npm):

```powershell
npm install
```

2) Start a local Hardhat node (this will produce accounts and run JSON-RPC on `127.0.0.1:8545`):

```powershell
npx hardhat node
```

Hardhat node runs a local Ethereum-like chain. We set `gasPrice: 0` in `hardhat.config.js` so transactions cost zero (local development only).

3) In another terminal, deploy the contract and register a hash:

```powershell
# example (deploy only):
npx hardhat run --network localhost scripts/register.js

# deploy and register a hash (hex string expected, 0x...):
$env:HASH = '0x0123abc...'
npx hardhat run --network localhost scripts/register.js

# or use the convenience wrapper (provides the HASH env var automatically):
node scripts/register_call.js 0x0123abc...
```

5) (Optional) Start the local Express API so `demo.html` can deploy the hash automatically:

```powershell
# Install dependencies first (if not already done)
npm install

# Start the API server (defaults to http://127.0.0.1:3000)
node server.js
```

Then in `demo.html` click the "Deploy Now (via API)" button after generating the hash — the page will POST to `http://127.0.0.1:3000/deploy` and the API will run the deploy/register helper for you.

Deploying to Render (single service)
----------------------------------
If you want to host the full demo (frontend + APIs) on Render as a single service, follow these steps:

1. Push your repository to GitHub.

2. On Render, create a new Web Service and connect your GitHub repo.
	- Branch: select the branch to deploy (e.g., `main`).
	- Build Command: leave blank (Render will run `npm install` by default).
	- Start Command: `npm start`
	- Environment: set any secrets if you plan to deploy contracts to a public testnet (e.g., `PRIVATE_KEY`, `INFURA_API_KEY`).

3. Render will install dependencies and start `server.js`. The Node server serves both static assets (your `demo.html`) and the API endpoints `/hash` and `/deploy`.

Notes:
- The `/deploy` endpoint runs the Hardhat helper which expects a running blockchain (local `npx hardhat node`) to register hashes without gas — that workflow is intended for local demo only. For production/demo on Render, you should deploy the contract to a testnet (e.g., Sepolia) and set RPC and keys via environment variables; then update `scripts/register.js` to use that network and provider.
- If you want zero-gas behavior in the cloud you must run a dev chain on a server instance (not recommended). Instead, use a testnet with test ETH or a private managed node.

Deploying frontend to GitHub Pages (static only)
-----------------------------------------------
If you prefer to host only the static frontend on GitHub Pages and keep the Node API on Render:

1. Commit and push your repo. In the repo settings -> Pages, set the source to the `main` branch and the root folder.
2. Build a simple `gh-pages` workflow or enable Pages to serve the static files directly. Update `demo.html` to call the hosted API URL (set in `demo.html` or load via config).

If you'd like, I can prepare a Render-ready deployment (one service) by:
- Converting `/deploy` to deploy to a testnet using env vars for RPC & key, and
- Adding a `render.yaml` or simple instructions for a Render service with environment variables.

4) After registering, the `register` event will be emitted and you can query the contract with `verify(bytes32)` or inspect transactions in the local Hardhat node logs.

Notes:
- This local chain is for development/demo: do not use it for production.
- The `gasPrice` being 0 makes transactions effectively free in this private environment.
- You can adapt `scripts/register.js` to pass additional metadata or to output Merkle proofs if you build out an off-chain aggregator later.

If you'd like, I can add a small Node API endpoint to accept hashes from `demo.html` and run the `register_call.js` script automatically — do you want that? If yes, I can implement a minimal Express endpoint and update the demo page to call it directly.