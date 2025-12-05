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
    const tokenData = await this.verifyResetToken(input.token);
    const { userId } = tokenData.value;

    await this.resetUserPassword(userId, input.newPassword);
    await this.cleanupTokens(input.token, userId);

    return this.createSuccessResponse();
  }

  private async verifyResetToken(token: string) {
    const tokenData = await this.passwordResetCache.verifyPasswordResetToken(token);

    if (isNone(tokenData)) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    return tokenData;
  }

  private async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    const result = await this.userRepository.changePassword(userId, newPassword);

    if (isNone(result)) {
      throw new BadRequestException('Failed to reset password');
    }
  }

  private async cleanupTokens(token: string, userId: string): Promise<void> {
    await this.passwordResetCache.invalidateToken(token);
    await this.passwordResetCache.invalidateUserTokens(userId);
  }

  private createSuccessResponse(): boolean {
    return true;
  }
}
