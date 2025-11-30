import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { JwtService } from './infrastructure/jwt/jwt.service';
import { AuthGuard } from './api/guard/auth.guard';
import { AuthController } from './api/rest/controller/auth.controller';
import {
  JWT_AUTH_SERVICE,
  LOGIN_USE_CASE,
  SIGNUP_USE_CASE,
  OTP_CACHE,
  OTP_REPOSITORY,
  PASSWORD_RESET_CACHE,
} from './auth.tokens';
import { LoginUseCase } from './application/use-case/login.use-case';
import { SignupUseCase } from './application/use-case/signup.use-case';
import { TwoFactorController } from './api/rest/controller/two-factor.controller';
import { RequestOTPUseCase } from './application/use-case/request-otp.use-case';
import { VerifyOTPUseCase } from './application/use-case/verify-otp.use-case';
import { AuthUserQueryService } from './application/service/auth-user-query.service';

import { UserModule } from '../user/user.module';
import { CommunicationModule } from '../communication/communication.module';
import { SendOTPHandler } from './application/handler/event/send-otp.handler';
import { LoginAttemptCache } from './infrastructure/cache/login-attempt.cache';
import { AccountLockedHandler } from './application/handler/event/account-locked.handler';
import { OTPCache } from './infrastructure/cache/otp.cache';
import { PasswordResetCache } from './infrastructure/cache/password-reset.cache';
import { RequestPasswordResetUseCase } from './application/use-case/request-password-reset.use-case';
import { ResetPasswordUseCase } from './application/use-case/reset-password.use-case';
import { Disable2FAUseCase } from './application/use-case/disable-2fa.use-case';
import { Enable2FAUseCase } from './application/use-case/enable-2fa.use-case';
import { PasswordResetRequestedHandler } from './application/handler/event/password-reset-requested.handler';
import { RequestPasswordResetHandler } from './application/handler/command/request-password-reset.handler';
import { ResetPasswordHandler } from './application/handler/command/reset-password.handler';
import { Disable2FAHandler } from './application/handler/command/disable-2fa.handler';
import { Enable2FAHandler } from './application/handler/command/enable-2fa.handler';

@Module({
  imports: [
    CqrsModule,
    UserModule,
    CommunicationModule,
  ],
  controllers: [AuthController, TwoFactorController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: JWT_AUTH_SERVICE,
      useClass: JwtService,
    },
    {
      provide: LOGIN_USE_CASE,
      useClass: LoginUseCase,
    },
    {
      provide: SIGNUP_USE_CASE,
      useClass: SignupUseCase,
    },
    {
      provide: OTP_CACHE,
      useClass: OTPCache,
    },
    {
      provide: OTP_REPOSITORY,
      useClass: OTPCache,
    },
    {
      provide: PASSWORD_RESET_CACHE,
      useClass: PasswordResetCache,
    },
    // services
    AuthUserQueryService,
    LoginAttemptCache,
    // use-cases
    RequestOTPUseCase,
    VerifyOTPUseCase,
    RequestPasswordResetUseCase,
    ResetPasswordUseCase,
    Disable2FAUseCase,
    Enable2FAUseCase,
    // command handlers
    RequestPasswordResetHandler,
    ResetPasswordHandler,
    Disable2FAHandler,
    Enable2FAHandler,
    // event handlers
    SendOTPHandler,
    AccountLockedHandler,
    PasswordResetRequestedHandler,
  ],
  exports: [],
})
export class AuthModule {}
