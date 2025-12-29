import crypto from 'crypto';
// Note: Using native fetch (Node.js 18+) or could use axios as alternative

interface VPSStorageConfig {
  vpsEndpoint: string;
  apiKey: string;
  encryptionKey: string;
}

interface SecureResponse {
  id: string;
  sessionId: string;
  questionId: number;
  encryptedAnswer: string;
  createdAt: Date;
  hash: string;
}

export class VPSStorageService {
  private config: VPSStorageConfig;
  private isConfigured: boolean;
  
  constructor() {
    this.config = {
      vpsEndpoint: process.env.VPS_ENDPOINT || '',
      apiKey: process.env.VPS_API_KEY || '',
      encryptionKey: process.env.VPS_ENCRYPTION_KEY || ''
    };
    
    // VPS storage is optional - only log if explicitly requested
    this.isConfigured = !!(this.config.vpsEndpoint && this.config.apiKey && this.config.encryptionKey);
  }

  // AES-256-GCM encryption for maximum security
  // Uses scrypt key derivation with per-encryption salt for defense in depth
  private encrypt(text: string): { encrypted: string; iv: string; tag: string; salt: string } {
    // Generate random salt for key derivation (16 bytes)
    const salt = crypto.randomBytes(16);
    // Derive key using scrypt (same parameters as encryptionService)
    const key = crypto.scryptSync(this.config.encryptionKey, salt, 32, { N: 16384, r: 8, p: 1 });
    // 96-bit IV (12 bytes) is recommended for AES-GCM
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('formulation-of-truth', 'utf8'));

    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);

    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      salt: salt.toString('base64')
    };
  }

  private decrypt(encryptedData: { encrypted: string; iv: string; tag: string; salt?: string }): string {
    let key: Buffer;
    let iv: Buffer;
    let encrypted: Buffer;

    if (encryptedData.salt) {
      // New format with per-encryption salt
      const salt = Buffer.from(encryptedData.salt, 'base64');
      key = crypto.scryptSync(this.config.encryptionKey, salt, 32, { N: 16384, r: 8, p: 1 });
      iv = Buffer.from(encryptedData.iv, 'base64');
      encrypted = Buffer.from(encryptedData.encrypted, 'base64');
    } else {
      // Legacy format (hex encoding, static key derivation)
      // Note: Legacy data may not decrypt correctly - this maintains backward compatibility attempt
      key = crypto.scryptSync(this.config.encryptionKey, 'vps_legacy_salt', 32, { N: 16384, r: 8, p: 1 });
      iv = Buffer.from(encryptedData.iv, 'hex');
      encrypted = Buffer.from(encryptedData.encrypted, 'hex');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from('formulation-of-truth', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, encryptedData.salt ? 'base64' : 'hex'));

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  }

  // Generate secure hash for integrity verification
  private generateHash(data: string): string {
    return crypto.createHmac('sha256', this.config.encryptionKey)
      .update(data)
      .digest('hex');
  }

  // Store encrypted response on VPS
  async storeResponse(sessionId: string, questionId: number, answer: string): Promise<boolean> {
    if (!this.isConfigured) {
      return false; // Silently skip if VPS not configured
    }
    
    try {
      const encryptedData = this.encrypt(answer);
      const timestamp = new Date().toISOString();
      
      // Create integrity hash
      const dataToHash = `${sessionId}:${questionId}:${encryptedData.encrypted}:${timestamp}`;
      const hash = this.generateHash(dataToHash);
      
      const payload = {
        sessionId,
        questionId,
        encryptedAnswer: JSON.stringify(encryptedData),
        createdAt: timestamp,
        hash
      };

      const response = await fetch(`${this.config.vpsEndpoint}/api/responses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Client-Version': '1.0.0'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`VPS storage failed: ${response.status} ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('VPS storage error:', error);
      return false;
    }
  }

  // Store complete session on VPS
  async storeSession(sessionData: {
    id: string;
    userId: string;
    questionOrder: number[];
    completed: boolean;
    completedAt?: Date;
    isShared: boolean;
    shareId?: string;
  }): Promise<boolean> {
    try {
      const timestamp = new Date().toISOString();
      const hash = this.generateHash(JSON.stringify(sessionData) + timestamp);
      
      const payload = {
        ...sessionData,
        storedAt: timestamp,
        hash
      };

      const response = await fetch(`${this.config.vpsEndpoint}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Client-Version': '1.0.0'
        },
        body: JSON.stringify(payload)
      });

      return response.ok;
    } catch (error) {
      console.error('VPS session storage error:', error);
      return false;
    }
  }

  // Retrieve and decrypt responses from VPS
  async getResponses(sessionId: string): Promise<Array<{id: string, questionId: number, answer: string}> | null> {
    try {
      const response = await fetch(`${this.config.vpsEndpoint}/api/responses/${sessionId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Client-Version': '1.0.0'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to retrieve responses: ${response.status}`);
      }

      const encryptedResponses = await response.json();
      
      return encryptedResponses.map((encrypted: any) => {
        const encryptedData = JSON.parse(encrypted.encryptedAnswer);
        const decryptedAnswer = this.decrypt(encryptedData);
        
        return {
          id: encrypted.id,
          questionId: encrypted.questionId,
          answer: decryptedAnswer
        };
      });
    } catch (error) {
      console.error('VPS retrieval error:', error);
      return null;
    }
  }

  // Backup complete questionnaire to VPS
  async backupQuestionnaire(sessionId: string): Promise<boolean> {
    try {
      // Get local session and responses
      const session = await import('../storage').then(m => m.storage.getSessionById(sessionId));
      if (!session) return false;

      const responses = await import('../storage').then(m => m.storage.getResponsesBySessionId(sessionId));
      
      // Store session (with proper type casting)
      const sessionStored = await this.storeSession({
        ...session,
        questionOrder: session.questionOrder as number[],
        completedAt: session.completedAt || undefined,
        shareId: session.shareId || undefined
      });
      
      // Store all responses
      const responsePromises = responses.map(response => 
        this.storeResponse(sessionId, response.questionId, response.answer)
      );
      
      const responsesStored = await Promise.all(responsePromises);
      
      return sessionStored && responsesStored.every(Boolean);
    } catch (error) {
      console.error('VPS backup error:', error);
      return false;
    }
  }

  // Health check for VPS connection
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.config.vpsEndpoint}/health`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      return response.ok;
    } catch (error) {
      console.error('VPS health check failed:', error);
      return false;
    }
  }
}

export const vpsStorageService = new VPSStorageService();