import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { Injectable } from '@nestjs/common';
import { Option } from 'effect/Option';
import { OTPService, DirectOTPRequestInput } from '../service/otp.service';

@Injectable()
export class DirectRequestOTPUseCase
  implements UseCase<DirectOTPRequestInput, Option<boolean>>
{
  constructor(
    private readonly otpService: OTPService,
  ) {}

  async execute(input: DirectOTPRequestInput): Promise<Option<boolean>> {
    return this.otpService.requestDirectOTP(input);
  }
}
