import hashlib
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

def generate_hash(data: str) -> str:
    """Hash the input data using SHA-256 and return hex digest."""
    sha256_hash = hashlib.sha256(data.encode('utf-8')).hexdigest()
    return sha256_hash


class HashRequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/hash':
            self._set_headers(404)
            self.wfile.write(json.dumps({'error': 'Not found'}).encode('utf-8'))
            return

        content_length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(content_length) if content_length > 0 else b''
        try:
            payload = json.loads(raw.decode('utf-8') or '{}')
        except Exception:
            self._set_headers(400)
            self.wfile.write(json.dumps({'error': 'Invalid JSON'}).encode('utf-8'))
            return

        product_id = str(payload.get('product_id', '')).strip()
        hashed = generate_hash(product_id)

        # Print the result to console (as requested)
        print(f"SHA-256 Hash for product_id '{product_id}': {hashed}")

        self._set_headers(200)
        response = {
            'product_id': product_id,
            'sha256': hashed
        }
        self.wfile.write(json.dumps(response).encode('utf-8'))


def run_server(host='127.0.0.1', port=8000):
    server_address = (host, port)
    httpd = HTTPServer(server_address, HashRequestHandler)
    print(f"Hash API server running at http://{host}:{port}/hash")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped')
        httpd.server_close()


if __name__ == '__main__':
    run_server()
