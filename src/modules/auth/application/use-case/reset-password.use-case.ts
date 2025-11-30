import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { Injectable, Inject, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { isNone } from 'effect/Option';
import { PASSWORD_RESET_CACHE } from '../../auth.tokens';
import { PasswordResetCache } from '../../infrastructure/cache/password-reset.cache';
import { USER_REPOSITORY } from '../../../user/user.tokens';

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
  email?: string;
  phoneNumber?: string;
}

@Injectable()
export class ResetPasswordUseCase
  implements UseCase<ResetPasswordInput, boolean>
{
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: any,
    @Inject(PASSWORD_RESET_CACHE)
    private readonly passwordResetCache: PasswordResetCache,
  ) {}

  async execute(input: ResetPasswordInput): Promise<boolean> {
    // Verify reset token
    const tokenData = await this.passwordResetCache.verifyPasswordResetToken(input.token);

    if (isNone(tokenData)) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const { userId } = tokenData.value;

    // Reset password
    const result = await this.userRepository.changePassword(userId, input.newPassword);

    if (isNone(result)) {
      throw new BadRequestException('Failed to reset password');
    }

    // Invalidate the used token
    await this.passwordResetCache.invalidateToken(input.token);

    // Also invalidate any other tokens for this user
    await this.passwordResetCache.invalidateUserTokens(userId);

    return true;
  }
}
