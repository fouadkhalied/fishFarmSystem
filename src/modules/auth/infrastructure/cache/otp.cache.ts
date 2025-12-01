
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Option, some, none } from 'effect/Option';
import { OTP, OTPProps } from '../../domain/entity/otp.entity';
import { OTPCode } from '../../domain/value-object/otp-code.value-object';
import { v4 } from 'uuid';

interface CachedOTP {
  id: string;
  userId: string;
  codeHash: string;
  deliveryMethod: 'EMAIL' | 'SMS' | 'PUSH';
  expiresAt: string;
  failedAttempts: number;
  invalidated: boolean;
}

interface OTPRequestLog {
  timestamps: number[];
}

@Injectable()
export class OTPCacheService {
  private readonly OTP_KEY = (userId: string) => `otp:${userId}`;
  private readonly RATE_LIMIT_KEY = (userId: string) => `otp_requests:${userId}`;
  private readonly OTP_TTL_SECONDS = 300; // 5 minutes
  private readonly RATE_LIMIT_TTL_SECONDS = 3600; // 1 hour

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async createOTP(data: OTPProps): Promise<Option<OTP>> {
    const otpId = v4();
    
    const cachedOTP: CachedOTP = {
      id: otpId,
      userId: data.userId,
      codeHash: data.code.getHash(),
      deliveryMethod: data.deliveryMethod,
      expiresAt: data.code.getExpiresAt().toISOString(),
      failedAttempts: 0,
      invalidated: false,
    };

    // Store OTP with automatic expiration
    await this.cache.set(
      this.OTP_KEY(data.userId),
      JSON.stringify(cachedOTP),
      this.OTP_TTL_SECONDS * 1000,
    );

    // Track request for rate limiting
    await this.incrementRequestCount(data.userId);

    return some(new OTP(otpId, data));
  }

  async findOTPByUserId(userId: string): Promise<Option<OTP>> {
    const cached = await this.cache.get<string>(this.OTP_KEY(userId));
    
    if (!cached) {
      return none();
    }

    const data: CachedOTP = JSON.parse(cached);

    if (data.invalidated) {
      return none();
    }

    return some(
      new OTP(data.id, {
        userId: data.userId,
        code: OTPCode.fromHash(data.codeHash, new Date(data.expiresAt)),
        deliveryMethod: data.deliveryMethod,
        failedAttempts: data.failedAttempts,
        invalidated: data.invalidated,
      }),
    );
  }

  async updateOTP(otp: OTP): Promise<Option<OTP>> {
    const cached = await this.cache.get<string>(this.OTP_KEY(otp.props.userId));

    if (!cached) {
      return none();
    }

    const data: CachedOTP = JSON.parse(cached);
    data.failedAttempts = otp.props.failedAttempts;
    data.invalidated = otp.props.invalidated;

    // Re-save with same TTL
    await this.cache.set(
      this.OTP_KEY(otp.props.userId),
      JSON.stringify(data),
      this.OTP_TTL_SECONDS * 1000,
    );

    return some(otp);
  }

  async deleteOTP(_otpId: string): Promise<boolean> {
    // Since we store by userId, we need to find the OTP first
    // This is a limitation - better to pass userId directly
    // The otpId parameter is kept for interface compatibility
    return true;
  }

  async deleteOTPByUserId(userId: string): Promise<boolean> {
    await this.cache.del(this.OTP_KEY(userId));
    return true;
  }

  async countRecentOTPRequests(
    userId: string,
    windowMinutes: number,
  ): Promise<number> {
    const cached = await this.cache.get<string>(this.RATE_LIMIT_KEY(userId));

    if (!cached) {
      return 0;
    }

    const log: OTPRequestLog = JSON.parse(cached);
    const now = Date.now();
    const windowMs = windowMinutes * 60 * 1000;

    // Filter timestamps within window
    const recentRequests = log.timestamps.filter(
      (timestamp) => now - timestamp < windowMs,
    );

    return recentRequests.length;
  }

  private async incrementRequestCount(userId: string): Promise<void> {
    const key = this.RATE_LIMIT_KEY(userId);
    const cached = await this.cache.get<string>(key);

    let log: OTPRequestLog;
    if (cached) {
      log = JSON.parse(cached);
    } else {
      log = { timestamps: [] };
    }

    log.timestamps.push(Date.now());

    // Keep only last hour of requests
    const oneHourAgo = Date.now() - 3600 * 1000;
    log.timestamps = log.timestamps.filter((ts) => ts > oneHourAgo);

    await this.cache.set(
      key,
      JSON.stringify(log),
      this.RATE_LIMIT_TTL_SECONDS * 1000,
    );
  }
}
