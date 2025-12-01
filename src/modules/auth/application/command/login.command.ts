import { ICommand } from '@nestjs/cqrs';
import { JwtUser } from '../../api/rest/presentation/dto/jwt-user.dto';

export class LoginCommand implements ICommand {
  constructor(
    public readonly email: string | undefined,
    public readonly phoneNumber: string | undefined,
    public readonly password: string,
    public readonly deviceFingerprint?: string,
  ) {}
}

export type LoginResult =
  | {
      requiresOTP: true;
      sessionToken: string;
      message: string;
    }
  | (JwtUser & { requiresOTP?: false });


