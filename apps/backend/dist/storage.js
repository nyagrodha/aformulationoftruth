// ─────────────────────────────────────────────────────────────
// SECTION: imports (top of file)
// ─────────────────────────────────────────────────────────────
import { db } from './db.js';
import { users, questionnaireSessions, responses as responsesTable, } from './shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
class EnhancedStorage {
    encryptionKey;
    isInitialized = false;
    constructor() {
        const envKey = process.env.VPS_ENCRYPTION_KEY?.trim();
        this.encryptionKey = envKey && envKey.length > 0
            ? envKey
            : EnhancedStorage.generateSecureKey();
    }
    static generateSecureKey() {
        const key = crypto.randomBytes(32).toString('hex');
        console.warn('[storage] Generated DEV encryption key. Store VPS_ENCRYPTION_KEY securely:', key);
        return key;
    }
    // ───────────────────────────────────────────────────────────
    // SECTION: one-time init
    // ───────────────────────────────────────────────────────────
    async initialize() {
        if (this.isInitialized)
            return;
        if (!this.encryptionKey) {
            throw new Error('Encryption key not configured. Set VPS_ENCRYPTION_KEY.');
        }
        this.isInitialized = true;
        console.log('[storage] encryption initialized');
    }
    // ───────────────────────────────────────────────────────────
    // SECTION: key helpers (exactly ONE getKey)
    // ───────────────────────────────────────────────────────────
    getKey() {
        const raw = this.encryptionKey.trim();
        // Accept base64 or hex; else utf8 padded/trimmed to 32 bytes (dev)
        if (raw.startsWith('hex:')) {
            const h = raw.slice(4);
            const buf = Buffer.from(h, 'hex');
            if (buf.length !== 32)
                throw new Error('hex key must be 32 bytes (64 hex chars).');
            return buf;
        }
        if (/^[0-9a-fA-F]{64}$/.test(raw))
            return Buffer.from(raw, 'hex');
        if (/^[A-Za-z0-9+/=]{43,}$/.test(raw)) {
            const buf = Buffer.from(raw, 'base64');
            if (buf.length === 32)
                return buf;
        }
        const utf8 = Buffer.from(raw, 'utf8');
        if (utf8.length < 32) {
            return Buffer.concat([utf8, crypto.randomBytes(32 - utf8.length)]).subarray(0, 32);
        }
        return utf8.subarray(0, 32);
    }
    // ───────────────────────────────────────────────────────────
    // SECTION: crypto (AES-256-GCM with 12-byte IV)
    // ───────────────────────────────────────────────────────────
    encryptResponse(plain) {
        const key = this.getKey();
        const iv = crypto.randomBytes(12); // 96-bit IV per GCM guidance
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        cipher.setAAD(Buffer.from('formulation-of-truth-responses', 'utf8'));
        const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return {
            encrypted: enc.toString('base64'),
            iv: iv.toString('base64'),
            tag: tag.toString('base64'),
        };
    }
    decryptResponse(payload) {
        const key = this.getKey();
        const iv = Buffer.from(payload.iv, 'base64');
        const tag = Buffer.from(payload.tag, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAAD(Buffer.from('formulation-of-truth-responses', 'utf8'));
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([
            decipher.update(Buffer.from(payload.encrypted, 'base64')),
            decipher.final(),
        ]);
        return dec.toString('utf8');
    }
    // Optional: HMAC for extra integrity (over the already-authed ciphertext)
    generateIntegrityHash(sessionId, questionId, encryptedAnswer) {
        return crypto
            .createHmac('sha256', this.getKey())
            .update(`${sessionId}:${questionId}:${encryptedAnswer}`)
            .digest('hex');
    }
    // ───────────────────────────────────────────────────────────
    // SECTION: Users (unchanged)
    // ───────────────────────────────────────────────────────────
    async getUser(id) {
        const rows = await db.select().from(users).where(eq(users.id, id));
        return rows[0] || null;
    }
    async createUser(userData) {
        const rows = await db.insert(users).values(userData).returning();
        return rows[0];
    }
    // ───────────────────────────────────────────────────────────
    // SECTION: Sessions (unchanged)
    // ───────────────────────────────────────────────────────────
    async createSession(sessionData) {
        const id = uuidv4();
        const rows = await db
            .insert(questionnaireSessions)
            .values({ id, ...sessionData })
            .returning();
        return rows[0];
    }
    async getSessionByUserId(userId) {
        const rows = await db
            .select()
            .from(questionnaireSessions)
            .where(and(eq(questionnaireSessions.userId, userId), eq(questionnaireSessions.completed, false)));
        return rows[0] || null;
    }
    async getSessionById(id) {
        const rows = await db
            .select()
            .from(questionnaireSessions)
            .where(eq(questionnaireSessions.id, id));
        return rows[0] || null;
    }
    async updateSessionProgress(sessionId, currentQuestionIndex) {
        const rows = await db
            .update(questionnaireSessions)
            .set({ currentQuestionIndex })
            .where(eq(questionnaireSessions.id, sessionId))
            .returning();
        return rows[0];
    }
    async completeSession(sessionId, wantsReminder, wantsToShare = false) {
        const shareId = wantsToShare ? uuidv4() : null;
        await db
            .update(questionnaireSessions)
            .set({
            completed: true,
            completedAt: new Date(),
            wantsReminder,
            isShared: wantsToShare,
            shareId,
        })
            .where(eq(questionnaireSessions.id, sessionId))
            .returning();
        return shareId;
    }
    async getUserCompletedSessions(userId) {
        return db
            .select()
            .from(questionnaireSessions)
            .where(and(eq(questionnaireSessions.userId, userId), eq(questionnaireSessions.completed, true)))
            .orderBy(desc(questionnaireSessions.completedAt));
    }
    async getSessionByShareId(shareId) {
        const rows = await db
            .select()
            .from(questionnaireSessions)
            .where(and(eq(questionnaireSessions.shareId, shareId), eq(questionnaireSessions.isShared, true)));
        return rows[0] || null;
    }
    // ───────────────────────────────────────────────────────────
    // SECTION: Encrypted responses
    // ───────────────────────────────────────────────────────────
    async createResponse(input) {
        await this.initialize();
        const enc = this.encryptResponse(input.answer);
        const encryptedAnswer = JSON.stringify(enc);
        // const hash = this.generateIntegrityHash(input.sessionId, input.questionId, encryptedAnswer)
        const rows = await db
            .insert(responsesTable)
            .values({
            sessionId: input.sessionId,
            questionId: input.questionId,
            answer: encryptedAnswer, // store encrypted JSON blob
        })
            .returning();
        return {
            ...rows[0],
            answer: input.answer,
            isEncrypted: true,
        };
    }
    async updateResponse(sessionId, questionId, answer) {
        await this.initialize();
        const enc = this.encryptResponse(answer);
        const encryptedAnswer = JSON.stringify(enc);
        const rows = await db
            .update(responsesTable)
            .set({ answer: encryptedAnswer, updatedAt: new Date() })
            .where(and(eq(responsesTable.sessionId, sessionId), eq(responsesTable.questionId, questionId)))
            .returning();
        return {
            ...rows[0],
            answer,
            isEncrypted: true,
        };
    }
    async getResponseBySessionAndQuestion(sessionId, questionId) {
        const rows = await db
            .select()
            .from(responsesTable)
            .where(and(eq(responsesTable.sessionId, sessionId), eq(responsesTable.questionId, questionId)));
        if (!rows[0])
            return null;
        return this.decryptResponseRecord(rows[0]);
    }
    async getResponsesBySessionId(sessionId) {
        const respRows = await db
            .select()
            .from(responsesTable)
            .where(eq(responsesTable.sessionId, sessionId));
        const out = [];
        for (const row of respRows) {
            try {
                out.push(this.decryptResponseRecord(row));
            }
            catch (err) {
                console.error(`[storage] decrypt failed for response ${row.id}:`, err);
                out.push({
                    ...row,
                    answer: '[DECRYPTION_ERROR]',
                    isEncrypted: true,
                    decryptionError: true,
                });
            }
        }
        return out;
    }
    // Centralized, safe decryptor used by both getters
    decryptResponseRecord(record) {
        const raw = record.answer ?? null;
        const enc = raw ? JSON.parse(raw) : null;
        if (!enc) {
            return {
                ...record,
                answer: null,
                isEncrypted: true,
            };
        }
        try {
            const dec = this.decryptResponse(enc);
            return {
                ...record,
                answer: dec,
                isEncrypted: true,
            };
        }
        catch {
            return {
                ...record,
                answer: '[DECRYPTION_ERROR]',
                isEncrypted: true,
                decryptionError: true,
            };
        }
    }
    // ───────────────────────────────────────────────────────────
    // SECTION: Security diagnostics
    // ───────────────────────────────────────────────────────────
    async verifyResponseIntegrity(sessionId) {
        const respRows = await db
            .select()
            .from(responsesTable)
            .where(eq(responsesTable.sessionId, sessionId));
        let valid = 0;
        let invalid = 0;
        const errors = [];
        for (const row of respRows) {
            try {
                const raw = (row.answer ?? null);
                if (!raw) {
                    invalid++;
                    errors.push(`response ${row.id}: answer is null`);
                    continue;
                }
                const enc = JSON.parse(raw);
                // GCM auth will throw if tampered:
                this.decryptResponse(enc);
                valid++;
            }
            catch (e) {
                invalid++;
                errors.push(`response ${row.id}: ${e?.message ?? String(e)}`);
            }
        }
        return { valid, invalid, errors };
    }
    async encryptionHealthCheck() {
        await this.initialize();
        const probe = 'Test response for encryption verification';
        const enc = this.encryptResponse(probe);
        const dec = this.decryptResponse(enc);
        return probe === dec;
    }
} // <— end of class
// ─────────────────────────────────────────────────────────────
// SECTION: exports (top-level, outside the class)
// ─────────────────────────────────────────────────────────────
const storageInstance = new EnhancedStorage();
export const storage = storageInstance;
export default storageInstance;
//# sourceMappingURL=storage.js.map