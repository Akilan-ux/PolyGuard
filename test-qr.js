const http = require('http');

const data = JSON.stringify({
  hash: 'testhash12345',
  company: 'TestCompany',
  email: 'test@example.com',
  fullName: 'Test User'
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/qr-store',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let responseData = '';
  res.on('data', (chunk) => { responseData += chunk; });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', responseData);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
  console.error('Full error:', e);
});

req.on('timeout', () => {
  console.error('Request timeout');
  req.abort();
});

try {
  req.write(data);
  req.end();
} catch (err) {
  console.error('Write error:', err.message);
}
