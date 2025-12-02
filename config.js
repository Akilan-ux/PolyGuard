// API Configuration
// Toggle between local development and production

const CONFIG = {
  // Change this to switch between environments
  ENV: 'local', // 'local' or 'production'
  
  // API endpoints
  API_URLS: {
    local: 'http://localhost:3000',
    production: 'https://polyguard-vlzf.onrender.com'
  },
  
  // Get current API URL
  get API_URL() {
    return this.API_URLS[this.ENV];
  }
};

// Auto-detect environment based on hostname
if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
  CONFIG.ENV = 'production';
}

console.log(`🔧 Environment: ${CONFIG.ENV}`);
console.log(`🌐 API URL: ${CONFIG.API_URL}`);
