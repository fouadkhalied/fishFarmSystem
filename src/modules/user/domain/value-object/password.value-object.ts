import { compare, genSalt, hash } from 'bcryptjs';

export class Password {
  private constructor(
    private readonly hashed: string,
  ) {}

  // Create when user registers → hash is generated here
  static async fromPlainText(plain: string): Promise<Password> {
    if (plain.length < 6) {
      throw new Error('Password too short');
    }

    const hashed = await hash(plain, await genSalt());
    return new Password(hashed);
  }

  // Create when loading from DB
  static fromHash(hash: string): Password {
    return new Password(hash);
  }

  // Validate login passwords
  async matches(plain: string): Promise<boolean> {
    return compare(plain, this.hashed);
  }

  // Send to persistence
  get value(): string {
    return this.hashed;
  }
}
