export class ResetPasswordCommand {
  constructor(
    public readonly token: string,
    public readonly newPassword: string,
    public readonly email?: string,
    public readonly phoneNumber?: string,
  ) {}
}

export interface ResetPasswordResult {
  success: boolean;
  message: string;
}
