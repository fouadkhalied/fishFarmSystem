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
    this.validateLoginInput(body);
    const contactMethod = ContactMethodFactory.fromLoginBody(body);

    const user = await this.findAndValidateUser(contactMethod);
    const isPasswordValid = await this.validatePassword(user, body.password);

    if (!isPasswordValid) {
      return await this.handleFailedLoginAttempt(user, contactMethod);
    }

    await this.handleSuccessfulLogin(user);

    if (this.isTwoFactorEnabled(user)) {
      return this.handleTwoFactorLogin(user, contactMethod);
    }

    return this.createSuccessResponse(user);
  }

  private validateLoginInput(body: LoginBody): void {
    if (!body.email && !body.phoneNumber) {
      throw new BadRequestException('Either email or phone number must be provided');
    }
  }

  private async findAndValidateUser(contactMethod: any) {
    const user = await this.authUserQueryService.findUserByContactMethod(contactMethod);

    if (isNone(user)) {
      throw new UnauthorizedException('User not found!');
    }

    if (user.value.props.state !== UserState.ACTIVE) {
      throw new UnauthorizedException('Account locked! Please change your password');
    }

    return user.value;
  }

  private async validatePassword(user: any, password: string): Promise<boolean> {
    return await user.props.password.matches(password);
  }

  private async handleFailedLoginAttempt(user: any, contactMethod: any): Promise<Option<LoginResponse>> {
    const WRONG_LOGIN_ATTEMPS = 3;
    const newCount = await this.loginAttemptCache.incrementAttempt(user.id);

    if (newCount >= WRONG_LOGIN_ATTEMPS) {
      return await this.lockUserAccount(user, contactMethod);
    }

    const remainingAttempts = WRONG_LOGIN_ATTEMPS - newCount;
    throw new UnauthorizedException(`Invalid Credentials! Attempts remaining: ${remainingAttempts}`);
  }

  private async lockUserAccount(user: any, contactMethod: any): Promise<Option<LoginResponse>> {
    user.recordFailedLogin();
    await this.userRepository.lock(user.id);

    // Generate reset token
    const resetToken = this.generateResetToken();

    // Store reset token
    const success = await this.passwordResetCache.createPasswordReset(
      user.id,
      resetToken
    );

    if (!success) {
      throw new BadRequestException('Failed to create password reset request');
    }

    this.eventEmitter.emit(
      'account.locked',
      new AccountLockedEvent({
        userId: user.id,
        reason: 'Too many failed login attempts',
        deliveryMethod: contactMethod.type,
        recipient: contactMethod.value,
        resetToken: resetToken
      })
    );

    return fromNullable({
      requiresOTP: false,
      sessionToken: '',
      message: `Instructions sent to ${contactMethod.type} to change your password. Please verify to continue.`,
      accountLocked: true
    });
  }

  private async handleSuccessfulLogin(user: any): Promise<void> {
    await this.loginAttemptCache.deleteAttempts(user.id);
  }

  private isTwoFactorEnabled(user: any): boolean {
    return user.props.twoFactorEnabled ?? false;
  }

  private handleTwoFactorLogin(user: any, contactMethod: any): Option<LoginResponse> {
    const sessionToken = this.generateSessionToken();

    // Store session temporarily
    this.cacheManager.set(`auth_session:${sessionToken}`, {
      userId: user.id,
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

  private createSuccessResponse(user: any): Option<LoginResponse> {
    return fromNullable({
      requiresOTP: false,
      user: {
        id: user.id,
        email: user.props.email,
        role: user.props.role,
      },
      accountLocked: false
    });
  }

  private generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  private generateResetToken(): string {
    return randomBytes(32).toString('hex');
  }
}
