export interface OTPResponseDto {
    success: boolean;
    message: string;
    expiresIn: number; // seconds
    deliveryMethod: string;
    maskedRecipient?: string; // e.g., "j***n@example.com" or "+1***5678"
    requestId?: string;
    timestamp: Date;
  }