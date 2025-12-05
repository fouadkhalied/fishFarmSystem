import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { isSome, isNone, some, none, map, Option } from 'effect/Option';
import { Injectable, Inject } from '@nestjs/common';
import { AuthUser } from '../../api/rest/presentation/dto/auth-user.dto';
import { SignupBody } from '../../api/rest/presentation/body/signup.body';
import { CustomConflictException } from '../../../../libs/exceptions/custom-conflict.exception';
import { User } from '../../../user/domain/entity/user.entity';
import { AuthUserQueryService } from '../service/auth-user-query.service';
import { UserRepository } from '../../../user/domain/repository/user.repository.interface';
import { USER_REPOSITORY } from '../../../user/user.tokens';
import { Password } from '../../../user/domain/value-object/password.value-object';
import { UserState } from '../../../user/domain/value-object/user-state.enum';
import { EventPublisher } from '@nestjs/cqrs';
import { ContactMethodFactory } from 'src/modules/user/domain/value-object/contactInfo/contact-method.factory';

@Injectable()
export class SignupUseCase implements UseCase<SignupBody, Option<AuthUser>> {
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(body: SignupBody): Promise<Option<AuthUser>> {
    await this.validateUserDoesNotExist(body);
    const password = await this.hashPassword(body.password);
    const user = await this.createUser(body, password);

    if (isNone(user)) {
      return none();
    }

    await this.publishUserCreatedEvent(user.value);
    return this.createSuccessResponse(user.value);
  }

  private async validateUserDoesNotExist(body: SignupBody): Promise<void> {
    const contactMethod = ContactMethodFactory.fromLoginBody(body);
    const existingUser = await this.authUserQueryService.findUserByContactMethod(contactMethod);

    if (isSome(existingUser)) {
      throw new CustomConflictException(existingUser.value.props.email);
    }
  }

  private async hashPassword(password: string): Promise<Password> {
    return await Password.fromPlainText(password);
  }

  private async createUser(body: SignupBody, password: Password): Promise<Option<User>> {
    //const userRole = body.role !== undefined ? (body.role as unknown as UserRole) : UserRole.MANAGER;

    return await this.userRepository.createUser({
      email: body.email!,
      password,
      phoneNumber: body.phoneNumber || null,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      state: UserState.ACTIVE,
      twoFactorEnabled: false,
    });
  }

  private async publishUserCreatedEvent(user: User): Promise<void> {
    this.eventPublisher.mergeObjectContext(user);
    user.commit();
  }

  private createSuccessResponse(user: User): Option<AuthUser> {
    return map(some(user), (u: User) => ({
      id: u.id,
      email: u.props.email,
      role: u.props.role,
    }));
  }
}
