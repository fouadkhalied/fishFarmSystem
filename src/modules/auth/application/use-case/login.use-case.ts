// login.use-case.ts
import { UseCase } from '../../../../libs/ddd/use-case.interface';
import { LoginBody } from '../../api/rest/presentation/body/login.body';
import { fromNullable, isNone, Option } from 'effect/Option';
import { BadRequestException, Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { randomBytes } from 'crypto';
import { UserState } from '../../../user/domain/value-object/user-state.enum';
import { LoginResponse } from '../../api/rest/presentation/dto/login-response.dto';
import { AuthUserQueryService } from '../service/auth-user-query.service';
import { LoginAttemptCache } from '../../infrastructure/cache/login-attempt.cache';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountLockedEvent } from '../../domain/event/account-locked.event';
import { UserRepository } from '../../../user/domain/repository/user.repository.interface';
import { USER_REPOSITORY } from '../../../user/user.tokens';
import { ContactMethodFactory } from 'src/modules/user/domain/value-object/contactInfo/contact-method.factory';
import { PasswordResetCache } from '../../infrastructure/cache/password-reset.cache';
import { PASSWORD_RESET_CACHE } from '../../auth.tokens';

@Injectable()
export class LoginUseCase implements UseCase<LoginBody, Option<LoginResponse>> {
  constructor(
    private readonly authUserQueryService: AuthUserQueryService,
    private readonly loginAttemptCache: LoginAttemptCache,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    private readonly eventEmitter: EventEmitter2,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @Inject(PASSWORD_RESET_CACHE)
    private readonly passwordResetCache: PasswordResetCache,
  ) {}

  async execute(body: LoginBody): Promise<Option<LoginResponse>> {
    const WRONG_LOGIN_ATTEMPS: number = 3;
    
    // 1. Validate that either email or phone number is provided
    if (!body.email && !body.phoneNumber) {
      throw new BadRequestException('Either email or phone number must be provided');
    }

    const contactMethod = ContactMethodFactory.fromLoginBody(body);

    // 2. Fetch user by email or phone number
    const user = await this.authUserQueryService.findUserByContactMethod(contactMethod);

    console.log(contactMethod.value);
    

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

        // Generate reset token
        const resetToken = this.generateResetToken();

        // Store reset token
        const success = await this.passwordResetCache.createPasswordReset(
          user.value.id,
          resetToken
        );

        if (!success) {
          throw new BadRequestException('Failed to create password reset request');
        }
 
        // const accountLockedEvent = new AccountLockedEvent({
        //   userId: user.value.id,
        //   reason: 'Too many failed login attempts',
        //   deliveryMethod: contactMethod.type,
        //   recipient: contactMethod.value,
        //   resetToken: resetToken
        // });
        
        this.eventEmitter.emit(
        'account.locked',
        new AccountLockedEvent({ 
          userId: user.value.id,
          reason: 'Too many failed login attempts',
          deliveryMethod: contactMethod.type,
          recipient: contactMethod.value,
          resetToken: resetToken
          }
        ))

        return fromNullable({
          requiresOTP: false,
          sessionToken: '',
          message: `Instructions sent to ${contactMethod.type} to change your password. Please verify to continue.`,
          accountLocked: true
        });
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
      // 9. Create a pending auth session instead of exposing user data
      const sessionToken = this.generateSessionToken();

      // Store session temporarily 
      await this.cacheManager.set(`auth_session:${sessionToken}`, {
        userId: user.value.id,
        deliveryMethod: contactMethod.type,
        recipient: contactMethod,
        expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
      }, 300); // 5 minutes TTL

      return fromNullable({
        requiresOTP: true,
        sessionToken,
        message: `OTP sent to your ${contactMethod.type}. Please verify to continue.`,
        accountLocked: false
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
      accountLocked: false
    });
  }

  private generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  private generateResetToken(): string {
    // Generate a secure random token
    return randomBytes(32).toString('hex');
  }
}
