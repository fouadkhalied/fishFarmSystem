import { ICommand } from '@nestjs/cqrs';

export class RequestOTPCommand implements ICommand {
  constructor(
    readonly email: string,
    readonly password: string,
    readonly deliveryMethod: string,
    readonly isResend?: boolean,
  ) {}
}
