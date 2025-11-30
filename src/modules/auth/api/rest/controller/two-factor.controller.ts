
import {
    Body,
    Controller,
    HttpCode,
    HttpStatus,
    Inject,
    Post,
    UnauthorizedException,
  } from '@nestjs/common';
  import { RequestOTPBody } from '../presentation/body/request-otp.body';
  import { VerifyOTPBody } from '../presentation/body/verify-otp.body';
  import { ResendOTPBody } from '../presentation/body/resend-otp.body';
  import { OTPResponseDto } from '../presentation/dto/otp-response.dto';
  import { VerifyOTPResponseDto } from '../presentation/dto/verify-otp-response.dto';
  import {
    PublicApi,
  } from '../../../../../libs/decorator/auth.decorator';
  import { getOrThrowWith, isNone } from 'effect/Option';
  import { JwtAuthService } from '../../../application/service/jwt-auth-service.interface';
  import { JWT_AUTH_SERVICE } from '../../../auth.tokens';
  import { RequestOTPUseCase } from '../../../application/use-case/request-otp.use-case';
  import { VerifyOTPUseCase } from '../../../application/use-case/verify-otp.use-case';

  @Controller('2FA')
  export class TwoFactorController {
    constructor(
      private readonly requestOTPUseCase: RequestOTPUseCase,
      private readonly verifyOTPUseCase: VerifyOTPUseCase,
      @Inject(JWT_AUTH_SERVICE)
      private readonly jwtAuthService: JwtAuthService,
    ) {}
  
    @PublicApi()
    @Post('request')
    @HttpCode(HttpStatus.OK)
    async requestOTP(@Body() body: RequestOTPBody): Promise<OTPResponseDto> {
      const result = await this.requestOTPUseCase.execute({
        email: body.email,
        password: body.password,
        deliveryMethod: body.deliveryMethod || 'EMAIL',
        isResend: false,
      });

      if (isNone(result)) {
        throw new UnauthorizedException('Invalid credentials');
      }
  
      return {
        success: true,
        message: 'OTP sent successfully',
        expiresIn: 300, // 5 minutes
        deliveryMethod: body.deliveryMethod || 'EMAIL',
        maskedRecipient: this.maskEmail(body.email),
        timestamp: new Date(),
      };
    }
  
    @PublicApi()
    @Post('verify')
    @HttpCode(HttpStatus.OK)
    async verifyOTP(
      @Body() body: VerifyOTPBody,
    ): Promise<VerifyOTPResponseDto> {
      const authUser = getOrThrowWith(
        await this.verifyOTPUseCase.execute({
          email: body.email!,
          phoneNumber: body.phoneNumber!,
          otpCode: body.otpCode,
        }),
        () => new UnauthorizedException('Invalid or expired OTP'),
      );
  
      const jwtUser = await this.jwtAuthService.generateJwtUser(authUser);
  
      return {
        success: true,
        message: 'Authentication successful',
        token: jwtUser.token,
        refreshToken: jwtUser.refreshToken,
        expiresIn: jwtUser.expiresIn,
        refreshExpiresIn: jwtUser.refreshExpiresIn,
        user: jwtUser.user,
        timestamp: new Date(),
      };
    }
  
    @PublicApi()
    @Post('resend')
    @HttpCode(HttpStatus.OK)
    async resendOTP(@Body() body: ResendOTPBody): Promise<OTPResponseDto> {
      const result = await this.requestOTPUseCase.execute({
        email: body.email,
        password: '', // Password already validated in original request
        deliveryMethod: body.deliveryMethod || 'EMAIL',
        isResend: true,
      });

      if (isNone(result)) {
        throw new UnauthorizedException('Cannot resend OTP');
      }
  
      return {
        success: true,
        message: 'OTP resent successfully',
        expiresIn: 300,
        deliveryMethod: body.deliveryMethod || 'EMAIL',
        maskedRecipient: this.maskEmail(body.email),
        timestamp: new Date(),
      };
    }
  
    // Helper methods
    private maskEmail(email: string): string {
      const [local, domain] = email.split('@');
      const maskedLocal =
        local.charAt(0) + '***' + local.charAt(local.length - 1);
      return `${maskedLocal}@${domain}`;
    }
    
  }