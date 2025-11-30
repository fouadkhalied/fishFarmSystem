import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Option } from 'effect/Option';
import { VerifyOTPCommand } from '../../command/verify-otp.command';
import { VerifyOTPUseCase } from '../../use-case/verify-otp.use-case';
import { AuthUser } from '../../../api/rest/presentation/dto/auth-user.dto';

@CommandHandler(VerifyOTPCommand)
export class VerifyOTPHandler
  implements ICommandHandler<VerifyOTPCommand, Option<AuthUser>>
{
  constructor(private readonly verifyOTPUseCase: VerifyOTPUseCase) {}

  async execute(command: VerifyOTPCommand): Promise<Option<AuthUser>> {
    return this.verifyOTPUseCase.execute({
      phoneNumber: command.phoneNumber,
      email: command.email,
      otpCode: command.otpCode,
    });
  }
}
