# Troubleshooting Guide
## Iceland-Proust Encrypted Link

This guide covers common issues and their solutions.

---

## Quick Diagnostics

Run these commands first to gather information:

### Iceland Server
```bash
# Check all services
systemctl status wg-quick@wg0 gimbal-storage caddy postgresql

# Check WireGuard
wg show

# Check ports
ss -tulpn | grep -E '51820|3001|443|5432'

# Check firewall
ufw status

# Test API locally
curl http://localhost:3001/health

# Check logs
journalctl -xe
```

### Proust Server
```bash
# Check WireGuard
wg show
systemctl status wg-quick@wg0

# Test VPN
ping 10.8.0.1

# Test DNS
dig gimbal.fobdongle.is

# Test HTTPS
curl -v https://gimbal.fobdongle.is/health

# Check environment
grep VPS_ /home/runner/aformulationoftruth/.env

# Check application
systemctl status aformulationoftruth
journalctl -u aformulationoftruth -n 50
```

---

## WireGuard VPN Issues

### Issue: WireGuard fails to start

**Symptoms:**
- `systemctl status wg-quick@wg0` shows failed
- Error: "Cannot parse config"

**Solutions:**

1. Check config syntax:
```bash
cat /etc/wireguard/wg0.conf
```

2. Verify keys are valid:
```bash
# On Iceland server
cat /etc/wireguard/keys/server-private.key | wg pubkey
cat /etc/wireguard/keys/server-public.key
# Should match
```

3. Check file permissions:
```bash
ls -la /etc/wireguard/
# wg0.conf should be 600 or 400
```

4. Check kernel module:
```bash
lsmod | grep wireguard
# If not loaded:
modprobe wireguard
```

5. Review systemd logs:
```bash
journalctl -u wg-quick@wg0 -n 50
```

---

### Issue: VPN connection established but no traffic

**Symptoms:**
- `wg show` displays peer but no handshake
- Cannot ping VPN server IP

**Solutions:**

1. Check IP forwarding (Iceland server):
```bash
sysctl net.ipv4.ip_forward
# Should return 1
# If not:
sysctl -w net.ipv4.ip_forward=1
```

2. Verify routing (proust server):
```bash
ip route show
# Should show route to 10.8.0.0/24 via wg0
```

3. Check firewall allows WireGuard:
```bash
# Iceland
ufw status | grep 51820

# Should show:
# 51820/udp ALLOW Anywhere
```

4. Verify endpoint is reachable:
```bash
# From proust
nc -vzu 185.146.234.144 51820
```

5. Check NAT/iptables rules (Iceland):
```bash
iptables -t nat -L POSTROUTING -v
# Should show MASQUERADE rule for wg0
```

---

### Issue: Handshake successful but intermittent drops

**Symptoms:**
- Connection works then stops
- Frequent handshake renegotiation

**Solutions:**

1. Add/verify PersistentKeepalive (proust config):
```ini
[Peer]
...
PersistentKeepalive = 25
```

2. Check for MTU issues:
```bash
# Test with smaller MTU
ip link set dev wg0 mtu 1400
```

3. Verify no network timeout/firewall:
```bash
# Continuous ping test
ping -i 30 10.8.0.1
```

4. Check for port conflicts:
```bash
ss -ulpn | grep 51820
```

---

## HTTPS/TLS Issues

### Issue: Certificate not issued

**Symptoms:**
- `curl https://gimbal.fobdongle.is` fails with certificate error
- Caddy logs show ACME errors

**Solutions:**

1. Verify DNS is correct:
```bash
dig gimbal.fobdongle.is
# Should return 185.146.234.144
```

2. Check firewall allows HTTP (for ACME challenge):
```bash
ufw allow 80/tcp
```

3. Verify domain is accessible externally:
```bash
# From different network
curl http://gimbal.fobdongle.is
```

4. Check Caddy logs:
```bash
journalctl -u caddy -n 100
```

5. Try manual certificate request:
```bash
systemctl stop caddy
caddy run --config /etc/caddy/Caddyfile
# Watch for errors
```

