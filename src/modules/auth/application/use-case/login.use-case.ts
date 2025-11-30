// login.use-case.ts
import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { LoginBody } from '../../api/rest/presentation/body/login.body';
import { fromNullable, isNone, Option } from 'effect/Option';
import { BadRequestException, Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { UserState } from '../../../user/domain/value-object/user-state.enum';
import { LoginResponse } from '../../api/rest/presentation/dto/login-response.dto';
import { AuthUserQueryService } from '../service/auth-user-query.service';
import { LoginAttemptCache } from '../../infrastructure/cache/login-attempt.cache';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountLockedEvent } from '../../domain/event/account-locked.event';
import { UserRepository } from '../../../user/domain/repository/user.repository.interface';
import { USER_REPOSITORY } from '../../../user/user.tokens';

@Injectable()
export class LoginUseCase implements UseCase<LoginBody, Option<LoginResponse>> {
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    private readonly loginAttemptCache: LoginAttemptCache,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(body: LoginBody): Promise<Option<LoginResponse>> {
    const WRONG_LOGIN_ATTEMPS: number = 3;
    
    // 1. Validate that either email or phone number is provided
    if (!body.email && !body.phoneNumber) {
      throw new BadRequestException('Either email or phone number must be provided');
    }

    // 2. Fetch user by email or phone number
    const user = await this.authUserQueryService.getUserByEmailOrPhone({
      email: body.email,
      phoneNumber: body.phoneNumber,
    });

    if (isNone(user)) {
      throw new UnauthorizedException(
        `User not found!`,
      );
    }

    // 3. Verify user exists and is active
    if (isNone(user) || user.value.props.state !== UserState.ACTIVE) {
      throw new UnauthorizedException(
        `Account locked! please change your password`,
      );
    }

    // 4. Validate password
    const validPassword = await user.value.props.password.matches(body.password);

    if (!validPassword) {
      // 5. Increment user wrong attempts
      const newCount = await this.loginAttemptCache.incrementAttempt(user.value.id);
      
      console.log(user);
      // 6. Check if wrong attempts >= 3
      if (newCount >= WRONG_LOGIN_ATTEMPS) {
        // Record failed login (changes state to LOCKED and creates AccountLockedEvent)
        user.value.recordFailedLogin();

        
        
        
        // Save user to database (account now locked)
        await this.userRepository.lock(user.value.id);
 
        const accountLockedEvent = new AccountLockedEvent({
          userId: user.value.id,
          reason: 'Too many failed login attempts',
        });
        
        this.eventEmitter.emit('AccountLockedEvent', accountLockedEvent);
        throw new UnauthorizedException(
          `Account locked! please change your password`,
        );
      }

      const remainingAttempts = WRONG_LOGIN_ATTEMPS - newCount;
      throw new UnauthorizedException(
        `Invalid Credentials! Attempts remaining: ${remainingAttempts}`,
      );
    }

    // 7. Password is correct - delete user wrong attempts
    await this.loginAttemptCache.deleteAttempts(user.value.id);

    // 8. Check if 2FA is enabled
    const twoFactorEnabled = user.value.props.twoFactorEnabled ?? false;

    if (twoFactorEnabled) {
      // 9. Determine delivery method based on login method
      const deliveryMethod = body.email ? 'EMAIL' : 'SMS';

      return fromNullable({
        requiresOTP: true,
        deliveryMethod,
        userEmail: user.value.props.email,
        userPhoneNumber: user.value.props.phoneNumber,
        message: `OTP will be sent to your ${deliveryMethod === 'EMAIL' ? 'email' : 'phone'}. Please verify to continue.`,
      });
    }

    // 10. Return authenticated user if 2FA is not enabled
    return fromNullable({
      requiresOTP: false,
      user: {
        id: user.value.id,
        email: user.value.props.email,
        role: user.value.props.role,
      },
    });
  }
}
