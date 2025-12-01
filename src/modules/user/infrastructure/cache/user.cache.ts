import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Option, some, none } from 'effect/Option';
import { User } from '../../domain/entity/user.entity';
import { UserRole } from '../../domain/value-object/user-role.enum';
import { UserState } from '../../domain/value-object/user-state.enum';
import { Password } from '../../domain/value-object/password.value-object';

interface CachedUser {
  id: string;
  email: string;
  password: string;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  role: number;
  state: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class UserCache {
  private readonly USER_BY_ID_KEY = (userId: string) => `user:id:${userId}`;
  private readonly USER_BY_EMAIL_KEY = (email: string) => `user:email:${email}`;
  private readonly USER_BY_PHONE_KEY = (phoneNumber: string) => `user:phone:${phoneNumber}`;
  private readonly USER_TTL_SECONDS = 3600; // 1 hour

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async setUser(user: User): Promise<void> {
    const cachedUser: CachedUser = {
      id: user.id,
      email: user.props.email,
      password: user.props.password.value,
      phoneNumber: user.props.phoneNumber,
      firstName: user.props.firstName || null,
      lastName: user.props.lastName || null,
      role: user.props.role as number,
      state: user.props.state,
      twoFactorEnabled: user.props.twoFactorEnabled,
      createdAt: user.props.createdAt?.toISOString() || new Date().toISOString(),
      updatedAt: user.props.updatedAt?.toISOString() || new Date().toISOString(),
    };

    const userJson = JSON.stringify(cachedUser);

    // Store user with multiple keys for fast access
    await Promise.all([
      this.cache.set(this.USER_BY_ID_KEY(user.id), userJson, this.USER_TTL_SECONDS * 1000),
      this.cache.set(this.USER_BY_EMAIL_KEY(user.props.email), userJson, this.USER_TTL_SECONDS * 1000),
      user.props.phoneNumber && this.cache.set(this.USER_BY_PHONE_KEY(user.props.phoneNumber), userJson, this.USER_TTL_SECONDS * 1000),
    ].filter(Boolean));
  }

  async getUserById(userId: string): Promise<Option<User>> {
    const cached = await this.cache.get<string>(this.USER_BY_ID_KEY(userId));

    if (!cached) {
      return none();
    }

    return some(this.deserializeUser(JSON.parse(cached)));
  }

  async getUserByEmail(email: string): Promise<Option<User>> {
    const cached = await this.cache.get<string>(this.USER_BY_EMAIL_KEY(email));

    if (!cached) {
      return none();
    }

    return some(this.deserializeUser(JSON.parse(cached)));
  }

  async getUserByPhoneNumber(phoneNumber: string): Promise<Option<User>> {
    const cached = await this.cache.get<string>(this.USER_BY_PHONE_KEY(phoneNumber));

    if (!cached) {
      return none();
    }

    return some(this.deserializeUser(JSON.parse(cached)));
  }

  async invalidateUser(userId: string, email: string, phoneNumber?: string): Promise<void> {
    await Promise.all([
      this.cache.del(this.USER_BY_ID_KEY(userId)),
      this.cache.del(this.USER_BY_EMAIL_KEY(email)),
      phoneNumber && this.cache.del(this.USER_BY_PHONE_KEY(phoneNumber)),
    ].filter(Boolean));
  }

  async invalidateAllUsers(): Promise<void> {
    // Note: This is a simplified approach. In production, you might want to use
    // Redis SCAN or maintain a set of all user keys for efficient cleanup
    // For now, we'll rely on TTL expiration
  }



  private deserializeUser(data: CachedUser): User {
    return new User(data.id, {
      email: data.email,
      password: Password.fromHash(data.password), 
      phoneNumber: data.phoneNumber,
      firstName: data.firstName || undefined,
      lastName: data.lastName || undefined,
      role: data.role as UserRole,
      state: data.state as UserState,
      twoFactorEnabled: data.twoFactorEnabled,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
    });
  }
}
