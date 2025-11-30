import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { Option } from 'effect/Option';
import { GetOTPByUserQuery } from '../../query/get-otp-by-user.query';
import { OTP_REPOSITORY } from '../../../auth.tokens';
import { OTPRepository } from '../../../domain/repository/otp.repository.interface';
import { OTP } from '../../../domain/entity/otp.entity';

@QueryHandler(GetOTPByUserQuery)
export class GetOTPByUserHandler implements IQueryHandler<GetOTPByUserQuery> {
  constructor(
    @Inject(OTP_REPOSITORY)
    private readonly otpRepository: OTPRepository,
  ) {}

  async execute(query: GetOTPByUserQuery): Promise<Option<OTP>> {
    return await this.otpRepository.findOTPByUserId(query.userId);
  }
}
