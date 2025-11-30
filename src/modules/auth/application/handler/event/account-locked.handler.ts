import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountLockedEvent } from '../../../domain/event/account-locked.event';

@Injectable()
export class AccountLockedHandler implements OnModuleInit {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleInit() {
    this.eventEmitter.on('AccountLockedEvent', (event: AccountLockedEvent) => {
      this.handle(event);
    });
  }

  async handle(event: AccountLockedEvent): Promise<void> {
    const { userId, reason } = event.payload;
    
    // Log the account lock event
    console.log(`Account locked: User ${userId} is locked. Reason: ${reason}`);
    
    // TODO: Send notification email to user about account lock
    // TODO: Log to security audit system
    // TODO: Send alert to administrators if needed
  }
}

