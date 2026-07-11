const fs = require('fs');
const http = require('http');
const path = require('path');
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!file.startsWith(PUBLIC_DIR)) return respond(response, 403, 'Forbidden');
  fs.readFile(file, (error, content) => {
    if (error) return respond(response, error.code === 'ENOENT' ? 404 : 500, 'Not found');
    response.writeHead(200, {
      'Content-Type': `${TYPES[path.extname(file)] || 'application/octet-stream'}; charset=utf-8`,
      'Cache-Control': shouldRevalidate(file) ? 'no-cache' : 'public, max-age=3600'
    });
    response.end(content);
  });
}).listen(PORT, () => {
  console.log(`Schulte Grid running at http://localhost:${PORT}`);
});

function respond(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

function shouldRevalidate(file) {
  return path.extname(file) === '.html' || file.endsWith('sw.js') || file.endsWith('daily-levels.json');
}
