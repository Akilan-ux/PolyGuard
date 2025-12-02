# Render Deployment Troubleshooting

## "Cannot GET /" Error - Common Causes

### 1. Check Render Logs
Go to your Render dashboard → Your service → Logs tab

Look for:
- ✅ `Build successful`
- ✅ `🚀 PolyGuard Blockchain API Server running on port...`
- ❌ Any error messages

### 2. Verify Environment Variables
In Render dashboard → Environment tab, add:

```
DATABASE_URL=postgresql://neondb_owner:npg_FTYS4XhWbd5l@ep-shiny-sunset-ae0ezxj1-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require

JWT_SECRET=your-secret-key-here-change-this

PORT=10000
```

⚠️ **IMPORTANT**: After adding environment variables, click "Save Changes" - Render will automatically redeploy.

### 3. Check Build Settings
In Render dashboard → Settings tab:

- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Node Version**: Auto (or specify 18+)

### 4. Common Issues & Fixes

#### Issue: "Cannot find module 'express'"
**Fix**: Make sure `package.json` has all dependencies:
```json
"dependencies": {
  "@netlify/neon": "^0.1.0",
  "express": "^4.18.2",
  "jsonwebtoken": "^9.0.2",
  "pg": "^8.11.3",
  "qrcode": "^1.5.3"
}
```

#### Issue: Database connection error
**Fix**: Check that `DATABASE_URL` environment variable is set correctly (no trailing spaces)

#### Issue: Port binding error
**Fix**: Render automatically sets `PORT` environment variable. Make sure server.js uses:
```javascript
const port = process.env.PORT || 3000;
```

#### Issue: Build succeeds but "Cannot GET /"
**Fix**: Wait 1-2 minutes after deploy completes - server might still be initializing database

### 5. Test Your Deployment

Once deployed, test these URLs (replace with your actual Render URL):

1. **Root endpoint**: `https://your-app.onrender.com/`
   - Should return JSON with API info

2. **Health check**: `https://your-app.onrender.com/health`
   - Should return `{"status":"healthy","timestamp":"..."}`

3. **Register test**: POST to `https://your-app.onrender.com/auth/register`
   ```json
   {
     "user_name": "testuser",
     "password": "Test123!",
     "company_name": "Test Company"
   }
   ```

### 6. View Live Logs

In Render dashboard → Logs → Enable "Auto-scroll"

You should see:
```
🚀 PolyGuard Blockchain API Server running on port 10000
📊 Database: Connected to Neon PostgreSQL
🔐 Authentication: JWT (24h expiry)
✓ Database tables initialized successfully
```

### 7. If Still Not Working

Check Render's "Events" tab for deployment status:
- Look for "Deploy succeeded" or "Deploy failed"
- Check the timestamp - recent deploys might still be starting up
- Force redeploy: Manual Deploy → Clear build cache & deploy

### 8. Free Tier Limitations

If using Render's free tier:
- ⚠️ Service spins down after 15 minutes of inactivity
- ⚠️ First request after spin-down takes 30-60 seconds
- ⚠️ This can cause "Cannot GET /" temporarily

**Solution**: Wait 1 minute and refresh, or upgrade to paid tier

### 9. Quick Checklist

- [ ] Build command is `npm install`
- [ ] Start command is `node server.js`
- [ ] `DATABASE_URL` environment variable is set
- [ ] Deploy shows "Live" status
- [ ] Logs show "Server running on port..."
- [ ] Waited at least 1 minute after deploy
- [ ] Tested `/health` endpoint

### 10. Get Your API URL

Once working, your API URL will be:
- Format: `https://your-service-name.onrender.com`
- Example: `https://polyguard-api.onrender.com`

Copy this URL and update `config.js`:
```javascript
production: 'https://your-actual-render-url.onrender.com'
```

Then push to GitHub to update Netlify frontend.
