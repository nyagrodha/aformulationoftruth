# Deployment Checklist
## Complete Encrypted Link: proust ↔ gimbal

Use this checklist to ensure all steps are completed successfully.

---

## Pre-Deployment

### DNS Configuration
- [ ] Point `gimbal.fobdongle.com` A record to `185.146.234.144`
- [ ] Wait for DNS propagation (test with `dig gimbal.fobdongle.com`)
- [ ] Verify reverse DNS (optional but recommended)

### Server Access
- [ ] Confirm root SSH access to Iceland server (185.146.234.144)
- [ ] Confirm root SSH access to proust server
- [ ] Test SSH connectivity from local machine to both servers

### Backup Current State
- [ ] Backup proust server `.env` file
- [ ] Backup proust server application database
- [ ] Document current network configuration

---

## Phase 1: Iceland Server Setup

### Transfer Deployment Package
- [ ] Transfer `iceland-deployment/` directory to Iceland server
  ```bash
  scp -r iceland-deployment/ root@185.146.234.144:/root/
  ```

### Run Automated Deployment
- [ ] SSH into Iceland server
- [ ] Navigate to deployment directory
  ```bash
  cd /root/iceland-deployment
  ```
- [ ] Make script executable
  ```bash
  chmod +x scripts/deploy-iceland.sh
  ```
- [ ] Run deployment script
  ```bash
  ./scripts/deploy-iceland.sh
  ```
- [ ] Review deployment output for errors
- [ ] Save deployment summary file securely

### Verify Iceland Services
- [ ] WireGuard service running
  ```bash
  systemctl status wg-quick@wg0
  wg show
  ```
- [ ] PostgreSQL service running
  ```bash
  systemctl status postgresql
  ```
- [ ] Storage API service running
  ```bash
  systemctl status gimbal-storage
  curl http://localhost:3001/health
  ```
- [ ] Caddy service running
  ```bash
  systemctl status caddy
  ```
- [ ] Firewall configured correctly
  ```bash
  ufw status
  ```

### Verify HTTPS
- [ ] HTTPS accessible from external network
  ```bash
  curl https://gimbal.fobdongle.com/health
  ```
- [ ] Certificate valid (check browser or openssl)
- [ ] HTTP redirects to HTTPS

### Save Critical Information
- [ ] Copy and securely save `API_KEY` from `/root/iceland-deployment-summary.txt`
- [ ] Copy and securely save `ENCRYPTION_KEY`
- [ ] Copy and securely save `DATABASE_URL`
- [ ] Copy WireGuard client config from `/etc/wireguard/clients/proust-main.conf`

**⚠️ CRITICAL**: Store these keys in a secure password manager!

---

## Phase 2: Proust Server Setup

### Transfer Client Configuration
- [ ] Copy WireGuard client config from Iceland to proust
  ```bash
  scp root@185.146.234.144:/etc/wireguard/clients/proust-main.conf /tmp/
  ```
- [ ] Or manually copy the config content

### Install WireGuard
- [ ] Install WireGuard on proust server
  ```bash
  apt-get update
  apt-get install -y wireguard wireguard-tools
  ```

### Configure WireGuard Client
- [ ] Copy client config to `/etc/wireguard/wg0.conf`
- [ ] Set correct permissions
  ```bash
  chmod 400 /etc/wireguard/wg0.conf
  ```
- [ ] Enable and start WireGuard
  ```bash
  systemctl enable wg-quick@wg0
  systemctl start wg-quick@wg0
  ```

### Verify VPN Connection
- [ ] Check WireGuard status
  ```bash
  wg show
  ```
- [ ] Verify handshake established
- [ ] Ping Iceland VPN server
  ```bash
  ping -c 5 10.8.0.1
  ```

### Update Environment Variables
- [ ] Backup current `.env` file
- [ ] Add VPS configuration to proust `.env`:
  ```bash
  VPS_ENDPOINT=https://gimbal.fobdongle.com
  VPS_API_KEY=<API_KEY_FROM_ICELAND>
  VPS_ENCRYPTION_KEY=<ENCRYPTION_KEY_FROM_ICELAND>
  ```
- [ ] Verify `.env` file permissions (should be 600)

### Restart Proust Application
- [ ] Restart application to load new environment
  ```bash
  systemctl restart aformulationoftruth
  ```
- [ ] Verify application started successfully
  ```bash
  systemctl status aformulationoftruth
  ```
- [ ] Check application logs for errors

---

## Phase 3: Testing & Validation

### Run Automated Tests
- [ ] Transfer test script to proust server (if not already there)
- [ ] Set environment variables for testing
  ```bash
  export API_KEY="<YOUR_API_KEY>"
  export VPS_API_KEY="$API_KEY"
  export ENCRYPTION_KEY="<YOUR_ENCRYPTION_KEY>"
  export VPS_ENCRYPTION_KEY="$ENCRYPTION_KEY"
  ```
- [ ] Run test suite
  ```bash
  bash iceland-deployment/scripts/test-encrypted-link.sh
  ```
- [ ] All tests pass ✓

### Manual Verification

