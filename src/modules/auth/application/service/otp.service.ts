import { Injectable, Inject, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isNone, Option, some } from 'effect/Option';
import { UserState } from '../../../user/domain/value-object/user-state.enum';
import { OTP_REPOSITORY } from '../../auth.tokens';
import { OTPCode } from '../../domain/value-object/otp-code.value-object';
import { OTPRequestedEvent } from '../../domain/event/otp-requested.event';
import { AuthUserQueryService } from './auth-user-query.service';
import { ContactMethod } from 'src/modules/user/domain/value-object/contactInfo/contact-method.interface';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

export interface DirectOTPRequestInput {
  recipient: ContactMethod;
  deliveryMethod: 'EMAIL' | 'SMS';
  isResend: boolean;
  password?: string;
}

interface AuthSession {
  userId: string;
  recipient: ContactMethod;
  deliveryMethod: 'EMAIL' | 'SMS';
  expiresAt: number;
}

@Injectable()
export class OTPService {
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(OTP_REPOSITORY)
    private readonly otpRepository: any,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache
  ) {}

  async requestOTP(input: {
    sessionToken: string;
    isResend: boolean;
    password?: string;
  }): Promise<Option<boolean>> {
    const sessionUser = await this.getUserFromCacheBySessionToken(input.sessionToken);
    this.validateSessionInput(input);
    const user = await this.findAndValidateUser(sessionUser.recipient);
    await this.validateResendRequest({ isResend: input.isResend, password: input.password }, user);
    await this.checkRateLimit(user.id);
    const otpCode = await this.generateAndSaveOTP(sessionUser, user.id);

    await this.publishOTPRequestedEvent(sessionUser, user.id, otpCode);
    return some(true);
  }

  async requestDirectOTP(input: DirectOTPRequestInput): Promise<Option<boolean>> {
    this.validateDirectInput(input);
    const user = await this.findAndValidateUser(input.recipient);
    await this.validateResendRequest({ isResend: input.isResend, password: input.password }, user);
    await this.checkRateLimit(user.id);
    const otpCode = await this.generateAndSaveOTP(input, user.id);

    await this.publishOTPRequestedEvent(input, user.id, otpCode);
    return some(true);
  }

  private validateSessionInput(input: { sessionToken: string; isResend: boolean; password?: string }): void {
    if (!input.sessionToken) {
      throw new BadRequestException('Session token is required');
    }
  }

  private validateDirectInput(input: DirectOTPRequestInput): void {
    if (!input.recipient) {
      throw new BadRequestException('Contact method must be provided to request OTP');
    }
  }

  private async findAndValidateUser(recipient: ContactMethod) {
    const user = await this.authUserQueryService.findUserByContactMethod(recipient);

    if (isNone(user)) {
      throw new UnauthorizedException('User not found!');
    }

    return user.value;
  }

  private async validateResendRequest(input: { isResend: boolean; password?: string }, user: any): Promise<void> {
    if (user.props.state !== UserState.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }
    if (input.isResend) {
      if (!input.password) {
        throw new BadRequestException('Password is required for OTP request');
      }

      const validPassword = await user.props.password.matches(input.password);
      if (!validPassword) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }
  }

  private async checkRateLimit(userId: string): Promise<void> {
    const recentRequests = await this.otpRepository.countRecentOTPRequests(userId, 60);
    if (recentRequests >= 3) {
      throw new UnauthorizedException('Too many OTP requests. Please try again later.');
    }
  }

  private async generateAndSaveOTP(deliveryInfo: { deliveryMethod: 'EMAIL' | 'SMS' }, userId: string): Promise<OTPCode> {
    const otpCode = await OTPCode.generate();

    const otpResult = await this.otpRepository.createOTP({
      userId,
      code: otpCode,
      deliveryMethod: deliveryInfo.deliveryMethod as 'EMAIL' | 'SMS' | 'PUSH',
      failedAttempts: 0,
      invalidated: false,
    });

    if (isNone(otpResult)) {
      throw new BadRequestException('Failed to create OTP');
    }

    return otpCode;
  }

  private async publishOTPRequestedEvent(deliveryInfo: { recipient: ContactMethod; deliveryMethod: 'EMAIL' | 'SMS' }, userId: string, otpCode: OTPCode): Promise<void> {
    this.eventEmitter.emit(
      'otp.requested',
      new OTPRequestedEvent({
        userId,
        otpCode: otpCode.getCode(),
        deliveryMethod: deliveryInfo.deliveryMethod,
        recipient: deliveryInfo.recipient.value.toString(),
      }),
    );
  }

  private async getUserFromCacheBySessionToken(sessionToken: string): Promise<AuthSession> {
    const sessionData = await this.cacheManager.get(`auth_session:${sessionToken}`) as AuthSession;
    if (!sessionData) {
      throw new UnauthorizedException('Session expired. Please login again.');
    }
    return sessionData;
  }
}
