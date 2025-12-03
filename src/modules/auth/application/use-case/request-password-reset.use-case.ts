import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isNone } from 'effect/Option';
import { UserState } from '../../../user/domain/value-object/user-state.enum';
import { PASSWORD_RESET_CACHE } from '../../auth.tokens';
import { PasswordResetRequestedEvent } from '../../domain/event/password-reset-requested.event';
import { PasswordResetCache } from '../../infrastructure/cache/password-reset.cache';
import { AuthUserQueryService } from '../service/auth-user-query.service';
import { randomBytes } from 'crypto';
import { ContactMethodFactory } from 'src/modules/user/domain/value-object/contactInfo/contact-method.factory';

export interface RequestPasswordResetInput {
  email?: string;
  phoneNumber?: string;
}

@Injectable()
export class RequestPasswordResetUseCase
  implements UseCase<RequestPasswordResetInput, boolean>
{
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(PASSWORD_RESET_CACHE)
    private readonly passwordResetCache: PasswordResetCache,
  ) {}

  async execute(input: RequestPasswordResetInput): Promise<boolean> {
    if (!input.email && !input.phoneNumber) {
      throw new BadRequestException(
        'Either email or phone number must be provided to request password reset',
      );
    }

    const contactMethod = ContactMethodFactory.fromLoginBody(input);

    // 2. Fetch user by email or phone number
    const userOption = await this.authUserQueryService.findUserByContactMethod(contactMethod);

    // Check user exists
    if (isNone(userOption)) {
      // Don't reveal if user exists for security - just return success
      throw new BadRequestException(
        'User does not exsist',
      );
    }

    const user = userOption.value;

    // Check account is active
    if (user.props.state === UserState.ACTIVE) {
      throw new BadRequestException(
        'Account is already active',
      );
    }

    // Generate reset token
    const resetToken = this.generateResetToken();

    // Store reset token
    const success = await this.passwordResetCache.createPasswordReset(
      user.id,
      resetToken,
      input.email,
      input.phoneNumber,
    );

    if (!success) {
      throw new BadRequestException('Failed to create password reset request');
    }

    // Publish domain event (for async email/SMS sending)
    this.eventEmitter.emit(
      'password.reset.requested',
      new PasswordResetRequestedEvent({
        userId: user.id,
        resetToken,
        deliveryMethod: contactMethod.type,
        recipient: contactMethod.value,
      }),
    );

    return true;
  }

  private generateResetToken(): string {
    // Generate a secure random token
    return randomBytes(32).toString('hex');
  }
}
