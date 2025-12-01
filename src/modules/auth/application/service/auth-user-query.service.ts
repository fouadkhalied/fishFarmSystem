import { Injectable, Inject } from '@nestjs/common';
import { Option } from 'effect/Option';
import { User } from '../../../user/domain/entity/user.entity';
import { UserRepository } from '../../../user/domain/repository/user.repository.interface';
import { USER_REPOSITORY } from '../../../user/user.tokens';
import { ContactMethod } from 'src/modules/user/domain/value-object/contactInfo/contact-method.interface';

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

  async findUserByContactMethod(
    input: ContactMethod,
  ): Promise<Option<User>> {
    if (input.type === 'EMAIL') {
      return await this.userRepository.getUserByEmail(input.value);
    } else if (input.type === 'SMS') {
      return await this.userRepository.getUserByPhoneNumber(input.value);
    }

    // This should not happen if validation is done before calling this method
    throw new Error('Either email or phone number must be provided');
  }
}

