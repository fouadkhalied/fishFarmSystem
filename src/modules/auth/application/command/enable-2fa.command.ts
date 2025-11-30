export class Enable2FACommand {
  constructor(public readonly userId: string) {}
}

export interface Enable2FAResult {
  success: boolean;
  message: string;
}
