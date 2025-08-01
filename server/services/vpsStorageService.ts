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
  private encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.config.encryptionKey);
    cipher.setAAD(Buffer.from('formulation-of-truth', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  private decrypt(encryptedData: { encrypted: string; iv: string; tag: string }): string {
    const decipher = crypto.createDecipher('aes-256-gcm', this.config.encryptionKey);
    decipher.setAAD(Buffer.from('formulation-of-truth', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
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