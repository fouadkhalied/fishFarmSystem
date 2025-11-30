import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum OTPDeliveryMethod {
    EMAIL = 'EMAIL',
    SMS = 'SMS',
}


export class RequestOTPBody {
    @IsNotEmpty()
    @IsEmail()
    @IsString()
    email!: string;
  
    @IsNotEmpty()
    @IsString()
    password!: string;
  
    @IsOptional()
    @IsEnum(OTPDeliveryMethod)
    deliveryMethod?: OTPDeliveryMethod = OTPDeliveryMethod.EMAIL;
  
    @IsOptional()
    @IsString()
    deviceFingerprint?: string;
  }