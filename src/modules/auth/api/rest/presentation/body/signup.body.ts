import { LoginBody } from './login.body';
import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { ApiRole } from '../../../../../../libs/api/api-role.enum';

export class SignupBody extends LoginBody {
  @IsNotEmpty()
  @IsString()
  firstName!: string;

  @IsNotEmpty()
  @IsString()
  lastName!: string;

  @IsNotEmpty()
  @IsIn([ApiRole.ADMIN, ApiRole.ACCOUNTANT, ApiRole.TECNICAN])
  role!: ApiRole;
}
