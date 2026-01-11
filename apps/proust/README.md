# Proust Questionnaire - Gupta Vidyā (गुप्त-विद्या)

## End-to-End Encryption Implementation

This is the encrypted authentication system for the Proust Questionnaire, implementing **gupta-vidyā** (secret knowledge) principles from Kashmir Śaivism.

### 🔐 Security Features

- **Client-Side Encryption**: AES-256-GCM encryption using Web Crypto API
- **Ephemeral Keys**: Each session uses a unique, temporary encryption key
- **5-Minute Window**: Encrypted packages expire after 5 minutes (śakti freshness)
- **Signature Verification**: HMAC signatures ensure data integrity
- **Zero-Knowledge**: Server never sees plaintext emails during transmission

### 🏗️ Architecture

```
┌─────────────────┐
│   Browser       │
│  (Client-Side)  │
│                 │
│  1. Generate    │
│     ephemeral   │
│     AES-256 key │
│                 │
│  2. Encrypt     │
│     email with  │
│     AES-GCM     │
│                 │
│  3. Create      │
│     signature   │
│                 │
│  4. Transmit    │
│     encrypted   │
│     package     │
└────────┬────────┘
         │ HTTPS
         │ (Additional Layer)
         ▼
┌─────────────────┐
│ Iceland Server  │
│  proust.a4m.is  │
│                 │
│  5. Verify      │
│     timestamp   │
│     (< 5 min)   │
│                 │
│  6. Verify      │
│     signature   │
│                 │
│  7. Decrypt     │
│     with key    │
│                 │
│  8. Store       │
│     encrypted   │
│     in database │
└─────────────────┘
```

### 📦 Project Structure

```
/var/www/aformulationoftruth/apps/proust/
├── client/
│   └── src/
│       └── services/
│           └── guptaVidya/
│               ├── types.ts          # TypeScript type definitions
│               └── emailEncryption.ts # Client-side encryption
├── server/
│   ├── index.js                      # Express server
│   └── services/
│       └── guptaVidya/
│           └── decryption.js         # Server-side decryption
├── public/
│   └── index.html                    # Frontend with inline encryption
├── db/
│   └── migrations/
│       └── 001_encryption_support.sql # Database schema
├── package.json
├── .env.example
└── README.md
```

### 🚀 Installation & Deployment

#### 1. Install Dependencies
```bash
cd /var/www/aformulationoftruth/apps/proust
npm install
```

#### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your configuration
nano .env
```

#### 3. Setup Database
```bash
# Run the migration
psql -U your_user -d karuppacami < db/migrations/001_encryption_support.sql
```

#### 4. Install Systemd Service
```bash
sudo cp proust-gupta-vidya.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable proust-gupta-vidya
sudo systemctl start proust-gupta-vidya
```

#### 5. Configure Caddy
The Caddyfile in the parent directory already includes the proust subdomain configuration.

```bash
# Reload Caddy
sudo systemctl reload caddy
```

#### 6. Verify Deployment
```bash
# Check server status
systemctl status proust-gupta-vidya

# Check logs
journalctl -u proust-gupta-vidya -f

# Test health endpoint
curl https://proust.aformulationoftruth.com/api/health
```

### 🧪 Testing

#### Manual Testing
1. Visit https://proust.aformulationoftruth.com
2. Enter your email address
3. Watch the console for encryption progress
4. Verify the encrypted package is transmitted

#### API Testing
```bash
# Health check
curl https://proust.aformulationoftruth.com/api/health

# Should return:
# {
#   "status": "ok",
#   "service": "proust-gupta-vidya",
#   "encryption": "active",
#   "blessing": "गुप्तविद्या सक्रियः । Secret knowledge is active"
# }
```

### 🔧 Configuration

#### Environment Variables
- `PROUST_PORT`: Server port (default: 5743)
- `NODE_ENV`: Environment (production/development)
- `ENCRYPTION_ALGORITHM`: Encryption algorithm (aes-256-gcm)
- `TOKEN_EXPIRY_MINUTES`: Session token expiry (default: 5)

### 📊 Database Schema

#### Tables
- `proust_sessions`: Encrypted authentication sessions
- `proust_responses`: Questionnaire responses
- `encryption_audit_log`: Security audit trail

### 🔐 Encryption Flow

1. **Client**: Generate ephemeral AES-256 key
2. **Client**: Encrypt email with AES-GCM
3. **Client**: Create SHA-256 signature
4. **Client**: Transmit encrypted package via HTTPS
5. **Server**: Validate timestamp (< 5 minutes)
6. **Server**: Verify signature integrity
7. **Server**: Decrypt email using ephemeral key
8. **Server**: Validate email format
9. **Server**: Generate session token
10. **Server**: Store encrypted data in database

### 🛡️ Security Considerations

- Encryption happens **before** network transmission
- Ephemeral keys are **never stored**
- Timestamps prevent replay attacks (5-minute window)
- HMAC signatures prevent tampering
- HTTPS provides additional transport security
- Zero-knowledge: server doesn't see plaintext during transmission

### 📝 API Endpoints

#### POST `/api/auth/initiate-encrypted`
Accepts encrypted email package, returns session token.

**Request Body:**
```json
{
  "encryptedEmail": "base64...",
  "ephemeralKey": "base64...",
  "iv": "base64...",
  "salt": "base64...",
  "timestamp": 1699564800000,
  "signature": "base64..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Authentication successful",
  "sessionToken": "hex...",
  "magicLink": "https://proust.../questionnaire?token=...",
  "blessing": "तत् त्वम् असि । That thou art."
}
```

### 🐛 Troubleshooting

#### Server Won't Start
```bash
# Check logs
journalctl -u proust-gupta-vidya -n 50

# Check port availability
sudo lsof -i :5743

# Test manually
cd /var/www/aformulationoftruth/apps/proust
node server/index.js
```

#### Encryption Fails in Browser
- Ensure HTTPS is enabled (Web Crypto API requires secure context)
- Check browser console for errors
- Verify Web Crypto API support: `!!window.crypto.subtle`

#### Database Connection Issues
- Verify DATABASE_URL in .env
- Check PostgreSQL is running: `systemctl status postgresql`
- Verify migrations are applied

### 📚 Philosophy

This implementation embodies **gupta-vidyā** (गुप्त-विद्या) - the secret knowledge tradition of Kashmir Śaivism. Each encryption key is a **bīja mantra** (seed syllable) that protects and reveals simultaneously. The 5-minute window represents the duration of **śaktipāta** (descent of spiritual power).

### 🙏 Sanskrit Blessings

```
ॐ गुहाय नमः । ॐ गुप्ताय नमः । ॐ गूढाय नमः ।

Salutations to the Hidden One
Salutations to the Secret One
Salutations to the Concealed One

तत् त्वम् असि । That thou art.
स्वतन्त्रो भव । Be free.
```

### 📄 License

MIT

### 👤 Author

A Formulation of Truth
https://aformulationoftruth.com
