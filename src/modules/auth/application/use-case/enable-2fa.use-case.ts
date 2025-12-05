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
    const user = await this.findAndValidateUser(input.userId);
    
    this.validate2FAStatus(user);
    
    await this.enable2FA(input.userId);

    return this.createSuccessResponse();
  }

  private async findAndValidateUser(userId: string) {
    const userOption = await this.userRepository.getUserById(userId);

    if (isNone(userOption)) {
      throw new BadRequestException('User not found');
    }

    return userOption.value;
  }

  private validate2FAStatus(user: any): void {
    if (user.props.twoFactorEnabled) {
      throw new BadRequestException('2FA is already enabled');
    }
  }

  private async enable2FA(userId: string): Promise<void> {
    const updateResult = await this.userRepository.enable2FA(userId);

    if (isNone(updateResult)) {
      throw new BadRequestException('Failed to enable 2FA');
    }
  }

  private createSuccessResponse(): boolean {
    return true;
  }
}
