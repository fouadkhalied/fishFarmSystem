import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { Injectable } from '@nestjs/common';
import { Option } from 'effect/Option';
import { OTPService } from '../service/otp.service';

export interface RequestOTPInput {
  sessionToken: string;
  isResend: boolean;
  password?: string;
}

@Injectable()
export class RequestOTPUseCase
  implements UseCase<RequestOTPInput, Option<boolean>>
{
  constructor(
    private readonly otpService: OTPService,
  ) {}

  async execute(input: RequestOTPInput): Promise<Option<boolean>> {
    return this.otpService.requestOTP(input);
  }
}