#### Layer 1: DNS & Network
- [ ] DNS resolves correctly from proust server
- [ ] DNS resolves correctly from external network
- [ ] Iceland server accessible on port 443

#### Layer 2: VPN Encryption
- [ ] WireGuard peer connection established
- [ ] VPN traffic visible in `wg show` statistics
- [ ] Can ping VPN server IP (10.8.0.1) from proust

#### Layer 3: TLS/HTTPS
- [ ] HTTPS connection successful
- [ ] Valid TLS certificate
- [ ] Security headers present (HSTS, etc.)
- [ ] TLS 1.3 negotiated

#### Layer 4: API Authentication
- [ ] Unauthenticated requests rejected
- [ ] Authenticated requests accepted
- [ ] Health endpoint responds correctly

#### Layer 5: Application Encryption
- [ ] Can store encrypted response
- [ ] Response stored as encrypted data (not plaintext)
- [ ] Can retrieve encrypted response
- [ ] Can decrypt response successfully
- [ ] Integrity verification works

### End-to-End Test
- [ ] Complete a test questionnaire on proust
- [ ] Verify automatic backup triggered
- [ ] Check Iceland server logs for received data
- [ ] Verify data encrypted in database
- [ ] Test data retrieval and decryption

---

## Phase 4: Monitoring & Maintenance

### Set Up Monitoring
- [ ] Configure WireGuard monitoring script (if desired)
- [ ] Set up log rotation for Caddy logs
- [ ] Set up automated database backups
- [ ] Configure alerting for service failures (optional)

### Documentation
- [ ] Document any deviations from standard deployment
- [ ] Save all configuration files to secure location
- [ ] Create disaster recovery procedure document
- [ ] Document key rotation schedule

### Security Audit
- [ ] Verify file permissions on private keys (should be 400)
- [ ] Verify .env file permissions (should be 600)
- [ ] Review firewall rules on both servers
- [ ] Confirm no unnecessary ports open
- [ ] Verify SSH key-based authentication (disable password auth)

---

## Phase 5: Production Readiness

### Performance Testing
- [ ] Test response time under load
- [ ] Verify rate limiting works
- [ ] Test VPN stability over extended period
- [ ] Monitor resource usage (CPU, RAM, disk)

### Backup & Recovery
- [ ] Test database backup procedure
- [ ] Test database restore procedure
- [ ] Backup WireGuard keys securely
- [ ] Document recovery steps

### Operational Procedures
- [ ] Create runbook for common issues
- [ ] Document restart procedures
- [ ] Document key rotation procedures
- [ ] Create incident response plan

---

## Post-Deployment

### Monitoring (First 24 Hours)
- [ ] Monitor WireGuard connection stability
- [ ] Monitor API error rates
- [ ] Monitor database performance
- [ ] Check for certificate renewal issues

### Monitoring (First Week)
- [ ] Review accumulated logs for issues
- [ ] Verify automated backups running
- [ ] Test key rotation procedure
- [ ] Conduct security review

### Final Steps
- [ ] Update project documentation
- [ ] Notify team of deployment completion
- [ ] Schedule regular maintenance checks
- [ ] Set calendar reminders for key rotation

---

## Rollback Plan

If issues occur, follow this rollback procedure:

1. **Stop WireGuard on proust**
   ```bash
   systemctl stop wg-quick@wg0
   ```

2. **Restore previous .env file**
   ```bash
   cp /path/to/backup/.env /home/runner/aformulationoftruth/.env
   ```

3. **Restart proust application**
   ```bash
   systemctl restart aformulationoftruth
   ```

4. **Verify application functionality**

5. **Troubleshoot Iceland server separately**

---

## Success Criteria

All of the following must be true:

✓ DNS resolves correctly
✓ WireGuard VPN connection stable
✓ TLS certificate valid and auto-renewing
✓ All services running and healthy
✓ End-to-end encryption verified
✓ Automated tests passing
✓ No errors in application logs
✓ Backups configured and tested

---

## Quick Commands Reference

### Iceland Server
```bash
# Service status
systemctl status wg-quick@wg0 gimbal-storage caddy postgresql

# WireGuard status
wg show

# API health
curl http://localhost:3001/health
curl https://gimbal.fobdongle.com/health

# Logs
journalctl -u gimbal-storage -f
journalctl -u caddy -f
tail -f /var/log/caddy/gimbal-access.log

# Restart services
systemctl restart gimbal-storage
systemctl restart caddy
```

### Proust Server
```bash
# WireGuard status
wg show

# Test VPN
ping 10.8.0.1

# Test API
curl https://gimbal.fobdongle.com/health
curl -H "Authorization: Bearer $API_KEY" https://gimbal.fobdongle.com/api/stats

# Application logs
journalctl -u aformulationoftruth -f

# Restart application
systemctl restart aformulationoftruth
```

---

## Support Contacts

- Infrastructure Issues: [Your contact]
- Application Issues: [Your contact]
- Emergency Contact: [Your contact]

---

**Deployment Date**: _______________
**Deployed By**: _______________
**Verified By**: _______________
**Notes**:

_______________________________________________________________

_______________________________________________________________

_______________________________________________________________
