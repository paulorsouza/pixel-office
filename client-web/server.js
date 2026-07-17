// Servidor estático mínimo (sem dependências) + save do mapa (editor).
const http = require('http'), fs = require('fs'), path = require('path');
const root = __dirname, port = 8123;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json', '.css': 'text/css',
};

http.createServer((req, res) => {
  // salvar mapa do editor: POST /api/map/<nome>  (body = JSON do mapa)
  if (req.method === 'POST' && req.url.startsWith('/api/map/')) {
    const name = path.basename(req.url.slice('/api/map/'.length)).replace(/[^\w.-]/g, '');
    if (!name.endsWith('.json')) { res.writeHead(400); return res.end('nome inválido'); }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      try {
        JSON.parse(body); // valida
        fs.writeFileSync(path.join(root, 'maps', name), body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        console.log('mapa salvo: maps/' + name);
      } catch (e) { res.writeHead(400); res.end('json inválido'); }
    });
    return;
  }

  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(root, p));
  if (!fp.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': mime[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => console.log('client-web em http://localhost:' + port));
