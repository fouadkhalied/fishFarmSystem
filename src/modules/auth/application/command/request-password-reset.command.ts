export class RequestPasswordResetCommand {
  constructor(
    public readonly email?: string,
    public readonly phoneNumber?: string,
  ) {}
}

export interface RequestPasswordResetResult {
  success: boolean;
  message: string;
  deliveryMethod?: string;
}
