# NetBird Access Control Configuration

## VPS → Home Laptop Connection

### Access Control Policy Settings:
- **Protocol**: TCP
- **Source**: All (or specify VPS NetBird IP)
- **Destination Ports**: 22, 80, 443, 5000, 5432
- **Policy**: Enabled

### Security Principles (aligned with Kaula Shaivism's svatantryā - autonomous freedom):
Just as consciousness (cit) operates with complete independence, our network access should be:
1. **Intentional** - specific port access (not "All")
2. **Aware** - monitored connections
3. **Sovereign** - controlled by you, not default settings

### Ports by Service:
- 22: SSH access
- 80/443: Web application (frontend/backend)
- 5000: Express server (as per server.js)
- 5432: PostgreSQL (if using DB_URL)
