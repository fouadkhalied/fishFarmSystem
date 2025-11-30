import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Disable2FACommand, Disable2FAResult } from '../../command/disable-2fa.command';
import { Disable2FAUseCase } from '../../use-case/disable-2fa.use-case';

@CommandHandler(Disable2FACommand)
export class Disable2FAHandler
  implements ICommandHandler<Disable2FACommand, Disable2FAResult>
{
  constructor(private readonly disable2FAUseCase: Disable2FAUseCase) {}

  async execute(command: Disable2FACommand): Promise<Disable2FAResult> {
    const success = await this.disable2FAUseCase.execute({
      userId: command.userId,
    });

    return {
      success,
      message: success
        ? '2FA has been disabled successfully'
        : 'Failed to disable 2FA',
    };
  }
}
