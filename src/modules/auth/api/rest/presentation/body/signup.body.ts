import { LoginBody } from './login.body';
import { IsNotEmpty, IsString, IsIn } from 'class-validator';
import { UserRole } from 'src/modules/user/domain/value-object/user-role.enum';

export class SignupBody extends LoginBody {
  @IsNotEmpty()
  @IsString()
  firstName!: string;

  @IsNotEmpty()
  @IsString()
  lastName!: string;

  @IsNotEmpty()
  @IsIn([UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.TECNICAN])
  role!: UserRole;
}
