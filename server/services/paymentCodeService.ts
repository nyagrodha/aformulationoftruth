import crypto from 'crypto';

export class PaymentCodeService {
  /**
   * Generate a unique payment code in format: A4OT-XXXX-XXXX
   */
  generateCode(): string {
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    const part1 = randomPart.substring(0, 4);
    const part2 = randomPart.substring(4, 8);
    return `A4OT-${part1}-${part2}`;
  }

  /**
   * Calculate expiration date (7 days from now)
   */
  getExpirationDate(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  }

  /**
   * Validate payment code format
   */
  isValidCodeFormat(code: string): boolean {
    return /^A4OT-[A-F0-9]{4}-[A-F0-9]{4}$/.test(code);
  }
}

export const paymentCodeService = new PaymentCodeService();
