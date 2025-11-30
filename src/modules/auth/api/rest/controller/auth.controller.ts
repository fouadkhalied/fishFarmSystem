import {
  Body,
  Controller,
  Inject,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { LoginBody } from '../presentation/body/login.body';
import { SignupBody } from '../presentation/body/signup.body';
import { PublicApi, InjectAuthUser, AuthRoles } from '../../../../../libs/decorator/auth.decorator';
import { ApiRole } from '../../../../../libs/api/api-role.enum';
import { getOrThrowWith, Option } from 'effect/Option';
import { JwtAuthService } from '../../../application/service/jwt-auth-service.interface';
import { JWT_AUTH_SERVICE, LOGIN_USE_CASE, SIGNUP_USE_CASE } from '../../../auth.tokens';
import { UseCase } from '../../../../../libs/ddd/use-case.interface';
import { AuthUser } from '../presentation/dto/auth-user.dto';
import { RefreshTokenBody } from '../presentation/body/refresh-token.body';
import { LoginUseCase } from '../../../application/use-case/login.use-case';
import { LoginResponse } from '../presentation/dto/login-response.dto';
import { RequestOTPUseCase } from '../../../application/use-case/request-otp.use-case';
import { LoginResult } from '../../../application/command/login.command';
import { RequestPasswordResetUseCase } from '../../../application/use-case/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../../application/use-case/reset-password.use-case';
import { Disable2FAUseCase } from '../../../application/use-case/disable-2fa.use-case';
import { Enable2FAUseCase } from '../../../application/use-case/enable-2fa.use-case';
import { RequestPasswordResetBody } from '../presentation/body/request-password-reset.body';
import { ResetPasswordBody } from '../presentation/body/reset-password.body';
import { PasswordResetResponseDto } from '../presentation/dto/password-reset-response.dto';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(LOGIN_USE_CASE)
    private readonly loginUseCase: LoginUseCase,
    @Inject(JWT_AUTH_SERVICE)
    private readonly jwtAuth: JwtAuthService,
    @Inject(SIGNUP_USE_CASE)
    private readonly signupUseCase: UseCase<SignupBody, Option<AuthUser>>,
    private readonly requestOTPUseCase: RequestOTPUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly disable2FAUseCase: Disable2FAUseCase,
    private readonly enable2FAUseCase: Enable2FAUseCase,
  ) {}

  @PublicApi()
  @Post('/login')
  async login(@Body() body: LoginBody): Promise<LoginResult> {
    const loginResponse: LoginResponse = getOrThrowWith(
      await this.loginUseCase.execute(body),
      () => new UnauthorizedException('Login Error!'),
    );

    if (loginResponse.requiresOTP) {
      // Request OTP in background (fire and forget)
      if (loginResponse.deliveryMethod && (loginResponse.userEmail || loginResponse.userPhoneNumber)) {
        this.requestOTPUseCase
          .execute({
            email: loginResponse.userEmail,
            phoneNumber: loginResponse.userPhoneNumber !== null ? loginResponse.userPhoneNumber : undefined,
            deliveryMethod: loginResponse.deliveryMethod,
            isResend: false,
          })
          .catch(error => {
            // Log error but don't block the response
            console.error('Failed to send OTP:', error);
          });
      }

      return {
        requiresOTP: true,
        message:
          loginResponse.message ??
          'OTP sent to your email/phone. Please verify to continue.',
      };
    }

    const user = loginResponse.user as AuthUser;
    const jwtUser = await this.jwtAuth.generateJwtUser(user);

    return {
      ...jwtUser,
      requiresOTP: false,
    };
  }

  @AuthRoles(ApiRole.ADMIN)
  @Post('/signup')
  async signup(@Body() body: SignupBody) {
    return this.jwtAuth.generateJwtUser(
      getOrThrowWith(
        await this.signupUseCase.execute(body),
        () => new UnauthorizedException('Signup Error!'),
      ),
    );
  }

  @PublicApi()
  @Post('/token/refresh')
  async refreshToken(@Body() body: RefreshTokenBody) {
    return this.jwtAuth.generateJwtUserFromRefresh(body.token);
  }

  @PublicApi()
  @Post('/password/reset-request')
  async requestPasswordReset(
    @Body() body: RequestPasswordResetBody,
  ): Promise<PasswordResetResponseDto> {
    const success = await this.requestPasswordResetUseCase.execute({
      email: body.email,
      phoneNumber: body.phoneNumber,
    });

    return {
      success,
      message: success
        ? 'Password reset instructions sent to your email/phone'
        : 'Failed to send password reset instructions',
    };
  }

  @PublicApi()
  @Post('/password/reset')
  async resetPassword(
    @Body() body: ResetPasswordBody,
  ): Promise<PasswordResetResponseDto> {
    const success = await this.resetPasswordUseCase.execute({
      token: body.token,
      newPassword: body.newPassword,
      email: body.email,
      phoneNumber: body.phoneNumber,
    });

    return {
      success,
      message: success
        ? 'Password reset successfully'
        : 'Failed to reset password',
    };
  }

  @AuthRoles(ApiRole.MANAGER)
  @Put('/2FA/enable')
  async enable2FA(@InjectAuthUser() user: any): Promise<PasswordResetResponseDto> {
    const success = await this.enable2FAUseCase.execute({
      userId: user.id,
    });

    return {
      success,
      message: success
        ? '2FA has been enabled successfully'
        : 'Failed to enable 2FA',
    };
  }

  @AuthRoles(ApiRole.MANAGER)
  @Put('/2FA/disable')
  async disable2FA(@InjectAuthUser() user: any): Promise<PasswordResetResponseDto> {
    const success = await this.disable2FAUseCase.execute({
      userId: user.id,
    });

    return {
      success,
      message: success
        ? '2FA has been disabled successfully'
        : 'Failed to disable 2FA',
    };
  }
}
