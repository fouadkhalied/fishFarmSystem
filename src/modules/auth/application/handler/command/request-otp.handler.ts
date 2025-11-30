import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Option } from 'effect/Option';
import { RequestOTPCommand } from '../../command/request-otp.command';
import { RequestOTPUseCase } from '../../use-case/request-otp.use-case';

@CommandHandler(RequestOTPCommand)
export class RequestOTPHandler
  implements ICommandHandler<RequestOTPCommand, Option<boolean>>
{
  constructor(private readonly requestOTPUseCase: RequestOTPUseCase) {}

  async execute(command: RequestOTPCommand): Promise<Option<boolean>> {
    return this.requestOTPUseCase.execute({
      email: command.email,
      phoneNumber: undefined,
      password: command.password,
      deliveryMethod: command.deliveryMethod,
      isResend: command.isResend,
    });
  }
}
