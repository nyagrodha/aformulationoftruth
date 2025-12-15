# CORS Configuration for API Failover

## Overview

The frontend now implements automatic API endpoint failover between:
1. **Primary**: `https://gimbal.fobdongle.com`
2. **Backup**: `https://proust.aformulationoftruth.com`

For this to work properly, both API endpoints must be configured to accept CORS requests from the frontend domain.

## Required CORS Configuration

### Allowed Origins

The backend API servers at both `gimbal.fobdongle.com` and `proust.aformulationoftruth.com` must allow CORS requests from:

- `https://aformulationoftruth.com`
- `https://www.aformulationoftruth.com` (if used)
- `https://gimbal.fobdongle.com` (for self-hosted frontend)
- `https://proust.aformulationoftruth.com` (for self-hosted frontend)

### Required Headers

Your backend must set these CORS headers:

```
Access-Control-Allow-Origin: <requesting-origin>
Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

### Credentials Support

The failover client uses `credentials: 'include'` to support cookie-based authentication. This means:

1. **`Access-Control-Allow-Credentials: true`** must be set
2. **`Access-Control-Allow-Origin`** cannot be `*` - must be the specific requesting origin
3. Session cookies must have appropriate `SameSite` attributes

## Implementation Examples

### Node.js/Express

```javascript
const cors = require('cors');

const allowedOrigins = [
  'https://aformulationoftruth.com',
  'https://www.aformulationoftruth.com',
  'https://gimbal.fobdongle.com',
  'https://proust.aformulationoftruth.com'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### Nginx

```nginx
location /api {
    # Set CORS headers
    set $cors_origin "";
    if ($http_origin ~* (^https://(aformulationoftruth\.com|www\.aformulationoftruth\.com|gimbal\.fobdongle\.com|proust\.aformulationoftruth\.com)$)) {
        set $cors_origin $http_origin;
    }

    add_header 'Access-Control-Allow-Origin' $cors_origin always;
    add_header 'Access-Control-Allow-Credentials' 'true' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PATCH, DELETE, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization' always;
    add_header 'Access-Control-Max-Age' 86400 always;

    # Handle preflight requests
    if ($request_method = 'OPTIONS') {
        return 204;
    }

    # Proxy to your backend
    proxy_pass http://localhost:3000;
}
```

### Apache

```apache
<IfModule mod_headers.c>
    SetEnvIf Origin "^https://(aformulationoftruth\.com|www\.aformulationoftruth\.com|gimbal\.fobdongle\.com|proust\.aformulationoftruth\.com)$" ORIGIN_ALLOWED=$0

    Header always set Access-Control-Allow-Origin "%{ORIGIN_ALLOWED}e" env=ORIGIN_ALLOWED
    Header always set Access-Control-Allow-Credentials "true" env=ORIGIN_ALLOWED
    Header always set Access-Control-Allow-Methods "GET, POST, PATCH, DELETE, OPTIONS" env=ORIGIN_ALLOWED
    Header always set Access-Control-Allow-Headers "Content-Type, Authorization" env=ORIGIN_ALLOWED
    Header always set Access-Control-Max-Age "86400" env=ORIGIN_ALLOWED

    # Handle preflight
    RewriteEngine On
    RewriteCond %{REQUEST_METHOD} OPTIONS
    RewriteRule ^(.*)$ $1 [R=204,L]
</IfModule>
```

## Cookie Configuration

For session-based authentication to work across domains, configure your session cookies with:

### Node.js/Express Session

```javascript
app.use(session({
  secret: 'your-secret-key',
  cookie: {
    httpOnly: true,
    secure: true,  // HTTPS only
    sameSite: 'none',  // Required for cross-domain cookies
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  },
  // ... other session options
}));
```

### Important Cookie Notes

1. **`SameSite=None`** is required for cross-domain cookie access
2. **`Secure=true`** is required when using `SameSite=None`
3. This means HTTPS is mandatory - won't work with HTTP

## Testing CORS Configuration

### Test with curl

```bash
# Test GET request
curl -H "Origin: https://aformulationoftruth.com" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://gimbal.fobdongle.com/api/questions/next

# Should return CORS headers in response
```

### Test in Browser Console

```javascript
// Test from aformulationoftruth.com
fetch('https://gimbal.fobdongle.com/api/questions/next', {
  credentials: 'include'
})
.then(response => response.json())
.then(data => console.log('Success:', data))
.catch(error => console.error('CORS Error:', error));
```

## Troubleshooting

### Common CORS Errors

1. **"No 'Access-Control-Allow-Origin' header present"**
   - Backend is not setting CORS headers
   - Check that your CORS middleware is properly configured

2. **"The value of the 'Access-Control-Allow-Origin' header must not be the wildcard '*'"**
   - You're using `credentials: 'include'` but CORS origin is set to `*`
   - Set specific origin instead

3. **"Credentials flag is 'true', but the 'Access-Control-Allow-Credentials' header is ''"**
   - Backend needs to set `Access-Control-Allow-Credentials: true`

4. **Cookies not being sent**
   - Check cookie `SameSite` and `Secure` attributes
   - Ensure HTTPS is being used
   - Verify `credentials: 'include'` is set in fetch

### Debugging Tips

1. Open browser DevTools → Network tab
2. Look for preflight OPTIONS requests
3. Check response headers for `Access-Control-*` headers
4. Check console for CORS errors
5. Use the failover client's console logs to see which endpoint is being used

## Security Considerations

1. **Only allow trusted origins** - Don't open CORS to all domains
2. **Use HTTPS everywhere** - Required for secure cookies
3. **Validate origin on server-side** - Don't trust client-provided origins
4. **Set appropriate cookie expiration** - Balance security and convenience
5. **Monitor for CORS errors** - Could indicate attempted attacks

## Verification Checklist

- [ ] Both API endpoints (`gimbal.fobdongle.com` and `proust.aformulationoftruth.com`) accept requests from `aformulationoftruth.com`
- [ ] `Access-Control-Allow-Credentials: true` is set
- [ ] `Access-Control-Allow-Origin` is set to the requesting origin (not `*`)
- [ ] Session cookies have `SameSite=None` and `Secure=true`
- [ ] All API endpoints work when called from the frontend
- [ ] Failover works correctly when primary endpoint is down
- [ ] Browser console shows no CORS errors
- [ ] Authentication/session cookies are being sent and received
