/**
 * Remote Salt Storage Client
 * Communicates with Iceland/Romania/onionhat salt storage API
 *
 * Split-key architecture:
 * - Salts stored on remote server (Iceland/Romania/onionhat)
 * - Encrypted data stored locally (Finland)
 * - Both required for decryption = maximum security
 */

interface RemoteSaltConfig {
  endpoint: string;
  apiKey: string;
  timeout: number;
  retries: number;
}

interface StoreSaltResponse {
  success: boolean;
  saltId?: string;
  error?: string;
  expiresAt?: string;
}

interface RetrieveSaltResponse {
  success: boolean;
  salt?: string;
  purpose?: string;
  metadata?: {
    createdAt: string;
    accessCount: number;
  };
  error?: string;
}

export class RemoteSaltService {
  private config: RemoteSaltConfig;
  private servers: Map<string, RemoteSaltConfig>;
  private currentServer: string;

  constructor() {
    // Support multiple remote servers for redundancy
    this.servers = new Map();

    // Iceland server (primary)
    if (process.env.ICELAND_SALT_ENDPOINT && process.env.ICELAND_SALT_API_KEY) {
      this.servers.set('iceland', {
        endpoint: process.env.ICELAND_SALT_ENDPOINT,
        apiKey: process.env.ICELAND_SALT_API_KEY,
        timeout: 10000,
        retries: 3
      });
    }

    // Romania server (backup)
    if (process.env.ROMANIA_SALT_ENDPOINT && process.env.ROMANIA_SALT_API_KEY) {
      this.servers.set('romania', {
        endpoint: process.env.ROMANIA_SALT_ENDPOINT,
        apiKey: process.env.ROMANIA_SALT_API_KEY,
        timeout: 10000,
        retries: 3
      });
    }

    // Onionhat server (backup)
    if (process.env.ONIONHAT_SALT_ENDPOINT && process.env.ONIONHAT_SALT_API_KEY) {
      this.servers.set('onionhat', {
        endpoint: process.env.ONIONHAT_SALT_ENDPOINT,
        apiKey: process.env.ONIONHAT_SALT_API_KEY,
        timeout: 10000,
        retries: 3
      });
    }

    // Set primary server (prefer Iceland, fallback to others)
    this.currentServer = process.env.PRIMARY_SALT_SERVER || 'iceland';

    const primaryConfig = this.servers.get(this.currentServer);
    if (!primaryConfig && this.servers.size > 0) {
      // Use first available server if primary not found
      this.currentServer = Array.from(this.servers.keys())[0];
      this.config = this.servers.get(this.currentServer)!;
    } else if (primaryConfig) {
      this.config = primaryConfig;
    } else {
      // No remote servers configured - will log warning
      console.warn('⚠️  No remote salt storage servers configured');
      this.config = {
        endpoint: '',
        apiKey: '',
        timeout: 10000,
        retries: 3
      };
    }
  }

  /**
   * Check if remote salt storage is configured
   */
  isConfigured(): boolean {
    return this.servers.size > 0;
  }

  /**
   * Store salt on remote server with automatic failover
   */
  async storeSalt(
    salt: string,
    purpose: 'newsletter' | 'questionnaire' | 'profile',
    metadata?: Record<string, any>,
    expiresInDays?: number
  ): Promise<StoreSaltResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Remote salt storage not configured'
      };
    }

    // Try primary server first, then failover to others
    const serverOrder = [this.currentServer, ...Array.from(this.servers.keys()).filter(s => s !== this.currentServer)];

    for (const serverName of serverOrder) {
      const config = this.servers.get(serverName);
      if (!config) continue;

      try {
        const result = await this.storeOnServer(config, salt, purpose, metadata, expiresInDays);

        if (result.success) {
          console.log(`✅ Salt stored on ${serverName} server: ${result.saltId}`);
          return { ...result, server: serverName } as any;
        }
      } catch (error) {
        console.error(`❌ Failed to store salt on ${serverName}:`, error);
        // Continue to next server
      }
    }

    return {
      success: false,
      error: 'All remote salt servers failed'
    };
  }

  /**
   * Retrieve salt from remote server with automatic failover
   */
  async retrieveSalt(saltId: string, serverHint?: string): Promise<RetrieveSaltResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Remote salt storage not configured'
      };
    }

    // Try hinted server first if provided, otherwise try all servers
    const serverOrder = serverHint && this.servers.has(serverHint)
      ? [serverHint, ...Array.from(this.servers.keys()).filter(s => s !== serverHint)]
      : Array.from(this.servers.keys());

    for (const serverName of serverOrder) {
      const config = this.servers.get(serverName);
      if (!config) continue;

      try {
        const result = await this.retrieveFromServer(config, saltId);

        if (result.success) {
          console.log(`✅ Salt retrieved from ${serverName} server`);
          return result;
        }
      } catch (error) {
        console.error(`❌ Failed to retrieve salt from ${serverName}:`, error);
        // Continue to next server
      }
    }

    return {
      success: false,
      error: 'Salt not found on any remote server'
    };
  }

  /**
   * Delete salt from remote server (for GDPR compliance)
   */
  async deleteSalt(saltId: string, serverHint?: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    const servers = serverHint && this.servers.has(serverHint)
      ? [this.servers.get(serverHint)!]
      : Array.from(this.servers.values());

    let anySuccess = false;

    for (const config of servers) {
      try {
        const response = await fetch(`${config.endpoint}/api/salts/${saltId}`, {
          method: 'DELETE',
          headers: {
            'X-API-Key': config.apiKey,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(config.timeout)
        });

        if (response.ok) {
          anySuccess = true;
        }
      } catch (error) {
        console.error('Salt deletion error:', error);
      }
    }

    return anySuccess;
  }

  /**
   * Store salt on specific server (internal)
   */
  private async storeOnServer(
    config: RemoteSaltConfig,
    salt: string,
    purpose: string,
    metadata?: Record<string, any>,
    expiresInDays?: number
  ): Promise<StoreSaltResponse> {
    const response = await fetch(`${config.endpoint}/api/salts/store`, {
      method: 'POST',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        salt,
        purpose,
        metadata,
        expiresInDays
      }),
      signal: AbortSignal.timeout(config.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Retrieve salt from specific server (internal)
   */
  private async retrieveFromServer(
    config: RemoteSaltConfig,
    saltId: string
  ): Promise<RetrieveSaltResponse> {
    const response = await fetch(`${config.endpoint}/api/salts/${saltId}`, {
      method: 'GET',
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(config.timeout)
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: 'Salt not found'
        };
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Get health status of all remote servers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};

    for (const [name, config] of this.servers.entries()) {
      try {
        const response = await fetch(`${config.endpoint}/api/salts/health`, {
          headers: { 'X-API-Key': config.apiKey },
          signal: AbortSignal.timeout(5000)
        });

        health[name] = response.ok;
      } catch (error) {
        health[name] = false;
      }
    }

    return health;
  }

  /**
   * Get configured server names
   */
  getConfiguredServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /**
   * Get current primary server
   */
  getPrimaryServer(): string {
    return this.currentServer;
  }
}

export const remoteSaltService = new RemoteSaltService();
