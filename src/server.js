import http from 'http';

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = '127.0.0.1'; // keep internal; front with Nginx if needed

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json'});
    return res.end(JSON.stringify({ ok: true, service: 'a4mulagupta', time: new Date().toISOString() }));
  }
  res.writeHead(200, {'content-type':'text/plain; charset=utf-8'});
  res.end('a4mulagupta is alive\n');
});

server.listen(PORT, HOST, () => {
  console.log(`[a4mulagupta] listening on http://${HOST}:${PORT}`);
});
