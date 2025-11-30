export interface PasswordResetRequestedEventPayload {
  userId: string;
  resetToken: string;
  deliveryMethod: string;
  recipient: string;
}

export class PasswordResetRequestedEvent {
  constructor(public readonly payload: PasswordResetRequestedEventPayload) {}
}
