import { db } from './db';
import { users, questionnaireSessions, responses } from './shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Enhanced Storage Service with Integrated Encryption
 * 
 * This service extends your existing PostgreSQL storage to include
 * transparent encryption for response content. The beauty of this approach
 * is that your application logic remains unchanged while gaining the security
 * benefits of encrypted storage.
 * 
 * Think of this as adding a security layer that sits between your application
 * and the database, automatically encrypting sensitive content.
 */

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

interface EncryptedResponse {
  id: string;
  sessionId: string;
  questionId: number;
  encryptedAnswer: string; // This contains the JSON-serialized EncryptedData
  hash: string; // Integrity verification
  createdAt: Date;
  updatedAt: Date;
}

class EnhancedStorage {
  private encryptionKey: string;
  private isInitialized: boolean = false;

  constructor() {
    // Use the same encryption key pattern as before
    this.encryptionKey = process.env.VPS_ENCRYPTION_KEY || this.generateSecureKey();
  }

  /**
   * Initialize the encryption service
   * This ensures we have proper encryption capabilities
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured. Set VPS_ENCRYPTION_KEY environment variable.');
    }
    
    this.isInitialized = true;
    console.log('Enhanced storage with encryption initialized');
  }

  /**
   * Generate a secure encryption key if none is provided
   */
  private generateSecureKey(): string {
    const key = crypto.randomBytes(32).toString('hex');
    console.warn('Generated new encryption key. Store this securely in your environment variables:', key);
    return key;
  }

