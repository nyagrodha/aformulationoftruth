const http = require('http');
const PORT = process.env.PORT || 4000;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json'});
    return res.end(JSON.stringify({ok:true, app:'a4mulagupta', time:new Date().toISOString()}));
  }
  res.writeHead(200, {'content-type':'text/plain'});
  res.end('a4mulagupta up\n');
});
server.listen(PORT, () => console.log(`[a4mulagupta] listening on :${PORT}`));
