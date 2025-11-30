import { Injectable, Inject } from '@nestjs/common';
import { Option } from 'effect/Option';
import { User } from '../../../user/domain/entity/user.entity';
import { UserRepository } from '../../../user/domain/repository/user.repository.interface';
import { USER_REPOSITORY } from '../../../user/user.tokens';

export interface GetUserByEmailOrPhoneInput {
  email?: string;
  phoneNumber?: string;
}

@Injectable()
export class AuthUserQueryService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  async getUserByEmailOrPhone(
    input: GetUserByEmailOrPhoneInput,
  ): Promise<Option<User>> {
    if (input.email) {
      return await this.userRepository.getUserByEmail(input.email);
    } else if (input.phoneNumber) {
      return await this.userRepository.getUserByPhoneNumber(input.phoneNumber);
    }

    // This should not happen if validation is done before calling this method
    throw new Error('Either email or phone number must be provided');
  }
}

