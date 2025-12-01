
import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { fromNullable, isNone, none, Option } from 'effect/Option';
import { User } from '../../../user/domain/entity/user.entity';
import { OTP_REPOSITORY } from '../../auth.tokens';
import { OTPRepository } from '../../domain/repository/otp.repository.interface';
import { AuthUser } from '../../api/rest/presentation/dto/auth-user.dto';
import { AuthUserQueryService } from '../service/auth-user-query.service';
import { ContactMethodFactory } from 'src/modules/user/domain/value-object/contactInfo/contact-method.factory';

export interface VerifyOTPInput {
  email: string;
  phoneNumber: string;
  otpCode: string;
}

@Injectable()
export class VerifyOTPUseCase implements UseCase<VerifyOTPInput, Option<AuthUser>> {
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    @Inject(OTP_REPOSITORY)
    private readonly otpRepository: OTPRepository,
  ) {}

  async execute(input: VerifyOTPInput): Promise<Option<AuthUser>> {

    // 1. Load user from database
    const contactMethod = ContactMethodFactory.fromLoginBody(input);

    // 2. Fetch user by email or phone number
    const userOption: Option<User> = await this.authUserQueryService.findUserByContactMethod(contactMethod);

    // 2. Check user exists
    if (isNone(userOption)) {
      return none();
    }

    const user = userOption.value;

    // 3. Load OTP from database
    const otpOption = await this.otpRepository.findOTPByUserId(user.id);

    // 4. Check OTP exists
    if (isNone(otpOption)) {
      throw new UnauthorizedException('OTP not found');
    }

    const otp = otpOption.value;

    // 5. Validate OTP
    try {
      const isValid = await otp.validate(input.otpCode);

      if (!isValid) {
        // Save failed attempt
        await this.otpRepository.updateOTP(otp);
        throw new UnauthorizedException('Invalid OTP code');
      }
    } catch (error: any) {
      throw new UnauthorizedException(error.message);
    }

    // 6. Delete OTP after successful validation
    await this.otpRepository.deleteOTP(otp.id);

    // 7. Return AuthUser
    return fromNullable({
      id: user.id,
      email: user.props.email,
      role: user.props.role,
    });
  }
}