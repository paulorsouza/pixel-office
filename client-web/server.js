// Servidor de desenvolvimento sem dependências.
// Salvar um arquivo do Tiled valida o projeto e recarrega o navegador, sem conversão.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const root = __dirname;
const port = Number(process.env.PORT || 8123);
const manifestDir = path.join(root, 'maps');
const tiledMapsDir = path.join(root, 'tiled', 'maps');
const watchedDirectories = [
  manifestDir,
  tiledMapsDir,
  path.join(root, 'tiled', 'tilesets'),
  path.join(root, 'tiled', 'templates'),
];
const loaderPath = path.join(root, 'src', 'TiledRuntimeLoader.js');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json',
  '.tmj': 'application/json',
  '.tsj': 'application/json',
  '.tj': 'application/json',
  '.css': 'text/css',
};

const liveClients = new Set();
const debounceByFile = new Map();
let validationQueue = Promise.resolve();
let tiledLoader;

function sendEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function broadcast(payload) {
  for (const response of liveClients) sendEvent(response, payload);
}

async function validateProject() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'maps', 'scenes.json'), 'utf8'));
  await tiledLoader.loadTiledSceneMaps(manifest, {
    baseUrl: pathToFileURL(path.join(root, 'index.html')).href,
    fetchJson: async (url) => JSON.parse(await fs.promises.readFile(fileURLToPath(url), 'utf8')),
  });
}

function validateAndReload(sceneId, reason = 'save') {
  validationQueue = validationQueue.then(async () => {
    broadcast({ type: 'map-syncing', sceneId, reason });
    try {
      await validateProject();
      broadcast({ type: 'map-updated', sceneId, reason });
      console.log(`[Tiled] ${sceneId}: projeto válido; navegador avisado.`);
    } catch (error) {
      const message = error?.message || String(error);
      broadcast({ type: 'map-error', sceneId, message });
      console.error(`[Tiled] ${sceneId}: ${message}`);
    }
  });
  return validationQueue;
}

function scheduleValidation(directory, filename) {
  if (!filename) return;
  const name = String(filename);
  const extension = path.extname(name).toLowerCase();
  const isManifest = directory === manifestDir && name.toLowerCase() === 'scenes.json';
  if (!isManifest && !['.tmj', '.tsj', '.tj'].includes(extension)) return;
  const sceneId = directory === tiledMapsDir && extension === '.tmj'
    ? path.basename(name, '.tmj')
    : '*';
  const key = path.join(directory, name);
  clearTimeout(debounceByFile.get(key));
  debounceByFile.set(key, setTimeout(() => {
    debounceByFile.delete(key);
    validateAndReload(sceneId);
  }, 350));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__office-quest/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    liveClients.add(res);
    sendEvent(res, { type: 'ready' });
    req.on('close', () => liveClients.delete(res));
    return;
  }

  let requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/') requestPath = '/index.html';
  const filePath = path.normalize(path.join(root, requestPath));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    const sourceFile = ['.json', '.js', '.tmj', '.tsj', '.tj'].includes(extension);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': sourceFile ? 'no-cache' : 'public, max-age=60',
    });
    res.end(data);
  });
});

async function start() {
  tiledLoader = await import(pathToFileURL(loaderPath).href);
  try {
    await validateProject();
    console.log('[Tiled] projeto validado diretamente dos arquivos do editor.');
  } catch (error) {
    console.error(`[Tiled] erro na inicialização: ${error.message}`);
  }

  for (const directory of watchedDirectories) {
    if (!fs.existsSync(directory)) continue;
    fs.watch(directory, { persistent: true }, (_event, filename) => (
      scheduleValidation(directory, filename)
    ));
  }
  server.listen(port, () => {
    console.log(`client-web em http://localhost:${port}`);
    console.log('Tiled ao vivo: salve .tmj/.tsj/.tj para validar e recarregar o jogo.');
  });
}

const heartbeat = setInterval(() => {
  for (const response of liveClients) response.write(': keep-alive\n\n');
}, 20000);
heartbeat.unref();

start().catch((error) => {
  console.error(`Falha ao iniciar client-web: ${error.stack || error.message}`);
  process.exitCode = 1;
});
