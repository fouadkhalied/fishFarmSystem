import { IsEmail, IsOptional, IsString } from 'class-validator';

export class RequestPasswordResetBody {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}
