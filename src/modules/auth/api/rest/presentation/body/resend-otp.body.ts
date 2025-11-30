import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OTPDeliveryMethod } from './request-otp.body';

export class ResendOTPBody {
  @IsNotEmpty()
  @IsEmail()
  @IsString()
  email!: string;

  @IsNotEmpty()
  @IsEmail()
  @IsString()
  password!: string;

  @IsOptional()
  @IsEnum(OTPDeliveryMethod)
  deliveryMethod?: OTPDeliveryMethod = OTPDeliveryMethod.EMAIL;
  
}