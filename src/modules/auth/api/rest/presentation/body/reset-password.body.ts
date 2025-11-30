import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ResetPasswordBody {
  @IsNotEmpty()
  @IsString()
  token!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  newPassword!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
