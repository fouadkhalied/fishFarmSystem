import { Injectable } from '@nestjs/common';
import { fromNullable, isSome, map, Option, some } from 'effect/Option';
import { UserRepository } from '../../../domain/repository/user.repository.interface';
import { UserState } from '../../../domain/value-object/user-state.enum';
import { EntityRepository, QueryBuilder } from '@mikro-orm/postgresql';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Collection } from '../../../../../libs/api/rest/collection.interface';
import { UserParams } from '../../../api/rest/presentation/params/user.params';
import { endOfDay, startOfDay } from 'date-fns';
import { SortingType } from '../../../../../libs/api/rest/sorting-type.enum';
import { User, UserProps } from '../../../domain/entity/user.entity';
import { UserMapper } from '../mapper/user.mapper';
import { UserEntity } from '../entity/user.entity';
import { pipe } from 'effect';
import { UserCache } from '../../cache/user.cache';
import { Password } from '../../../domain/value-object/password.value-object';

@Injectable()
export class UserRepositoryImpl implements UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly mikroOrmRepository: EntityRepository<UserEntity>,
    private readonly mapper: UserMapper,
    private readonly userCache: UserCache,
  ) {}

  async getUserByEmail(email: string): Promise<Option<User>> {
    // Try cache first
    const cachedUser = await this.userCache.getUserByEmail(email);
    if (isSome(cachedUser)) {
      return cachedUser;
    }

    // Fetch from database
    const userEntity = await this.mikroOrmRepository.findOne({ email: email });
    if (!userEntity) {
      return fromNullable(null);
    }

    const domainUser = this.mapper.toDomain(userEntity);

    // Cache the user for future requests
    await this.userCache.setUser(domainUser);

    return some(domainUser);
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<Option<User>> {
    // Try cache first
    const cachedUser = await this.userCache.getUserByPhoneNumber(phoneNumber);
    if (isSome(cachedUser)) {
      return cachedUser;
    }

    // Fetch from database
    const userEntity = await this.mikroOrmRepository.findOne({ phoneNumber: phoneNumber });
    if (!userEntity) {
      return fromNullable(null);
    }

    const domainUser = this.mapper.toDomain(userEntity);

    // Cache the user for future requests
    await this.userCache.setUser(domainUser);

    return some(domainUser);
  }

  async getUserById(id: string): Promise<Option<User>> {
    // Try cache first
    const cachedUser = await this.userCache.getUserById(id);
    if (isSome(cachedUser)) {
      return cachedUser;
    }

    // Fetch from database
    const userEntity = await this.mikroOrmRepository.findOne({ id: id });
    if (!userEntity) {
      return fromNullable(null);
    }

    const domainUser = this.mapper.toDomain(userEntity);

    // Cache the user for future requests
    await this.userCache.setUser(domainUser);

    return some(domainUser);
  }

  async checkActiveUserById(id: string): Promise<boolean> {
    return isSome(
      fromNullable(
        await this.mikroOrmRepository.findOne({ id, state: UserState.ACTIVE }),
      ),
    );
  }

  async createUser(data: UserProps): Promise<Option<User>> {
    const entity = this.mikroOrmRepository.create({
      email: data.email,
      password: data.password.value,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: data.phoneNumber || null, 
      twoFactorEnabled: data.twoFactorEnabled,
      role: data.role,
      state: data.state,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await this.mikroOrmRepository.insert(entity);
    return pipe(map(fromNullable(entity), this.mapper.toDomain), (user) => {
      if (isSome(user)) user.value.create();
      return user;
    });
  }

  async lock(userId: string): Promise<Option<User>> {
    const entity = await this.mikroOrmRepository.findOne({ id: userId });

    if (!entity) {
      return fromNullable(null);
    }

    try {
      // Try to update using MikroORM entity
      entity.state = UserState.LOCKED;
      await this.mikroOrmRepository.getEntityManager().flush();
    } catch (error: any) {
      // If column doesn't exist, use raw SQL update
      if (error.message?.includes('InvalidFieldNameException') || error.message?.includes('state')) {
        await this.mikroOrmRepository.getEntityManager()
          .getConnection()
          .execute('UPDATE users SET state = ? WHERE id = ?', [UserState.LOCKED, userId]);
      } else {
        throw error;
      }
    }

    const domainUser = this.mapper.toDomain(entity);

    // Invalidate cache since user state changed
    await this.userCache.invalidateUser(userId, domainUser.email, domainUser.phoneNumber || undefined);

    return some(domainUser);
  }

  async changePassword(userId: string, newPassword: string): Promise<Option<User>> {
    const entity = await this.mikroOrmRepository.findOne({ id: userId });

    if (!entity) {
      return fromNullable(null);
    }

    // Hash the new password
    const hashedPassword = await Password.fromPlainText(newPassword);
    entity.password = hashedPassword.value;
    entity.state = UserState.ACTIVE;
    entity.updatedAt = new Date();

    try {
      await this.mikroOrmRepository.getEntityManager().flush();
    } catch (error) {
      console.error('Error changing password:', error);
      return fromNullable(null);
    }

    const domainUser = this.mapper.toDomain(entity);

    // Invalidate cache for security - user may need to re-authenticate
    await this.userCache.invalidateUser(userId, domainUser.email, domainUser.phoneNumber || undefined);

    return some(domainUser);
  }

  async updateUser(userId: string, updates: Partial<UserProps>): Promise<Option<User>> {
    const entity = await this.mikroOrmRepository.findOne({ id: userId });

    if (!entity) {
      return fromNullable(null);
    }

    // Store old values for cache invalidation
    const oldEmail = entity.email;
    const oldPhoneNumber = entity.phoneNumber;

    // Apply updates
    if (updates.email) entity.email = updates.email;
    if (updates.phoneNumber !== undefined) entity.phoneNumber = updates.phoneNumber;
    if (updates.firstName !== undefined) entity.firstName = updates.firstName;
    if (updates.lastName !== undefined) entity.lastName = updates.lastName;
    if (updates.role) entity.role = updates.role;
    if (updates.state) entity.state = updates.state;
    if (updates.twoFactorEnabled !== undefined) entity.twoFactorEnabled = updates.twoFactorEnabled;

    entity.updatedAt = new Date();

    try {
      await this.mikroOrmRepository.getEntityManager().flush();
    } catch (error) {
      console.error('Error updating user:', error);
      return fromNullable(null);
    }

    const domainUser = this.mapper.toDomain(entity);

    // Invalidate old cache keys and cache new data
    await this.userCache.invalidateUser(userId, oldEmail, oldPhoneNumber || undefined);
    await this.userCache.setUser(domainUser);

    return some(domainUser);
  }

  async disable2FA(userId: string): Promise<Option<User>> {
    return this.updateUser(userId, { twoFactorEnabled: false });
  }

  async enable2FA(userId: string): Promise<Option<User>> {
    return this.updateUser(userId, { twoFactorEnabled: true });
  }

  async getAllUsers(params?: UserParams): Promise<Collection<User>> {
    const queryBuilder = this.mikroOrmRepository.createQueryBuilder('user');
    if (params) this.applyFilters(queryBuilder, params);
    const [items, total] = await queryBuilder.getResultAndCount();
    return {
      items: items.map(this.mapper.toDomain),
      total,
    };
  }

  private applyFilters(
    queryBuilder: QueryBuilder<UserEntity>,
    params: UserParams,
  ) {
    const filters = [
      params.filter?.id && {
        id: params.filter.id,
      },
      params.filter?.firstName && {
        firstName: {
          $ilike: `%${params.filter.firstName}%`,
        },
      },
      params.filter?.lastName && {
        lastName: {
          $ilike: `%${params.filter.lastName}%`,
        },
      },
      params.filter?.email && {
        email: {
          $ilike: `%${params.filter.email}%`,
        },
      },
      params.filter?.createdAt && {
        createdAt: {
          $gte: startOfDay(params.filter.createdAt),
          $lte: endOfDay(params.filter.createdAt),
        },
      },
    ];
    filters.filter(Boolean).forEach((filter) => {
      if (filter) queryBuilder.andWhere(filter);
    });
    if (params.sort?.createdAt)
      queryBuilder.orderBy({ createdAt: params?.sort?.createdAt });
    else queryBuilder.orderBy({ createdAt: SortingType.DESC });
    queryBuilder.offset(params.offset);
    queryBuilder.limit(params.limit);
  }
}
