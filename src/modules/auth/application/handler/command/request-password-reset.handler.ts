import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RequestPasswordResetCommand, RequestPasswordResetResult } from '../../command/request-password-reset.command';
import { RequestPasswordResetUseCase } from '../../use-case/request-password-reset.use-case';

@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler
  implements ICommandHandler<RequestPasswordResetCommand, RequestPasswordResetResult>
{
  constructor(private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase) {}

  async execute(command: RequestPasswordResetCommand): Promise<RequestPasswordResetResult> {
    const success = await this.requestPasswordResetUseCase.execute({
      email: command.email,
      phoneNumber: command.phoneNumber,
    });

    return {
      success,
      message: success
        ? 'Password reset instructions sent to your email/phone'
        : 'Failed to send password reset instructions',
    };
  }
}
