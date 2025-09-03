import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4001);
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json'});
    res.end(JSON.stringify({ ok: true, service: 'vps-storage', time: new Date().toISOString() }));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[a4m] vps-storage listening on :${PORT}`);
});
