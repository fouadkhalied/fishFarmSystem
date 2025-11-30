
import { Option } from 'effect/Option';
import { OTP, OTPProps } from '../entity/otp.entity';

export interface OTPRepository {
  createOTP(data: OTPProps): Promise<Option<OTP>>;
  
  findOTPByUserId(userId: string): Promise<Option<OTP>>;
  
  updateOTP(otp: OTP): Promise<Option<OTP>>;
  
  deleteOTP(otpId: string): Promise<boolean>;
  
  countRecentOTPRequests(userId: string, windowMinutes: number): Promise<number>;
}