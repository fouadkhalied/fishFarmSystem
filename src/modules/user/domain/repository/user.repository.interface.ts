import { Option } from 'effect/Option';
import { Collection } from '../../../../libs/api/rest/collection.interface';
import { PaginatedQueryParams } from '../../../../libs/api/rest/paginated-query-params.dto';
import { User, UserProps } from '../entity/user.entity';

export interface UserRepository {
  createUser(data: UserProps): Promise<Option<User>>;

  getUserByEmail(email: string): Promise<Option<User>>;

  getUserByPhoneNumber(phoneNumber: string): Promise<Option<User>>;

  getUserById(id: string): Promise<Option<User>>;

  checkActiveUserById(id: string): Promise<boolean>;

  lock(userId: string): Promise<Option<User>>;

  changePassword(userId: string, newPassword: string): Promise<Option<User>>;

  updateUser(userId: string, updates: Partial<UserProps>): Promise<Option<User>>;

  disable2FA(userId: string): Promise<Option<User>>;

  enable2FA(userId: string): Promise<Option<User>>;

  getAllUsers<T extends PaginatedQueryParams>(
    params?: T,
  ): Promise<Collection<User>>;
}
