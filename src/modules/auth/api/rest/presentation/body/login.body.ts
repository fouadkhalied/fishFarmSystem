import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsStrongPassword,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class LoginBody {
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
  @MaxLength(20)
  @IsStrongPassword(
    {
      minLength: 8,
      minSymbols: 1,
    },
    {
      message:
        'Password must be at least 8 characters long and contain at least one symbol',
    },
  )
  password!: string;
}
