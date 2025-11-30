import { DomainEvent } from '../../../../libs/ddd/domain-event.abstract';
import { IEvent } from '@nestjs/cqrs';

export interface AccountLockedPayload {
  userId: string;
  reason: string;
}

export class AccountLockedEvent extends DomainEvent<AccountLockedPayload> implements IEvent {
  constructor(
    payload: AccountLockedPayload,
    options: { correlationId?: string; version?: number } = {},
  ) {
    super('AccountLockedEvent', payload, options);
    console.log(`domain event: account locked`);
  }
}
