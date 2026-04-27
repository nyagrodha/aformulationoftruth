import crypto from 'crypto';
import { encryptionService } from './encryptionService';

const MIN_COOLDOWN_DAYS = 66;
const MAX_COOLDOWN_DAYS = 132;

export class CooldownService {
  getUserHash(userId: string): string {
    return encryptionService.generateHash(userId);
  }

  generateCooldownDays(): number {
    const range = MAX_COOLDOWN_DAYS - MIN_COOLDOWN_DAYS;
    return MIN_COOLDOWN_DAYS + crypto.randomInt(0, range + 1);
  }

  createCommitment(userId: string) {
    const userHash = this.getUserHash(userId);
    const cooldownDays = this.generateCooldownDays();
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + cooldownDays);

    const encrypted = encryptionService.encrypt(expiryDate.toISOString());

    return {
      userHash,
      encryptedExpiry: encrypted.encrypted,
      iv: encrypted.iv,
      tag: encrypted.tag,
      salt: encrypted.salt,
      cooldownDays,
      expiryDate,
    };
  }

  checkCooldown(commitment: {
    encryptedExpiry: string;
    iv: string;
    tag: string;
    salt: string;
    createdAt: Date;
  }): { onCooldown: boolean; daysRemaining: number; cooldownDays: number; expiryDate: Date } {
    const expiryStr = encryptionService.decrypt({
      encrypted: commitment.encryptedExpiry,
      iv: commitment.iv,
      tag: commitment.tag,
      salt: commitment.salt,
    });
    const expiryDate = new Date(expiryStr);
    const now = new Date();
    const onCooldown = now < expiryDate;
    const msPerDay = 24 * 60 * 60 * 1000;
    const daysRemaining = onCooldown
      ? Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay)
      : 0;
    const cooldownDays = Math.round(
      (expiryDate.getTime() - commitment.createdAt.getTime()) / msPerDay
    );

    return { onCooldown, daysRemaining, cooldownDays, expiryDate };
  }
}

export const cooldownService = new CooldownService();
