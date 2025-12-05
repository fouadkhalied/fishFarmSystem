
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
    const contactMethod = ContactMethodFactory.fromLoginBody(input);
    const user = await this.findUser(contactMethod);

    if (isNone(user)) {
      return none();
    }

    const otp = await this.findAndValidateOTP(user.value.id);
    await this.validateOTPCode(otp, input.otpCode);
    await this.cleanupOTP(otp.id);

    return this.createSuccessResponse(user.value);
  }

  private async findUser(contactMethod: any): Promise<Option<User>> {
    return await this.authUserQueryService.findUserByContactMethod(contactMethod);
  }

  private async findAndValidateOTP(userId: string) {
    const otpOption = await this.otpRepository.findOTPByUserId(userId);

    if (isNone(otpOption)) {
      throw new UnauthorizedException('OTP not found');
    }

    return otpOption.value;
  }

  private async validateOTPCode(otp: any, otpCode: string): Promise<void> {
    try {
      const isValid = await otp.validate(otpCode);

      if (!isValid) {
        await this.otpRepository.updateOTP(otp);
        throw new UnauthorizedException('Invalid OTP code');
      }

      // Save the invalidated state after successful validation
      await this.otpRepository.updateOTP(otp);
    } catch (error: any) {
      throw new UnauthorizedException(error.message);
    }
  }

  private async cleanupOTP(otpId: string): Promise<void> {
    await this.otpRepository.deleteOTP(otpId);
  }

  private createSuccessResponse(user: User): Option<AuthUser> {
    return fromNullable({
      id: user.id,
      email: user.props.email,
      role: user.props.role,
    });
  }
}