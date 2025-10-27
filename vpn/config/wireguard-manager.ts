/**
 * WireGuard VPN Configuration Manager
 * Provides programmatic interface for managing WireGuard VPN configurations
 */

import { execSync, spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Configuration interfaces
export interface WireGuardConfig {
  interface: string;
  port: number;
  serverIP: string;
  network: string;
  configDir: string;
  keysDir: string;
  clientsDir: string;
  logDir: string;
}

export interface ClientConfig {
  name: string;
  ip: string;
  publicKey: string;
  privateKey: string;
  presharedKey: string;
  created: Date;
  status: 'active' | 'disabled' | 'revoked';
}

export interface ClientMetadata {
  name: string;
  ip: string;
  created: string;
  public_key: string;
  status: string;
}

export interface PeerStatus {
  publicKey: string;
  endpoint?: string;
  latestHandshake?: Date;
  transferRx: number;
  transferTx: number;
  persistentKeepalive?: number;
}

/**
 * WireGuard Manager Class
 */
export class WireGuardManager {
  private config: WireGuardConfig;

  constructor(config?: Partial<WireGuardConfig>) {
    this.config = {
      interface: config?.interface || 'wg0',
      port: config?.port || 51820,
      serverIP: config?.serverIP || '10.8.0.1',
      network: config?.network || '10.8.0.0/24',
      configDir: config?.configDir || '/etc/wireguard',
      keysDir: config?.keysDir || '/etc/wireguard/keys',
      clientsDir: config?.clientsDir || '/etc/wireguard/clients',
      logDir: config?.logDir || '/var/log/wireguard'
    };
  }

  /**
   * Initialize WireGuard directories with strict permissions
   */
  async initialize(): Promise<void> {
    const dirs = [
      { path: this.config.configDir, mode: 0o700 },
      { path: this.config.keysDir, mode: 0o700 },
      { path: this.config.clientsDir, mode: 0o750 },
      { path: this.config.logDir, mode: 0o750 },
      { path: path.join(this.config.keysDir, 'clients'), mode: 0o700 }
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir.path, { recursive: true, mode: dir.mode });
    }
  }

  /**
   * Generate cryptographically secure keys
   */
  private async generateKeys(): Promise<{ privateKey: string; publicKey: string; presharedKey: string }> {
    try {
      // Generate private key
      const privateKey = execSync('wg genkey', { encoding: 'utf-8' }).trim();

      // Generate public key from private key
      const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, { encoding: 'utf-8' }).trim();

      // Generate preshared key
      const presharedKey = execSync('wg genpsk', { encoding: 'utf-8' }).trim();

      return { privateKey, publicKey, presharedKey };
    } catch (error) {
      throw new Error(`Failed to generate keys: ${error}`);
    }
  }

  /**
   * Get next available IP address
   */
  async getNextAvailableIP(): Promise<string> {
    const usedIPs: number[] = [];

    try {
      // Read existing clients to find used IPs
      const files = await fs.readdir(this.config.clientsDir);
      const metadataFiles = files.filter(f => f.endsWith('.json'));

      for (const file of metadataFiles) {
        const content = await fs.readFile(
          path.join(this.config.clientsDir, file),
          'utf-8'
        );
        const metadata: ClientMetadata = JSON.parse(content);
        const ipParts = metadata.ip.split('.');
        const lastOctet = parseInt(ipParts[3], 10);
        usedIPs.push(lastOctet);
      }
    } catch (error) {
      // If directory doesn't exist or is empty, start from 2
    }

    // Find next available IP (starting from .2, as .1 is server)
    for (let i = 2; i < 255; i++) {
      if (!usedIPs.includes(i)) {
        return `10.8.0.${i}`;
      }
    }

    throw new Error('No available IP addresses in subnet');
  }

  /**
   * Add a new client
   */
  async addClient(clientName: string, customIP?: string): Promise<ClientConfig> {
    // Validate client name
    if (!/^[a-zA-Z0-9_-]+$/.test(clientName)) {
      throw new Error('Client name must contain only alphanumeric characters, dash, and underscore');
    }

    // Check if client already exists
    const clientConfigPath = path.join(this.config.clientsDir, `${clientName}.conf`);
    try {
      await fs.access(clientConfigPath);
      throw new Error(`Client '${clientName}' already exists`);
    } catch (error) {
      // Client doesn't exist, proceed
    }

    // Get IP address
    const clientIP = customIP || await this.getNextAvailableIP();

    // Generate keys
    const keys = await this.generateKeys();

    // Create client keys directory
    const clientKeysDir = path.join(this.config.keysDir, 'clients', clientName);
    await fs.mkdir(clientKeysDir, { recursive: true, mode: 0o700 });

    // Save keys with strict permissions
    await fs.writeFile(
      path.join(clientKeysDir, 'private.key'),
      keys.privateKey,
      { mode: 0o400 }
    );
    await fs.writeFile(
      path.join(clientKeysDir, 'public.key'),
      keys.publicKey,
      { mode: 0o444 }
    );
    await fs.writeFile(
      path.join(clientKeysDir, 'preshared.key'),
      keys.presharedKey,
      { mode: 0o400 }
    );

    // Create client configuration
    const clientConfig = await this.generateClientConfig(
      clientName,
      clientIP,
      keys.privateKey,
      keys.presharedKey
    );

    // Save client configuration
    await fs.writeFile(clientConfigPath, clientConfig, { mode: 0o600 });

    // Create client metadata
    const metadata: ClientMetadata = {
      name: clientName,
      ip: clientIP,
      created: new Date().toISOString(),
      public_key: keys.publicKey,
      status: 'active'
    };

    await fs.writeFile(
      path.join(this.config.clientsDir, `${clientName}.json`),
      JSON.stringify(metadata, null, 2),
      { mode: 0o640 }
    );

    // Add peer to server configuration
    await this.addPeerToServer(clientName, clientIP, keys.publicKey, keys.presharedKey);

    // Reload WireGuard
    await this.reloadWireGuard();

    return {
      name: clientName,
      ip: clientIP,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      presharedKey: keys.presharedKey,
      created: new Date(),
      status: 'active'
    };
  }

  /**
   * Generate client configuration file content
   */
  private async generateClientConfig(
    clientName: string,
    clientIP: string,
    privateKey: string,
    presharedKey: string
  ): Promise<string> {
    // Read server public key
    const serverPublicKey = await fs.readFile(
      path.join(this.config.keysDir, 'server_public.key'),
      'utf-8'
    );

    // Get server endpoint (public IP)
    const serverEndpoint = await this.getServerEndpoint();

    return `# WireGuard Client Configuration
# Client: ${clientName}
# Generated: ${new Date().toISOString()}

[Interface]
# Client private key
PrivateKey = ${privateKey.trim()}

# Client IP address in VPN
Address = ${clientIP}/24

# DNS servers (VPN server + Cloudflare)
DNS = ${this.config.serverIP}, 1.1.1.1, 1.0.0.1

[Peer]
# Server public key
PublicKey = ${serverPublicKey.trim()}

# Preshared key for post-quantum resistance
PresharedKey = ${presharedKey.trim()}

# Server endpoint
Endpoint = ${serverEndpoint}:${this.config.port}

# Route all traffic through VPN
AllowedIPs = 0.0.0.0/0, ::/0

# Keep connection alive (NAT traversal)
PersistentKeepalive = 25
`;
  }

  /**
   * Get server public endpoint
   */
  private async getServerEndpoint(): Promise<string> {
    try {
      // Try multiple services to get public IP
      const services = [
        'https://ifconfig.me',
        'https://icanhazip.com',
        'https://ipinfo.io/ip'
      ];

      for (const service of services) {
        try {
          const response = execSync(`curl -s -4 ${service}`, { encoding: 'utf-8', timeout: 5000 });
          const ip = response.trim();
          if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
            return ip;
          }
        } catch {
          continue;
        }
      }

      throw new Error('Could not determine public IP');
    } catch (error) {
      return 'YOUR_SERVER_IP';
    }
  }

  /**
   * Add peer to server configuration
   */
  private async addPeerToServer(
    clientName: string,
    clientIP: string,
    publicKey: string,
    presharedKey: string
  ): Promise<void> {
    const serverConfig = path.join(this.config.configDir, `${this.config.interface}.conf`);

    const peerConfig = `
# Client: ${clientName}
# Added: ${new Date().toISOString()}
[Peer]
PublicKey = ${publicKey}
PresharedKey = ${presharedKey}
AllowedIPs = ${clientIP}/32
`;

    await fs.appendFile(serverConfig, peerConfig);
  }

  /**
   * Remove a client
   */
  async removeClient(clientName: string): Promise<void> {
    const clientConfigPath = path.join(this.config.clientsDir, `${clientName}.conf`);
    const clientMetadataPath = path.join(this.config.clientsDir, `${clientName}.json`);
    const clientKeysDir = path.join(this.config.keysDir, 'clients', clientName);

    // Check if client exists
    try {
      await fs.access(clientConfigPath);
    } catch {
      throw new Error(`Client '${clientName}' does not exist`);
    }

    // Read client metadata to get public key
    const metadata = JSON.parse(await fs.readFile(clientMetadataPath, 'utf-8'));

    // Remove peer from server configuration
    await this.removePeerFromServer(metadata.public_key);

    // Archive client files
    await this.archiveClient(clientName);

    // Remove client files
    await fs.unlink(clientConfigPath);
    await fs.unlink(clientMetadataPath);
    await fs.rm(clientKeysDir, { recursive: true, force: true });

    // Reload WireGuard
    await this.reloadWireGuard();
  }

  /**
   * Remove peer from server configuration
   */
  private async removePeerFromServer(publicKey: string): Promise<void> {
    const serverConfig = path.join(this.config.configDir, `${this.config.interface}.conf`);
    const content = await fs.readFile(serverConfig, 'utf-8');

    // Parse and remove peer block
    const lines = content.split('\n');
    const newLines: string[] = [];
    let skipBlock = false;
    let inPeerBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('# Client:')) {
        inPeerBlock = true;
        skipBlock = false;
      }

      if (inPeerBlock && line.includes(`PublicKey = ${publicKey}`)) {
        skipBlock = true;
        // Remove previous lines of this block
        while (newLines.length > 0 && (newLines[newLines.length - 1].startsWith('#') || newLines[newLines.length - 1] === '')) {
          newLines.pop();
        }
        continue;
      }

      if (inPeerBlock && line === '' && skipBlock) {
        skipBlock = false;
        inPeerBlock = false;
        continue;
      }

      if (!skipBlock) {
        newLines.push(line);
      }
    }

    await fs.writeFile(serverConfig, newLines.join('\n'), { mode: 0o600 });
  }

  /**
   * Archive client files
   */
  private async archiveClient(clientName: string): Promise<void> {
    const archiveDir = path.join(this.config.configDir, 'archive');
    await fs.mkdir(archiveDir, { recursive: true, mode: 0o700 });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archiveFile = path.join(archiveDir, `${clientName}_${timestamp}.tar.gz`);

    try {
      execSync(
        `tar -czf "${archiveFile}" -C "${this.config.clientsDir}" "${clientName}.conf" "${clientName}.json" -C "${this.config.keysDir}/clients" "${clientName}"`,
        { stdio: 'ignore' }
      );
      await fs.chmod(archiveFile, 0o600);
    } catch (error) {
      // Archive failed, but continue with removal
    }
  }

  /**
   * List all clients
   */
  async listClients(): Promise<ClientMetadata[]> {
    const clients: ClientMetadata[] = [];

    try {
      const files = await fs.readdir(this.config.clientsDir);
      const metadataFiles = files.filter(f => f.endsWith('.json'));

      for (const file of metadataFiles) {
        const content = await fs.readFile(
          path.join(this.config.clientsDir, file),
          'utf-8'
        );
        clients.push(JSON.parse(content));
      }
    } catch (error) {
      // No clients configured
    }

    return clients;
  }

  /**
   * Get peer status
   */
  async getPeerStatus(): Promise<PeerStatus[]> {
    try {
      const output = execSync(`wg show ${this.config.interface} dump`, { encoding: 'utf-8' });
      const lines = output.trim().split('\n').slice(1); // Skip header

      return lines.map(line => {
        const parts = line.split('\t');
        return {
          publicKey: parts[0],
          endpoint: parts[2] !== '(none)' ? parts[2] : undefined,
          latestHandshake: parts[4] !== '0' ? new Date(parseInt(parts[4]) * 1000) : undefined,
          transferRx: parseInt(parts[5]),
          transferTx: parseInt(parts[6]),
          persistentKeepalive: parts[7] !== 'off' ? parseInt(parts[7]) : undefined
        };
      });
    } catch (error) {
      return [];
    }
  }

  /**
   * Reload WireGuard configuration
   */
  async reloadWireGuard(): Promise<void> {
    try {
      execSync(`wg syncconf ${this.config.interface} <(wg-quick strip ${this.config.interface})`, {
        shell: '/bin/bash',
        stdio: 'ignore'
      });
    } catch (error) {
      throw new Error(`Failed to reload WireGuard: ${error}`);
    }
  }

  /**
   * Check if WireGuard is running
   */
  async isRunning(): Promise<boolean> {
    try {
      execSync(`ip link show ${this.config.interface}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get WireGuard statistics
   */
  async getStatistics(): Promise<{
    totalClients: number;
    onlineClients: number;
    offlineClients: number;
    totalRx: number;
    totalTx: number;
  }> {
    const clients = await this.listClients();
    const peerStatus = await getPeerStatus();

    const onlineClients = peerStatus.length;
    const totalClients = clients.length;

    const totalRx = peerStatus.reduce((sum, peer) => sum + peer.transferRx, 0);
    const totalTx = peerStatus.reduce((sum, peer) => sum + peer.transferTx, 0);

    return {
      totalClients,
      onlineClients,
      offlineClients: totalClients - onlineClients,
      totalRx,
      totalTx
    };
  }
}

// Export utility function
export async function getPeerStatus(interfaceName: string = 'wg0'): Promise<PeerStatus[]> {
  try {
    const output = execSync(`wg show ${interfaceName} dump`, { encoding: 'utf-8' });
    const lines = output.trim().split('\n').slice(1);

    return lines.map(line => {
      const parts = line.split('\t');
      return {
        publicKey: parts[0],
        endpoint: parts[2] !== '(none)' ? parts[2] : undefined,
        latestHandshake: parts[4] !== '0' ? new Date(parseInt(parts[4]) * 1000) : undefined,
        transferRx: parseInt(parts[5]),
        transferTx: parseInt(parts[6]),
        persistentKeepalive: parts[7] !== 'off' ? parseInt(parts[7]) : undefined
      };
    });
  } catch (error) {
    return [];
  }
}
