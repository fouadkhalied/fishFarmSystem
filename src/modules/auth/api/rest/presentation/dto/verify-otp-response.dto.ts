export interface VerifyOTPResponseDto {
  success: boolean;
  message: string;
  token: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: {
    id: string;
    email: string;
    role: number;
  };
  deviceTrusted?: boolean;
  timestamp: Date;
}