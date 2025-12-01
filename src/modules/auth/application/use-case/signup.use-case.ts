import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { isSome, isNone, none, map, Option } from 'effect/Option';
import { Injectable, Inject } from '@nestjs/common';
import { AuthUser } from '../../api/rest/presentation/dto/auth-user.dto';
import { SignupBody } from '../../api/rest/presentation/body/signup.body';
import { CustomConflictException } from '../../../../libs/exceptions/custom-conflict.exception';
import { User } from '../../../user/domain/entity/user.entity';
import { AuthUserQueryService } from '../service/auth-user-query.service';
import { UserRepository } from '../../../user/domain/repository/user.repository.interface';
import { USER_REPOSITORY } from '../../../user/user.tokens';
import { Password } from '../../../user/domain/value-object/password.value-object';
import { UserRole } from '../../../user/domain/value-object/user-role.enum';
import { UserState } from '../../../user/domain/value-object/user-state.enum';
import { EventPublisher } from '@nestjs/cqrs';

@Injectable()
export class SignupUseCase implements UseCase<SignupBody, Option<AuthUser>> {
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(body: SignupBody): Promise<Option<AuthUser>> {
    // 1. Check if user already exists
    const found = await this.authUserQueryService.getUserByEmailOrPhone({
      email: body.email,
      phoneNumber: body.phoneNumber,
    });
    
    if (isSome(found)) {
      throw new CustomConflictException(found.value.props.email);
    }

    // 2. Create password hash
    const password = await Password.fromPlainText(body.password);

    // 3. Create user
    const userRole = body.role !== undefined ? (body.role as unknown as UserRole) : UserRole.MANAGER;
    const user = await this.userRepository.createUser({
      email: body.email!,
      password,
      phoneNumber: body.phoneNumber || null,
      firstName: body.firstName,
      lastName: body.lastName,
      role: userRole,
      state: UserState.ACTIVE,
      twoFactorEnabled: false,
    });

    if (isNone(user)) {
      return none();
    }

    // 4. Merge event context and commit domain events
    this.eventPublisher.mergeObjectContext(user.value);
    user.value.commit();

    // 5. Return AuthUser
    return map(user, (u: User) => ({
      id: u.id,
      email: u.props.email,
      role: u.props.role,
    }));
  }
}
