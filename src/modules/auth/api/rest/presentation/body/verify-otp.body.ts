import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class VerifyOTPBody {
  @ValidateIf(o => !o.phoneNumber)
  @IsNotEmpty({ message: 'Email is required when phone number is not provided' })
  @IsEmail()
  @IsString()
  @IsOptional()
  email?: string;

  @ValidateIf(o => !o.email)
  @IsNotEmpty({ message: 'Phone number is required when email is not provided' })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  phoneNumber?: string;

  @IsNotEmpty()
  @IsString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  otpCode!: string;
}
