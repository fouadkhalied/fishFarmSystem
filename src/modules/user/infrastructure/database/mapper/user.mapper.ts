import { Injectable } from '@nestjs/common';
import { Mapper } from '../../../../../libs/ddd/mapper.interface';
import { User } from '../../../domain/entity/user.entity';
import { UserEntity } from '../entity/user.entity';
import { Password } from 'src/modules/user/domain/value-object/password.value-object';
import { UserRole } from '../../../domain/value-object/user-role.enum';
import { UserState } from '../../../domain/value-object/user-state.enum';

@Injectable()
export class UserMapper implements Mapper<User, UserEntity> {
  toDomain(record: UserEntity): User {
    return new User(record.id, {
      email: record.email,
      password: Password.fromHash(record.password),
      firstName: record.firstName,
      lastName: record.lastName,
      phoneNumber: record.phoneNumber || null,
      twoFactorEnabled: record.twoFactorEnabled ?? false,
      role: record.role ?? UserRole.MANAGER,
      state: record.state ?? UserState.ACTIVE,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  toPersistence(entity: User): UserEntity {
    const props = entity.props;
    return {
      id: entity.id,
      email: props.email,
      password: props.password.value,
      firstName: props.firstName,
      lastName: props.lastName,
      phoneNumber: props.phoneNumber, 
      twoFactorEnabled: props.twoFactorEnabled,
      role: props.role,
      state: props.state,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    } as UserEntity;
  }
}
