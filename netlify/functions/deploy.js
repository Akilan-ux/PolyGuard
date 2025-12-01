const { spawn } = require('child_process');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { hash } = JSON.parse(event.body || '{}');
    if (!hash || typeof hash !== 'string') {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing or invalid hash' }) };
    }

    const hex = hash.startsWith('0x') ? hash.slice(2) : hash;
    if (!/^[0-9a-fA-F]{1,64}$/.test(hex)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid hash format' }) };
    }

    return new Promise((resolve) => {
      const child = spawn('node', ['scripts/register_call.js', hash]);
      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('close', (code) => {
        resolve({
          statusCode: code === 0 ? 200 : 500,
          body: JSON.stringify({ exitCode: code, stdout, stderr })
        });
      });

      // 2-minute timeout
      setTimeout(() => {
        if (!child.killed) child.kill('SIGTERM');
      }, 120000);
    });
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
