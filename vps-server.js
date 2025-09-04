import http from 'http';

const PORT = parseInt(process.env.PORT || '4001', 10);
const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json'});
    return res.end(JSON.stringify({ ok: true, service: 'vps-storage', time: new Date().toISOString() }));
  }
  res.writeHead(200, {'content-type':'text/plain; charset=utf-8'});
  res.end('vps-storage is alive\n');
});

server.listen(PORT, HOST, () => {
  console.log(`[vps-storage] listening on http://${HOST}:${PORT}`);
});
