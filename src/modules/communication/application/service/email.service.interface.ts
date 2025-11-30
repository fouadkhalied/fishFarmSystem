export interface EmailService {

  sendWelcomeEmail(email: string): Promise<void>;

  sendOTPEmail(email: string, code: string): Promise<void>;

  sendPasswordResetEmail(email: string, resetToken: string): Promise<void>;
}
