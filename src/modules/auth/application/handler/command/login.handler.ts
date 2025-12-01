import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { getOrThrowWith } from 'effect/Option';
import { UnauthorizedException, Inject } from '@nestjs/common';
import { LoginCommand, LoginResult } from '../../command/login.command';
import { LoginUseCase } from '../../use-case/login.use-case';
import { JwtAuthService } from '../../service/jwt-auth-service.interface';
import { JWT_AUTH_SERVICE } from '../../../auth.tokens';
import { AuthUser } from '../../../api/rest/presentation/dto/auth-user.dto';
import { RequestOTPUseCase } from '../../use-case/request-otp.use-case';
import { LoginResponse } from 'src/modules/auth/api/rest/presentation/dto/login-response.dto';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, LoginResult> {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    @Inject(JWT_AUTH_SERVICE)
    private readonly jwtAuthService: JwtAuthService,
    private readonly requestOTPUseCase: RequestOTPUseCase,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const body = {
      email: command.email,
      phoneNumber: command.phoneNumber,
      password: command.password
    };

    const loginResponse: LoginResponse = getOrThrowWith(
      await this.loginUseCase.execute(body),
      () => new UnauthorizedException('Login Error!'),
    );

    if (loginResponse.requiresOTP) {
      // Request OTP in background (fire and forget)
      if (loginResponse.deliveryMethod && (loginResponse.userEmail || loginResponse.userPhoneNumber)) {
        getOrThrowWith(
          await this.requestOTPUseCase
          .execute({
            email: loginResponse.userEmail || undefined,
            phoneNumber: loginResponse.userPhoneNumber || undefined,
            deliveryMethod: loginResponse.deliveryMethod,
            isResend: false,
          }),
          () => new UnauthorizedException('Login Error!')
        )
        
      }

      return {
        requiresOTP: true,
        sessionToken: loginResponse.sessionToken!,
        message:
          loginResponse.message ??
          'OTP sent to your email/phone. Please verify to continue.',
      };
    }

    const user = loginResponse.user as AuthUser;
    const jwtUser = await this.jwtAuthService.generateJwtUser(user);

    return {
      ...jwtUser,
      requiresOTP: false,
    };
  }
}