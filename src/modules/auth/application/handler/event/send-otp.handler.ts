
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OTPRequestedEvent } from '../../../domain/event/otp-requested.event';
import { EmailService } from '../../../../communication/application/service/email.service.interface';
import { EMAIL_SERVICE } from '../../../../communication/communication.tokens';

@Injectable()
export class SendOTPHandler implements OnModuleInit {
  constructor(
    private readonly eventEmitter: EventEmitter2,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
  ) {}

  onModuleInit() {
    this.eventEmitter.on('otp.requested', (event: OTPRequestedEvent) => {
      this.handle(event);
    });
  }

  async handle(event: OTPRequestedEvent): Promise<void> {
    const { otpCode, recipient, deliveryMethod } = event.payload;

    if (deliveryMethod === 'EMAIL') {
      await this.emailService.sendOTPEmail(recipient, otpCode);
    } else if (deliveryMethod === 'SMS') {
      // TODO: Implement SMS service
      console.log(`Sending OTP via SMS to ${recipient}: ${otpCode}`);
    }
  }
}
