
import { OTPCode } from '../value-object/otp-code.value-object';

export interface OTPProps {
  userId: string;
  code: OTPCode;
  deliveryMethod: 'EMAIL' | 'SMS' | 'PUSH';
  failedAttempts: number;
  invalidated: boolean;
}

export class OTP {
  id: string;
  props: OTPProps;

  constructor(id: string, props: OTPProps) {
    this.id = id;
    this.props = props;
  }

  /**
   * Validate the submitted OTP code
   */
  async validate(submittedCode: string): Promise<boolean> {
    if (this.props.invalidated) {
      throw new Error('OTP has been invalidated');
    }

    if (this.props.code.isExpired()) {
      throw new Error('OTP has expired');
    }

    if (this.props.failedAttempts >= 3) {
      throw new Error('Maximum verification attempts reached');
    }

    const matches = await this.props.code.matches(submittedCode);

    if (!matches) {
      this.props.failedAttempts++;
      return false;
    }

    // Mark OTP as invalidated after successful validation
    this.invalidate();
    return true;
  }

  /**
   * Mark OTP as invalidated (after successful use)
   */
  invalidate(): void {
    this.props.invalidated = true;
  }

  /**
   * Check if max attempts reached
   */
  isMaxAttemptsReached(): boolean {
    return this.props.failedAttempts >= 3;
  }
}