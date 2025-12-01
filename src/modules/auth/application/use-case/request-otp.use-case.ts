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
import { ContactMethod } from 'src/modules/user/domain/value-object/contactInfo/contact-method.interface';

export interface RequestOTPInput {
  recipient: ContactMethod;
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
    if (!input.recipient) {
      throw new BadRequestException(
        'Contact method must be provided to request OTP',
      );
    }
    
    const user = await this.authUserQueryService.findUserByContactMethod(input.recipient);    

    if (isNone(user)) {
      throw new UnauthorizedException(
        `User not found!`,
      );
    }

    // Validate password for non-resend requests
    if (input.isResend) {
      
      // Check account is active
      if (user.value.props.state !== UserState.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }

      if (!input.password) {
        throw new BadRequestException('Password is required for OTP request');
      }
      const validPassword = await user.value.props.password.matches(input.password);
      if (!validPassword) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Rate limit (max 3 OTP requests per hour)
    const recentRequests = await this.otpRepository.countRecentOTPRequests(
      user.value.id,
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
      userId: user.value.id,
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
        userId: user.value.id,
        otpCode: otpCode.getCode(),
        deliveryMethod: input.deliveryMethod,
        recipient: input.recipient.value.toString(),
      }),
    );

    return some(true);
  }
}