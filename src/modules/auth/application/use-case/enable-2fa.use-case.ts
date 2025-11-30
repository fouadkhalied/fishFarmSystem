import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { isNone } from 'effect/Option';
import { USER_REPOSITORY } from '../../../user/user.tokens';

@Injectable()
export class Enable2FAUseCase
  implements UseCase<{ userId: string }, boolean>
{
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: any,
  ) {}

  async execute(input: { userId: string }): Promise<boolean> {
    // Get the current user
    const userOption = await this.userRepository.getUserById(input.userId);

    if (isNone(userOption)) {
      throw new BadRequestException('User not found');
    }

    const user = userOption.value;

    // Check if 2FA is already enabled
    if (user.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    // Enable 2FA for the user
    const updateResult = await this.userRepository.enable2FA(input.userId);

    if (isNone(updateResult)) {
      throw new BadRequestException('Failed to enable 2FA');
    }

    return true;
  }
}
