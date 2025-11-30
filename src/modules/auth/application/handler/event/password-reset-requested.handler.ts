import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PasswordResetRequestedEvent } from '../../../domain/event/password-reset-requested.event';
import { EMAIL_SERVICE } from '../../../../communication/communication.tokens';
import { EmailService } from '../../../../communication/application/service/email.service.interface';

@Injectable()
export class PasswordResetRequestedHandler implements OnModuleInit {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.eventEmitter.on('password.reset.requested', (event: PasswordResetRequestedEvent) => {
      this.handle(event);
    });
  }

  async handle(event: PasswordResetRequestedEvent): Promise<void> {
    const { resetToken, deliveryMethod, recipient } = event.payload;

    try {
      if (deliveryMethod === 'EMAIL') {
        await this.emailService.sendPasswordResetEmail(recipient, resetToken);
        console.log(`[PasswordResetRequestedHandler] Password reset email sent to ${recipient}`);
      } else if (deliveryMethod === 'SMS') {
        // TODO: Implement SMS sending
        console.log(`[PasswordResetRequestedHandler] SMS sending not implemented yet for ${recipient}`);
      } else {
        console.error(`[PasswordResetRequestedHandler] Unknown delivery method: ${deliveryMethod}`);
      }
    } catch (error) {
      console.error(`[PasswordResetRequestedHandler] Failed to send password reset to ${recipient}:`, error);
      // TODO: Consider implementing retry logic or dead letter queue
    }
  }
}
