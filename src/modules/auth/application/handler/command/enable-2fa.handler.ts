import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Enable2FACommand, Enable2FAResult } from '../../command/enable-2fa.command';
import { Enable2FAUseCase } from '../../use-case/enable-2fa.use-case';

@CommandHandler(Enable2FACommand)
export class Enable2FAHandler
  implements ICommandHandler<Enable2FACommand, Enable2FAResult>
{
  constructor(private readonly enable2FAUseCase: Enable2FAUseCase) {}

  async execute(command: Enable2FACommand): Promise<Enable2FAResult> {
    const success = await this.enable2FAUseCase.execute({
      userId: command.userId,
    });

    return {
      success,
      message: success
        ? '2FA has been enabled successfully'
        : 'Failed to enable 2FA',
    };
  }
}
