const http = require('http');
const PORT = process.env.PORT || 4001;
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {'content-type':'application/json'});
    return res.end(JSON.stringify({ok:true, app:'vps-storage', time:new Date().toISOString()}));
  }
  res.writeHead(200, {'content-type':'text/plain'});
  res.end('vps-storage up\n');
});
server.listen(PORT, () => console.log(`[vps-storage] listening on :${PORT}`));
