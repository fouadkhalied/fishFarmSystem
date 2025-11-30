export class Disable2FACommand {
  constructor(public readonly userId: string) {}
}

export interface Disable2FAResult {
  success: boolean;
  message: string;
}
