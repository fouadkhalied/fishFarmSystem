import { ValueObject } from '../../../../libs/ddd/value-object.abstract';
import { randomInt } from 'crypto';
import { compare, genSalt, hash } from 'bcryptjs';

interface OTPCodeProps {
  code: string;
  hash?: string;
  expiresAt: Date;
}

export class OTPCode extends ValueObject<OTPCodeProps> {
  private constructor(props: OTPCodeProps) {
    super(props);
  }

  /**
   * Generate a new 6-digit OTP code
   */
  static async generate(): Promise<OTPCode> {
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const codeHash = await hash(code, await genSalt());
    
    return new OTPCode({
      code, // Store plain for immediate use
      hash: codeHash,
      expiresAt,
    });
  }

  /**
   * Create from existing hash (when loading from DB)
   */
  static fromHash(codeHash: string, expiresAt: Date): OTPCode {
    return new OTPCode({
      code: '', // Don't store plain code
      hash: codeHash,
      expiresAt,
    });
  }

  /**
   * Get the plain code (only available immediately after generation)
   */
  getCode(): string {
    return this.props.code;
  }

  /**
   * Get the hashed code
   */
  getHash(): string {
    return this.props.hash || '';
  }

  /**
   * Check if OTP matches submitted code
   */
  async matches(submittedCode: string): Promise<boolean> {
    if (!this.props.hash) return false;
    return await compare(submittedCode, this.props.hash);
  }

  /**
   * Check if OTP has expired
   */
  isExpired(): boolean {
    return new Date() > this.props.expiresAt;
  }

  /**
   * Get expiration time
   */
  getExpiresAt(): Date {
    return this.props.expiresAt;
  }
}