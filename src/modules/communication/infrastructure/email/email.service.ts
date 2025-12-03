import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailService } from '../../application/service/email.service.interface';

@Injectable()
export class EmailServiceImpl implements EmailService {
  private resend: Resend;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('EMAIL_API_KEY');
    if (!apiKey) {
      throw new Error('EMAIL_API_KEY environment variable is required');
    }
    this.resend = new Resend(apiKey);
  }

  async sendWelcomeEmail(email: string): Promise<void> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: 'FishFarm <noreply@onboarding@resend.dev>', // Replace with your verified domain
        to: [email],
        subject: 'Welcome to FishFarm System!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Welcome to FishFarm System!</h1>
            <p>Thank you for joining our platform. Your account has been successfully created.</p>
            <p>You can now access all features of our fish farming management system.</p>
            <div style="margin: 30px 0;">
              <a href="${this.configService.get<string>('FRONTEND_URL', 'https://yourapp.com')}/login"
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Get Started
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              If you have any questions, please contact our support team.
            </p>
          </div>
        `,
      });

      if (error) {
        console.error('[EmailService] Failed to send welcome email:', error);
        throw new Error(`Failed to send welcome email: ${error.message}`);
      }

      console.log(`[EmailService] Welcome email sent successfully to ${email}`, data);
    } catch (error) {
      console.error('[EmailService] Error sending welcome email:', error);
      throw error;
    }
  }

  async sendOTPEmail(email: string, code: string): Promise<void> {
    try {
      const { data, error } = await this.resend.emails.send({
        from: 'onboarding@resend.dev', // Replace with your verified domain
        to: [email],
        subject: 'Your OTP Code - FishFarm System',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Your Verification Code</h1>
            <p>You requested a verification code for your FishFarm account.</p>
            <div style="background-color: #f3f4f6; border: 2px dashed #d1d5db; padding: 20px; margin: 20px 0; text-align: center;">
              <h2 style="color: #1f2937; font-size: 32px; margin: 0; letter-spacing: 8px;">${code}</h2>
            </div>
            <p style="color: #6b7280;">
              This code will expire in 5 minutes. Please use it immediately.
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        `,
      });

      if (error) {
        console.error('[EmailService] Failed to send OTP email:', error);
        throw new Error(`Failed to send OTP email: ${error.message}`);
      }

      console.log(`[EmailService] OTP email sent successfully to ${email}`, data);
    } catch (error) {
      console.error('[EmailService] Error sending OTP email:', error);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    try {
      const resetLink = `${this.configService.get<string>('FRONTEND_URL', 'https://yourapp.com')}/reset-password?token=${resetToken}`;

      const { data, error } = await this.resend.emails.send({
        from: 'onboarding@resend.dev', // Replace with your verified domain
        to: [email],
        subject: 'Reset Your FishFarm Password',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #2563eb;">Reset Your Password</h1>
            <p>You requested a password reset for your FishFarm account.</p>
            <p>Click the button below to reset your password. This link will expire in 30 minutes.</p>
            <div style="margin: 30px 0;">
              <a href="${resetLink}"
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Reset Password
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't request this password reset, please ignore this email.
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              For security reasons, this link will expire in 30 minutes.
            </p>
          </div>
        `,
      });

      if (error) {
        console.error('[EmailService] Failed to send password reset email:', error);
        throw new Error(`Failed to send password reset email: ${error.message}`);
      }

      console.log(`[EmailService] Password reset email sent successfully to ${email}`, data);
    } catch (error) {
      console.error('[EmailService] Error sending password reset email:', error);
      throw error;
    }
  }

  async sendAccountLockedEmail(userId: string , reason: string, recipient: string, resetToken: string): Promise<void> {
    try {
      const resetLink = `${this.configService.get<string>('FRONTEND_URL', 'https://yourapp.com')}/reset-password?token=${resetToken}`;
  
      const { data, error } = await this.resend.emails.send({
        from: 'onboarding@resend.dev', // Replace with your verified domain
        to: [recipient],
        subject: 'Your FishFarm Account Has Been Locked',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #dc2626;">Account Locked</h1>
            <p>Your FishFarm account has been locked due ${reason}</p>
            <p>For security reasons, you must reset your password to regain access to your account.</p>
            <div style="margin: 30px 0;">
              <a href="${resetLink}"
                 style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
                Reset Password & Unlock Account
              </a>
            </div>
            <p style="color: #6b7280; font-size: 14px;">
              If you didn't attempt to log in, your account may be at risk. Please reset your password immediately.
            </p>
            <p style="color: #6b7280; font-size: 14px;">
              For security reasons, this link will expire in 30 minutes.
            </p>
          </div>
        `,
      });
  
      if (error) {
        console.error('[EmailService] Failed to send account locked email:', error);
        throw new Error(`Failed to send account locked email: ${error.message}`);
      }
  
      console.log(`[EmailService] Account ${userId} locked email sent successfully to ${recipient}`, data);
    } catch (error) {
      console.error('[EmailService] Error sending account locked email:', error);
      throw error;
    }
  }
}
