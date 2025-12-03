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
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { isNone, getOrThrowWith } from 'effect/Option';

interface AuthSession {
  userId: string;
  recipient: ContactMethod;
  deliveryMethod: 'EMAIL' | 'SMS';
  expiresAt: number;
}
import { JwtAuthService } from '../../../application/service/jwt-auth-service.interface';
import { JWT_AUTH_SERVICE } from '../../../auth.tokens';
import { USER_REPOSITORY } from '../../../../user/user.tokens';
import { AuthUser } from '../presentation/dto/auth-user.dto';
import { RefreshTokenBody } from '../presentation/body/refresh-token.body';
import { LoginUseCase } from '../../../application/use-case/login.use-case';
import { LoginResponse } from '../presentation/dto/login-response.dto';
import { SignupUseCase } from '../../../application/use-case/signup.use-case';
import { RequestOTPUseCase } from '../../../application/use-case/request-otp.use-case';
import { LoginResult } from '../../../application/command/login.command';
import { RequestPasswordResetUseCase } from '../../../application/use-case/request-password-reset.use-case';
import { ResetPasswordUseCase } from '../../../application/use-case/reset-password.use-case';
import { Disable2FAUseCase } from '../../../application/use-case/disable-2fa.use-case';
import { Enable2FAUseCase } from '../../../application/use-case/enable-2fa.use-case';
import { RequestPasswordResetBody } from '../presentation/body/request-password-reset.body';
import { ResetPasswordBody } from '../presentation/body/reset-password.body';
import { PasswordResetResponseDto } from '../presentation/dto/password-reset-response.dto';
import { ContactMethod } from 'src/modules/user/domain/value-object/contactInfo/contact-method.interface';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    @Inject(JWT_AUTH_SERVICE)
    private readonly jwtAuth: JwtAuthService,
    private readonly signupUseCase: SignupUseCase,
    private readonly requestOTPUseCase: RequestOTPUseCase,
    private readonly requestPasswordResetUseCase: RequestPasswordResetUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly disable2FAUseCase: Disable2FAUseCase,
    private readonly enable2FAUseCase: Enable2FAUseCase,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: any,
  ) {}

  @PublicApi()
  @Post('/login')
  async login(@Body() body: LoginBody): Promise<LoginResult> {
    const loginResponse: LoginResponse = getOrThrowWith(
      await this.loginUseCase.execute(body),
      () => new UnauthorizedException('Login Error!'),
    );

    if (loginResponse.accountLocked) {
      return {
        message: loginResponse.message ?? 'Instructions sent. Please verify to continue.',
        accountLocked: true
      };
    }

    if (loginResponse.requiresOTP) {
      // Get session data from cache
      const sessionData = await this.cacheManager.get(`auth_session:${loginResponse.sessionToken!}`) as AuthSession;
      if (!sessionData) {
        throw new UnauthorizedException('Session expired. Please login again.');
      }

      // Send OTP synchronously - fail fast if it fails
      try {
        // Get user data to determine contact method
        const userOption = await this.userRepository.getUserById(sessionData.userId);
        if (isNone(userOption)) {
          throw new UnauthorizedException('User not found.');
        }

        await this.requestOTPUseCase.execute({
          recipient: sessionData.recipient,
          deliveryMethod: sessionData.deliveryMethod,
          isResend: false,
        });
      } catch (otpError) {
        throw new UnauthorizedException(otpError);
      }

      return {
        requiresOTP: true,
        sessionToken: loginResponse.sessionToken!,
        message: loginResponse.message ?? 'OTP sent. Please verify to continue.',
        accountLocked: false
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
    return getOrThrowWith(
      await this.signupUseCase.execute(body),
      () => new UnauthorizedException('Signup Error!'),
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
