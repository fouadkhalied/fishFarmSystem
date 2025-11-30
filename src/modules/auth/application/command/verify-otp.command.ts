import { ICommand } from '@nestjs/cqrs';

export class VerifyOTPCommand implements ICommand {
  constructor(
    readonly email: string,
    readonly otpCode: string,
    readonly phoneNumber: string
  ) {}
}