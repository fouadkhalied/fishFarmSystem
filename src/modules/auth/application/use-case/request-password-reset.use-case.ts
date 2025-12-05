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
    const contactMethod = ContactMethodFactory.fromLoginBody(input);
    const user = await this.findUser(contactMethod);

    if (isNone(user)) {
      throw new BadRequestException("User does not exsist");
    }

    this.validateUserState(user.value);
    const resetToken = this.generateResetToken();
    await this.storeResetToken(user.value.id, resetToken, input);
    await this.publishPasswordResetEvent(user.value.id, resetToken, contactMethod);

    return this.createSuccessResponse();
  }

  private async findUser(contactMethod: any) {
    return await this.authUserQueryService.findUserByContactMethod(contactMethod);
  }

  private validateUserState(user: any): void {
    if (user.props.state !== UserState.ACTIVE) {
      throw new BadRequestException('Account is not active');
    }
  }

  private generateResetToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async storeResetToken(userId: string, resetToken: string, input: RequestPasswordResetInput): Promise<void> {
    const success = await this.passwordResetCache.createPasswordReset(
      userId,
      resetToken,
      input.email,
      input.phoneNumber,
    );

    if (!success) {
      throw new BadRequestException('Failed to create password reset request');
    }
  }

  private async publishPasswordResetEvent(userId: string, resetToken: string, contactMethod: any): Promise<void> {
    this.eventEmitter.emit(
      'password.reset.requested',
      new PasswordResetRequestedEvent({
        userId,
        resetToken,
        deliveryMethod: contactMethod.type,
        recipient: contactMethod.value,
      }),
    );
  }

  private createSuccessResponse(): boolean {
    return true;
  }

}