6. Check for rate limiting (Let's Encrypt):
- Visit: https://crt.sh/?q=gimbal.fobdongle.is
- If many recent certificates, wait or use staging

---

### Issue: TLS connection fails

**Symptoms:**
- "SSL_ERROR_BAD_CERT_DOMAIN"
- "Certificate chain incomplete"

**Solutions:**

1. Test certificate:
```bash
openssl s_client -connect gimbal.fobdongle.is:443 -showcerts
```

2. Verify certificate matches domain:
```bash
curl -vI https://gimbal.fobdongle.is 2>&1 | grep -i "subject:"
```

3. Check certificate expiry:
```bash
echo | openssl s_client -connect gimbal.fobdongle.is:443 2>/dev/null | \
  openssl x509 -noout -dates
```

4. Restart Caddy:
```bash
systemctl restart caddy
```

---

## Storage API Issues

### Issue: API not responding

**Symptoms:**
- `curl http://localhost:3001/health` fails
- Service shows as running but not accessible

**Solutions:**

1. Check if service is actually running:
```bash
systemctl status gimbal-storage
ps aux | grep node
```

2. Check if port is listening:
```bash
ss -tlpn | grep 3001
```

3. Review service logs:
```bash
journalctl -u gimbal-storage -n 100
```

4. Test database connection:
```bash
sudo -u postgres psql -d gimbal_storage -c "SELECT 1;"
```

5. Check environment variables:
```bash
systemctl cat gimbal-storage | grep Environment
```

6. Try running manually:
```bash
cd /opt/gimbal-storage
node server.js
# Watch for errors
```

---

### Issue: Database connection errors

**Symptoms:**
- API logs show "database connection failed"
- Health endpoint returns 503

**Solutions:**

1. Verify PostgreSQL is running:
```bash
systemctl status postgresql
```

2. Test connection with provided credentials:
```bash
# Get DATABASE_URL from .env
cat /opt/gimbal-storage/.env | grep DATABASE_URL

# Test connection
psql "postgresql://gimbal:PASSWORD@localhost:5432/gimbal_storage"
```

3. Check PostgreSQL logs:
```bash
tail -f /var/log/postgresql/postgresql-*.log
```

4. Verify database exists:
```bash
sudo -u postgres psql -l | grep gimbal_storage
```

5. Check user permissions:
```bash
sudo -u postgres psql -d gimbal_storage -c "\du gimbal"
```

6. Reinitialize schema:
```bash
cd /opt/gimbal-storage
node db.js
```

---

### Issue: Authentication failures

**Symptoms:**
- API returns 401 or 403
- "Invalid API key" errors

**Solutions:**

1. Verify API_KEY matches on both servers:
```bash
# Iceland
grep API_KEY /opt/gimbal-storage/.env

# Proust
grep VPS_API_KEY /home/runner/aformulationoftruth/.env
```

2. Check header format:
```bash
# Correct format
curl -H "Authorization: Bearer YOUR_KEY_HERE" \
     https://gimbal.fobdongle.is/health
```

3. Verify no extra whitespace in .env:
```bash
cat -A /opt/gimbal-storage/.env | grep API_KEY
# Should not show ^I or extra spaces
```

4. Test with known good key:
```bash
# Get key from summary
grep API_KEY /root/iceland-deployment-summary.txt
```

---

## Encryption Issues

### Issue: Encryption/decryption failures

**Symptoms:**
- "Decryption failed" errors
- "Integrity verification failed"

**Solutions:**

1. Verify ENCRYPTION_KEY matches:
```bash
# Iceland
grep ENCRYPTION_KEY /opt/gimbal-storage/.env

# Proust
grep VPS_ENCRYPTION_KEY /home/runner/aformulationoftruth/.env
```

2. Check key length (must be 64 hex chars):
```bash
grep ENCRYPTION_KEY /opt/gimbal-storage/.env | cut -d= -f2 | wc -c
# Should return 65 (64 + newline)
```

3. Review API logs for specific error:
```bash
journalctl -u gimbal-storage | grep -i encrypt
```

4. Test encryption directly:
```bash
cd /opt/gimbal-storage
node -e "
const Enc = require('./encryption');
const enc = new Enc('$(grep ENCRYPTION_KEY .env | cut -d= -f2)');
const test = enc.encrypt('test');
console.log('Encrypted:', test);
const dec = enc.decrypt(test.iv, test.encrypted, test.tag);
console.log('Decrypted:', dec);
"
```

---

## Application Integration Issues

### Issue: Proust not backing up to gimbal

**Symptoms:**
- Questionnaire completes but no backup
- No errors visible in proust logs

**Solutions:**

1. Verify VPS environment variables set:
```bash
grep "^VPS_" /home/runner/aformulationoftruth/.env
# Should show:
# VPS_ENDPOINT=https://gimbal.fobdongle.is
# VPS_API_KEY=...
# VPS_ENCRYPTION_KEY=...
```

2. Check application loaded variables:
```bash
# Restart to reload .env
systemctl restart aformulationoftruth

# Check if process sees vars (if applicable)
cat /proc/$(pgrep -f "aformulationoftruth")/environ | tr '\0' '\n' | grep VPS
```

3. Test manual backup:
```bash
# From proust server
curl -X POST \
  -H "Authorization: Bearer $VPS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-123",
    "questionId": "q1",
    "answer": "test",
    "timestamp": '$(date +%s)'
  }' \
  https://gimbal.fobdongle.is/api/responses
```

4. Review proust application logs:
```bash
journalctl -u aformulationoftruth -n 200 | grep -i vps
```

5. Check for network issues:
```bash
# From proust
curl -v https://gimbal.fobdongle.is/health
```

---

## Performance Issues

### Issue: Slow API responses

**Symptoms:**
- Requests timing out
- High latency

**Solutions:**

1. Check system resources:
```bash
# CPU and memory
top
htop

# Disk I/O
iostat -x 1

# Network
iftop
```

2. Check database performance:
```bash
sudo -u postgres psql -d gimbal_storage -c "
SELECT * FROM pg_stat_activity WHERE datname = 'gimbal_storage';
"
```

3. Review slow queries:
```bash
# Enable slow query logging if needed
```

4. Check for rate limiting:
```bash
# Look for 429 responses in Caddy logs
tail -f /var/log/caddy/gimbal-access.log | grep 429
```

5. Monitor WireGuard bandwidth:
```bash
watch -n 1 wg show wg0
```

---

## DNS Issues

### Issue: DNS not resolving

**Symptoms:**
- `dig gimbal.fobdongle.is` returns NXDOMAIN
- Cannot reach domain by name

**Solutions:**

1. Check DNS propagation:
```bash
# Try different DNS servers
dig @8.8.8.8 gimbal.fobdongle.is
dig @1.1.1.1 gimbal.fobdongle.is
```

2. Check authoritative nameservers:
```bash
dig NS fobdongle.com
dig @ns1.fobdongle.com gimbal.fobdongle.is
```

3. Verify A record:
```bash
dig A gimbal.fobdongle.is +short
# Should return: 185.146.234.144
```

4. Clear local DNS cache:
```bash
# Linux
sudo systemd-resolve --flush-caches

# Or
sudo resolvectl flush-caches
```

5. Test from external resolver:
- Visit: https://www.whatsmydns.net/
- Enter: gimbal.fobdongle.is

---

## Emergency Procedures

### Complete service restart (Iceland)

```bash
systemctl stop gimbal-storage caddy wg-quick@wg0
systemctl start wg-quick@wg0
systemctl start gimbal-storage
systemctl start caddy

# Verify
systemctl status wg-quick@wg0 gimbal-storage caddy
```

### Complete service restart (Proust)

```bash
systemctl stop aformulationoftruth wg-quick@wg0
systemctl start wg-quick@wg0
systemctl start aformulationoftruth

# Verify
systemctl status wg-quick@wg0 aformulationoftruth
```

### Reset WireGuard connection

```bash
# Proust server
wg-quick down wg0
wg-quick up wg0

# Verify
wg show
ping 10.8.0.1
```

### Database recovery

```bash
# Restore from backup
sudo -u postgres psql gimbal_storage < /root/backups/gimbal-YYYYMMDD.sql

# Or reinitialize
sudo -u postgres dropdb gimbal_storage
sudo -u postgres createdb gimbal_storage
sudo -u postgres psql -c "GRANT ALL ON DATABASE gimbal_storage TO gimbal;"
cd /opt/gimbal-storage
node db.js
```

---

## Getting Help

### Collect diagnostic information

Run this on both servers and save output:

```bash
#!/bin/bash
echo "=== System Info ==="
uname -a
uptime

echo "=== Service Status ==="
systemctl status wg-quick@wg0 gimbal-storage caddy postgresql 2>&1

echo "=== WireGuard ==="
wg show

echo "=== Network ==="
ip addr
ip route
ss -tulpn

echo "=== Firewall ==="
ufw status

echo "=== Recent Logs ==="
journalctl -xe --no-pager -n 100

echo "=== Disk Space ==="
df -h

echo "=== Memory ==="
free -h
```

### Log locations

- WireGuard: `journalctl -u wg-quick@wg0`
- Storage API: `journalctl -u gimbal-storage`
- Caddy: `journalctl -u caddy` and `/var/log/caddy/`
- PostgreSQL: `/var/log/postgresql/`
- Proust App: `journalctl -u aformulationoftruth`

---

## Still Having Issues?

1. Review deployment summary: `/root/iceland-deployment-summary.txt`
2. Check [MANUAL_DEPLOYMENT.md](MANUAL_DEPLOYMENT.md) for step-by-step guidance
3. Run test suite: `bash scripts/test-encrypted-link.sh`
4. Review system logs: `journalctl -xe`
5. Create detailed bug report with logs and diagnostic output
