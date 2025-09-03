res.cookie('sid', tokenOrId, {
  httpOnly: true,
  secure: true,        // true in prod over HTTPS
  sameSite: 'Lax',     // or 'None' if cross-site
  path: '/',
  domain: '.yourdomain.tld', // if sharing across subdomains
  maxAge: 1000*60*60*24*7
});
// read
app.get('/me', (req,res)=> {
  // e.g., req.cookies.sid -> decode/lookup -> user
  res.json({ user: req.user ?? null });
});