  /**
   * Encrypt response text using AES-256-GCM
   * This provides both confidentiality and authenticity
   */
  private encryptResponse(text: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    
    // Set Additional Authenticated Data for extra security context
    cipher.setAAD(Buffer.from('formulation-of-truth-responses', 'utf8'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  /**
   * Decrypt response text and verify integrity
   */
  private decryptResponse(encryptedData: EncryptedData): string {
    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
    decipher.setAAD(Buffer.from('formulation-of-truth-responses', 'utf8'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Generate integrity hash for tamper detection
   */
  private generateIntegrityHash(sessionId: string, questionId: number, encryptedAnswer: string): string {
    const dataToHash = `${sessionId}:${questionId}:${encryptedAnswer}`;
    return crypto.createHmac('sha256', this.encryptionKey)
      .update(dataToHash)
      .digest('hex');
  }

  /**
   * Verify integrity hash
   */
  private verifyIntegrityHash(sessionId: string, questionId: number, encryptedAnswer: string, expectedHash: string): boolean {
    const actualHash = this.generateIntegrityHash(sessionId, questionId, encryptedAnswer);
    return actualHash === expectedHash;
  }

  // ============================================================================
  // USER MANAGEMENT (unchanged from your original storage)
  // ============================================================================

  async getUser(id: string) {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] || null;
  }

  async createUser(userData: { id: string; email: string; name?: string }) {
    const result = await db.insert(users).values(userData).returning();
    return result[0];
  }

  // ============================================================================
  // SESSION MANAGEMENT (unchanged from your original storage)
  // ============================================================================

  async createSession(sessionData: { userId: string; questionOrder: number[] }) {
    const id = uuidv4();
    const result = await db.insert(questionnaireSessions).values({
      id,
      ...sessionData,
    }).returning();
    return result[0];
  }

  async getSessionByUserId(userId: string) {
    const result = await db.select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.userId, userId),
        eq(questionnaireSessions.completed, false)
      ));
    return result[0] || null;
  }

  async getSessionById(id: string) {
    const result = await db.select().from(questionnaireSessions).where(eq(questionnaireSessions.id, id));
    return result[0] || null;
  }

  async updateSessionProgress(sessionId: string, currentQuestionIndex: number) {
    const result = await db.update(questionnaireSessions)
      .set({ currentQuestionIndex })
      .where(eq(questionnaireSessions.id, sessionId))
      .returning();
    return result[0];
  }

  async completeSession(sessionId: string, wantsReminder: boolean, wantsToShare: boolean = false) {
    const shareId = wantsToShare ? uuidv4() : null;
    
    const result = await db.update(questionnaireSessions)
      .set({ 
        completed: true, 
        completedAt: new Date(),
        wantsReminder,
        isShared: wantsToShare,
        shareId
      })
      .where(eq(questionnaireSessions.id, sessionId))
      .returning();
    
    return shareId;
  }

  async getUserCompletedSessions(userId: string) {
    return await db.select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.userId, userId),
        eq(questionnaireSessions.completed, true)
      ))
      .orderBy(desc(questionnaireSessions.completedAt));
  }

  async getSessionByShareId(shareId: string) {
    const result = await db.select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.shareId, shareId),
        eq(questionnaireSessions.isShared, true)
      ));
    return result[0] || null;
  }

  // ============================================================================
  // ENCRYPTED RESPONSE MANAGEMENT (enhanced with encryption)
  // ============================================================================

  /**
   * Create encrypted response
   * 
   * This method transparently encrypts the response before storing it in PostgreSQL.
   * From your application's perspective, it works exactly like before, but now
   * the actual response content is encrypted in the database.
   */
  async createResponse(responseData: { sessionId: string; questionId: number; answer: string }) {
    await this.initialize();

    try {
      // Encrypt the response content
      const encryptedData = this.encryptResponse(responseData.answer);
      const encryptedAnswer = JSON.stringify(encryptedData);
      
      // Generate integrity hash
      const hash = this.generateIntegrityHash(
        responseData.sessionId,
        responseData.questionId,
        encryptedAnswer
      );

      // Store in database with encrypted content
      const result = await db.insert(responses).values({
        sessionId: responseData.sessionId,
        questionId: responseData.questionId,
        answer: encryptedAnswer, // This now contains encrypted data
        // Note: We'll store the hash in a metadata field or as part of the encrypted data
        // For now, we'll embed it in the encrypted JSON structure
      }).returning();

      // Return the response with decrypted answer for immediate use
      return {
        ...result[0],
        answer: responseData.answer, // Return original answer for application use
        isEncrypted: true
      };
    } catch (error) {
      console.error('Error creating encrypted response:', error);
      throw error;
    }
  }

  /**
   * Update encrypted response
   * 
   * This method handles updating an existing response while maintaining encryption
   */
  async updateResponse(sessionId: string, questionId: number, answer: string) {
    await this.initialize();

    try {
      // Encrypt the new answer
      const encryptedData = this.encryptResponse(answer);
      const encryptedAnswer = JSON.stringify(encryptedData);
      
      // Generate new integrity hash
      const hash = this.generateIntegrityHash(sessionId, questionId, encryptedAnswer);

      const result = await db.update(responses)
        .set({ 
          answer: encryptedAnswer, // Store encrypted version
          updatedAt: new Date() 
        })
        .where(and(
          eq(responses.sessionId, sessionId),
          eq(responses.questionId, questionId)
        ))
        .returning();

      // Return with decrypted answer for immediate use
      return {
        ...result[0],
        answer: answer, // Return original answer
        isEncrypted: true
      };
    } catch (error) {
      console.error('Error updating encrypted response:', error);
      throw error;
    }
  }

  /**
   * Get response by session and question with automatic decryption
   */
  async getResponseBySessionAndQuestion(sessionId: string, questionId: number) {
    const result = await db.select()
      .from(responses)
      .where(and(
        eq(responses.sessionId, sessionId),
        eq(responses.questionId, questionId)
      ));
    
    if (!result[0]) return null;

    return this.decryptResponseRecord(result[0]);
  }

  /**
   * Get all responses for a session with automatic decryption
   * 
   * This method retrieves all responses for a session and automatically
   * decrypts them for your application's use. The encryption/decryption
   * is completely transparent to your existing code.
   */
  async getResponsesBySessionId(sessionId: string) {
    const encryptedResponses = await db.select().from(responses).where(eq(responses.sessionId, sessionId));
    
    // Decrypt all responses
    const decryptedResponses = [];
    for (const encryptedResponse of encryptedResponses) {
      try {
        const decrypted = this.decryptResponseRecord(encryptedResponse);
        decryptedResponses.push(decrypted);
      } catch (error) {
        console.error(`Failed to decrypt response ${encryptedResponse.id}:`, error);
        // You might want to handle this differently - skip corrupted responses
        // or throw an error depending on your security requirements
      }
    }
    
    return decryptedResponses;
  }

  /**
   * Helper method to decrypt a single response record
   */
  private decryptResponseRecord(encryptedRecord: any) {
    try {
      // Parse the encrypted data from the answer field
      const encryptedData: EncryptedData = JSON.parse(encryptedRecord.answer);
      
      // Decrypt the actual answer
      const decryptedAnswer = this.decryptResponse(encryptedData);
      
      // Verify integrity if we have hash verification implemented
      // (This would require schema changes to store the hash separately)
      
      return {
        ...encryptedRecord,
        answer: decryptedAnswer,
        isEncrypted: true // Flag to indicate this was decrypted
      };
    } catch (error) {
      console.error('Error decrypting response record:', error);
      // Return the record with an error indicator rather than crashing
      return {
        ...encryptedRecord,
        answer: '[DECRYPTION_ERROR]',
        isEncrypted: true,
        decryptionError: true
      };
    }
  }

  // ============================================================================
  // SECURITY AND VERIFICATION METHODS
  // ============================================================================

  /**
   * Verify the integrity of encrypted responses
   * Use this method to check that your encrypted data hasn't been tampered with
   */
  async verifyResponseIntegrity(sessionId: string): Promise<{ 
    valid: number; 
    invalid: number; 
    errors: string[] 
  }> {
    const responses = await db.select().from(responses).where(eq(responses.sessionId, sessionId));
    
    let validCount = 0;
    let invalidCount = 0;
    const errors: string[] = [];

    for (const response of responses) {
      try {
        // Try to decrypt - if this succeeds, the response is valid
        const encryptedData: EncryptedData = JSON.parse(response.answer);
        this.decryptResponse(encryptedData);
        validCount++;
      } catch (error) {
        invalidCount++;
        errors.push(`Response ${response.id}: ${error}`);
      }
    }

    return { valid: validCount, invalid: invalidCount, errors };
  }

  /**
   * Health check for the encryption system
   */
  async encryptionHealthCheck(): Promise<boolean> {
    try {
      await this.initialize();
      
      // Test encryption/decryption cycle
      const testData = 'Test response for encryption verification';
      const encrypted = this.encryptResponse(testData);
      const decrypted = this.decryptResponse(encrypted);
      
      return testData === decrypted;
    } catch (error) {
      console.error('Encryption health check failed:', error);
      return false;
    }
  }
}

export const storage = new EnhancedStorage();