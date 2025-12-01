import { Injectable } from '@nestjs/common';
import { Option } from 'effect/Option';
import { OTPRepository } from '../../../domain/repository/otp.repository.interface';
import { OTP, OTPProps } from '../../../domain/entity/otp.entity';
import { OTPCacheService } from '../../cache/otp.cache';

@Injectable()
export class OTPRepositoryImpl implements OTPRepository {
  constructor(
    private readonly otpCache: OTPCacheService,
  ) {}

  async createOTP(data: OTPProps): Promise<Option<OTP>> {
    return this.otpCache.createOTP(data);
  }

  async findOTPByUserId(userId: string): Promise<Option<OTP>> {
    return this.otpCache.findOTPByUserId(userId);
  }

  async updateOTP(otp: OTP): Promise<Option<OTP>> {
    return this.otpCache.updateOTP(otp);
  }

  async deleteOTP(otpId: string): Promise<boolean> {
    return this.otpCache.deleteOTP(otpId);
  }

  async deleteOTPByUserId(userId: string): Promise<boolean> {
    return this.otpCache.deleteOTPByUserId(userId);
  }

  async countRecentOTPRequests(userId: string, windowMinutes: number): Promise<number> {
    return this.otpCache.countRecentOTPRequests(userId, windowMinutes);
  }
}
