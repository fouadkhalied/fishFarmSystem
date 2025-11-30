import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class LoginAttemptCache {
  private readonly LOGIN_ATTEMPTS_KEY = (userId: string) => `login_attempts:${userId}`;
  private readonly LOGIN_ATTEMPTS_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async getAttemptCount(userId: string): Promise<number> {
    const cached = await this.cache.get<string>(this.LOGIN_ATTEMPTS_KEY(userId));
    if (!cached) {
      return 0;
    }
    return parseInt(cached, 10);
  }

  async incrementAttempt(userId: string): Promise<number> {
    const currentCount = await this.getAttemptCount(userId);
    const newCount = currentCount + 1;
    
    await this.cache.set(
      this.LOGIN_ATTEMPTS_KEY(userId),
      newCount.toString(),
      this.LOGIN_ATTEMPTS_TTL_MS,
    );

    return newCount;
  }

  async deleteAttempts(userId: string): Promise<void> {
    await this.cache.del(this.LOGIN_ATTEMPTS_KEY(userId));
  }

  async shouldLockAccount(userId: string): Promise<boolean> {
    const count = await this.getAttemptCount(userId);
    return count >= this.MAX_ATTEMPTS;
  }
}

