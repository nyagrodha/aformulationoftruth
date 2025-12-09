# NetBird Access Control Configuration

## VPS → Home Laptop Connection

### Access Control Policy Settings:
- **Protocol**: TCP
- **Source**: All (or specify VPS NetBird IP)
- **Destination Ports**: 22, 80, 443, 5000, 5432
- **Policy**: Enabled

Establish the encrypted NetBird/WireGuard tunnel to the Iceland gateway (`VPN_INTERFACE` defaults to `wg0`) before running any application services. The backend validates that the interface is active at startup to guarantee that database traffic to `gimbal.fobdongle.com:5432` transits the VPN.

### Security Principles (aligned with Kaula Shaivism's svatantryā - autonomous freedom):
Just as consciousness (cit) operates with complete independence, our network access should be:
1. **Intentional** - specific port access (not "All")
2. **Aware** - monitored connections
3. **Sovereign** - controlled by you, not default settings

### Ports by Service:
- 22: SSH access
- 443: Web application (frontend/backend)
- 5432: PostgreSQL on `gimbal.fobdongle.com` (TLS enforced with `sslmode=require`)
