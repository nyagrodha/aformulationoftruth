import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4000);
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json'});
    res.end(JSON.stringify({ ok: true, service: 'a4mulagupta', time: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[a4m] a4mulagupta listening on :${PORT}`);
});
