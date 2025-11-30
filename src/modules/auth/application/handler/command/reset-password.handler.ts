import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ResetPasswordCommand, ResetPasswordResult } from '../../command/reset-password.command';
import { ResetPasswordUseCase } from '../../use-case/reset-password.use-case';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler
  implements ICommandHandler<ResetPasswordCommand, ResetPasswordResult>
{
  constructor(private readonly resetPasswordUseCase: ResetPasswordUseCase) {}

  async execute(command: ResetPasswordCommand): Promise<ResetPasswordResult> {
    const success = await this.resetPasswordUseCase.execute({
      token: command.token,
      newPassword: command.newPassword,
      email: command.email,
      phoneNumber: command.phoneNumber,
    });

    return {
      success,
      message: success
        ? 'Password reset successfully'
        : 'Failed to reset password',
    };
  }
}
