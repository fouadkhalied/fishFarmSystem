import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountLockedEvent } from '../../../domain/event/account-locked.event';
import { EMAIL_SERVICE } from '../../../../communication/communication.tokens';
import { EmailService } from '../../../../communication/application/service/email.service.interface';

@Injectable()
export class AccountLockedHandler implements OnModuleInit {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.eventEmitter.on('account.locked', (event: AccountLockedEvent) => {
      this.handle(event);
    });
  }

  async handle(event: AccountLockedEvent): Promise<void> {
    const { userId, reason, recipient, deliveryMethod, resetToken } = event.payload;

    try {
      if (deliveryMethod === 'EMAIL') {
        await this.emailService.sendAccountLockedEmail(userId , reason , recipient, resetToken);
        console.log(`[AccountLockedHandler] Account locked email sent to ${recipient}`);
      } else if (deliveryMethod === 'SMS') {
        // TODO: Implement SMS sending
        console.log(`[AccountLockedHandler] SMS sending not implemented yet for ${recipient}`);
      } else {
        console.error(`[AccountLockedHandler] Unknown delivery method: ${deliveryMethod}`);
      }
    } catch (error) {
      console.error(`[AccountLockedHandler] Failed to send account locked notification to ${recipient}:`, error);
      // TODO: Consider implementing retry logic or dead letter queue
    }
  }
}