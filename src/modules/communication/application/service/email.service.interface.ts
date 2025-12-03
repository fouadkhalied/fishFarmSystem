export interface EmailService {

  sendWelcomeEmail(email: string): Promise<void>;

  sendOTPEmail(email: string, code: string): Promise<void>;

  sendPasswordResetEmail(email: string, resetToken: string): Promise<void>;

  sendAccountLockedEmail(userId: string, reason: string, recipient: string, resetToken: string): Promise<void>;
}
