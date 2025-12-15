# Paid Profile System Implementation Status

## ✅ COMPLETED

### Database & Schema
- [x] Migration 0002 run on Iceland server (185.144.234.146)
- [x] Added to `users`: profile_tier, encryption_type, public_key, username, bio, profile_visibility
- [x] Added `payment_codes` table for manual verification
- [x] Added to `responses`: encryption_type, encrypted_data, nonce, version, previous_version_id
- [x] Added to `newsletter_emails`: unsubscribe_token
- [x] Updated `shared/schema.ts` with all new types

### Backend Services
- [x] Created `paymentCodeService.ts` - generates A4OT-XXXX-XXXX codes
- [x] Updated `storage.ts` with new methods:
  - Newsletter unsubscribe
  - Payment code CRUD
  - User profile tier upgrade
- [x] CORS already configured for aformulationoftruth.com

## 🚧 IN PROGRESS - Critical API Endpoints Needed

Add to `/var/www/aformulationoftruth/server/routes.ts`:

### 1. Newsletter Unsubscribe
```typescript
// GET /api/newsletter/unsubscribe/:token
- Check token validity
- Mark as unsubscribed
- Return success page HTML
```

### 2. Payment Code Generation
```typescript
// POST /api/profile/upgrade/request
- Generate unique code
- Store in DB with user_id
- Return code + payment instructions
```

### 3. Payment Code Activation
```typescript
// POST /api/profile/upgrade/activate
- User enters code
- Check if verified
- Upgrade user to paid
- Return success
```

### 4. Admin Payment Verification (Protected)
```typescript
// POST /api/admin/verify-payment/:code
- Admin only
- Mark code as verified
- Return confirmation
```

### 5. Data Deletion with Iceland Education
```typescript
// DELETE /api/user/delete
- Delete all user data
- Return Iceland privacy info
```

## 📄 Frontend Files Needed

All static HTML/CSS/JS files served from aformulationoftruth.com (37.228.129.173):

### 1. Update Existing Files
- `/public/index.html` - Change API calls to `https://gimbal.fobdongle.com/api/*`
- `/public/contact.html` - Change API calls to `https://gimbal.fobdongle.com/api/*`

### 2. New Static Pages Needed
- `/public/upgrade.html` - Profile upgrade page with payment options
- `/public/unsubscribe.html` - Newsletter unsubscribe confirmation
- `/public/js/x25519-crypto.js` - Client-side encryption library for paid users
- `/public/profile.html` - Paid user profile management

## 💰 Payment Methods

User pays $3 via:
- PayPal: [YOUR_PAYPAL_EMAIL]
- CashApp: [YOUR_CASHAPP_HANDLE]
- BTC/Monero/Zcash: [ADDRESSES]

Include payment code in memo/note.

## 🔑 X25519 Encryption (Paid Users)

Browser generates keypair using Web Crypto API:
- Private key stays in browser (user backs up)
- Public key stored in `users.public_key`
- Responses encrypted before sending to server
- Shareable links include decryption key in URL fragment

## 📋 Next Steps (Priority Order)

1. **Add API endpoints to routes.ts** (30 min)
2. **Update frontend HTML to call gimbal.fobdongle.com** (15 min)
3. **Create upgrade.html page** (45 min)
4. **Build x25519-crypto.js** (60 min)
5. **Create admin verification page** (30 min)
6. **Testing end-to-end** (60 min)

## 🌍 Architecture

```
aformulationoftruth.com (37.228.129.173)
  └─ Static HTML/CSS/JS only
  └─ Calls https://gimbal.fobdongle.com/api/*

gimbal.fobdongle.com (185.144.234.146)
  └─ All API endpoints
  └─ PostgreSQL database (a4m_db)
  └─ Iceland privacy jurisdiction ✅
```

## 📞 Payment Info Needed

Please provide:
- PayPal email
- CashApp handle
- BTC/XMR/ZEC addresses (if using crypto)
