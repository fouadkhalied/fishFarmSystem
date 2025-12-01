import { ICommand } from '@nestjs/cqrs';
import { ContactMethod } from 'src/modules/user/domain/value-object/contactInfo/contact-method.interface';

export class RequestOTPCommand implements ICommand {
  constructor(
    readonly recipient: ContactMethod,
    readonly password: string,
    readonly deliveryMethod: string,
    readonly isResend?: boolean,
  ) {}
}
