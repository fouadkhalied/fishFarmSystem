
import { DomainEvent } from '../../../../libs/ddd/domain-event.abstract';
import { IEvent } from '@nestjs/cqrs';

export interface OTPRequestedPayload {
  userId: string;
  otpCode: string;
  deliveryMethod: string;
  recipient: string;
}

export class OTPRequestedEvent extends DomainEvent<OTPRequestedPayload> implements IEvent {
  constructor(
    payload: OTPRequestedPayload,
    options: { correlationId?: string; version?: number } = {},
  ) {
    super('OTPRequestedEvent', payload, options);
  }
}
