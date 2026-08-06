// Servidor estático de uma tacada, sem dependências.
//
// Existe para as bancas de QA que só precisam de arquivos servidos por HTTP —
// hoje a `wwwroot/work-test.html`, que monta quadro, backlog e horas com um
// cliente falso e por isso não quer saber de Postgres nem do backend.
//
//   node client-web/tools/static-server.mjs backend/VirtualOffice.Api/wwwroot 8199
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? 8199);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  // Nada de subir de diretório: `resolve` normaliza e a checagem barra o resto.
  const file = path.resolve(root, `.${url === "/" ? "/index.html" : url}`);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end("fora da raiz");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`não achei ${url}`);
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}).listen(port, () => console.log(`servindo ${root} em http://localhost:${port}`));
