const crypto = require('crypto');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { product_id } = JSON.parse(event.body || '{}');
    if (!product_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing product_id' }) };
    }

    const sha = crypto.createHash('sha256').update(String(product_id), 'utf8').digest('hex');
    console.log(`SHA-256 Hash for product_id '${product_id}': ${sha}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ product_id, sha256: sha })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
