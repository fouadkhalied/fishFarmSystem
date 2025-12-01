import { UseCase } from '../../../../libs/ddd/use-case.interface';
import {
  Injectable,
  Inject,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { isNone, none, Option, some } from 'effect/Option';
import { UserState } from '../../../user/domain/value-object/user-state.enum';
import { OTP_REPOSITORY } from '../../auth.tokens';
import { OTPCode } from '../../domain/value-object/otp-code.value-object';
import { OTPRequestedEvent } from '../../domain/event/otp-requested.event';
import { AuthUserQueryService } from '../service/auth-user-query.service';

export interface RequestOTPInput {
  email?: string;
  phoneNumber?: string;
  password?: string;
  deliveryMethod: string;
  isResend?: boolean;
}

@Injectable()
export class RequestOTPUseCase
  implements UseCase<RequestOTPInput, Option<boolean>>
{
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(OTP_REPOSITORY)
    private readonly otpRepository: any,
  ) {}

  async execute(input: RequestOTPInput): Promise<Option<boolean>> {
    if (!input.email && !input.phoneNumber) {
      throw new BadRequestException(
        'Either email or phone number must be provided to request OTP',
      );
    }

    const userOption = await this.authUserQueryService.getUserByEmailOrPhone({
      email: input.email,
      phoneNumber: input.phoneNumber,
    });

    // Check user exists
    if (isNone(userOption)) {
      return none();
    }

    const user = userOption.value;

    // Validate password for non-resend requests
    if (input.isResend) {
      
      // Check account is active
      if (user.props.state !== UserState.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }

      if (!input.password) {
        throw new BadRequestException('Password is required for OTP request');
      }
      const validPassword = await user.props.password.matches(input.password);
      if (!validPassword) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Rate limit (max 3 OTP requests per hour)
    const recentRequests = await this.otpRepository.countRecentOTPRequests(
      user.id,
      60,
    );
    if (recentRequests >= 3) {
      throw new UnauthorizedException(
        'Too many OTP requests. Please try again later.',
      );
    }

    // Generate OTP
    const otpCode = await OTPCode.generate();

    // Save OTP
    const otpResult = await this.otpRepository.createOTP({
      userId: user.id,
      code: otpCode,
      deliveryMethod: input.deliveryMethod as 'EMAIL' | 'SMS' | 'PUSH',
      failedAttempts: 0,
      invalidated: false,
    });

    if (isNone(otpResult)) {
      return none();
    }

    // Publish domain event (for async email/SMS sending)
    this.eventEmitter.emit(
      'otp.requested',
      new OTPRequestedEvent({
        userId: user.id,
        otpCode: otpCode.getCode(),
        deliveryMethod: input.deliveryMethod,
        recipient: input.deliveryMethod === 'EMAIL' ? user.props.email : user.props.phoneNumber || "recipent",
      }),
    );

    return some(true);
  }
}