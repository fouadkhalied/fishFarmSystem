import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Option, some, none } from 'effect/Option';

interface CachedPasswordReset {
  id: string;
  userId: string;
  tokenHash: string;
  email?: string;
  phoneNumber?: string;
  expiresAt: string;
}

@Injectable()
export class PasswordResetCache {
  private readonly RESET_KEY = (token: string) => `password_reset:${token}`;
  private readonly USER_RESET_KEY = (userId: string) => `password_reset_user:${userId}`;
  private readonly RESET_TTL_SECONDS = 1800; // 30 minutes

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) {}

  async createPasswordReset(
    userId: string,
    token: string,
    email?: string,
    phoneNumber?: string,
  ): Promise<boolean> {
    try {
      const tokenHash = this.hashToken(token);
      const cachedReset: CachedPasswordReset = {
        id: this.generateId(),
        userId,
        tokenHash,
        email,
        phoneNumber,
        expiresAt: new Date(Date.now() + this.RESET_TTL_SECONDS * 1000).toISOString(),
      };

      // Store reset token
      await this.cache.set(
        this.RESET_KEY(token),
        JSON.stringify(cachedReset),
        this.RESET_TTL_SECONDS * 1000,
      );

      // Store reference to user (for cleanup)
      await this.cache.set(
        this.USER_RESET_KEY(userId),
        token,
        this.RESET_TTL_SECONDS * 1000,
      );

      return true;
    } catch (error) {
      console.error('Error creating password reset:', error);
      return false;
    }
  }

  async verifyPasswordResetToken(token: string): Promise<Option<{ userId: string; email?: string; phoneNumber?: string }>> {
    const cached = await this.cache.get<string>(this.RESET_KEY(token));

    if (!cached) {
      return none();
    }

    const resetData: CachedPasswordReset = JSON.parse(cached);

    // Check if token is expired
    if (new Date(resetData.expiresAt) < new Date()) {
      // Clean up expired token
      await this.invalidateToken(token);
      return none();
    }

    return some({
      userId: resetData.userId,
      email: resetData.email,
      phoneNumber: resetData.phoneNumber,
    });
  }

  async invalidateToken(token: string): Promise<void> {
    const cached = await this.cache.get<string>(this.RESET_KEY(token));

    if (cached) {
      const resetData: CachedPasswordReset = JSON.parse(cached);
      // Clean up user reference
      await this.cache.del(this.USER_RESET_KEY(resetData.userId));
    }

    // Remove token
    await this.cache.del(this.RESET_KEY(token));
  }

  async invalidateUserTokens(userId: string): Promise<void> {
    const token = await this.cache.get<string>(this.USER_RESET_KEY(userId));

    if (token) {
      await this.cache.del(this.RESET_KEY(token));
    }

    await this.cache.del(this.USER_RESET_KEY(userId));
  }

  private hashToken(token: string): string {
    // Simple hash for demo - in production use proper crypto
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateId(): string {
    return require('crypto').randomUUID();
  }
}
