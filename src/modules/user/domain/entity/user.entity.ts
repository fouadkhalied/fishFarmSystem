import { AggregateRoot } from '@nestjs/cqrs';
import { UserRole } from '../value-object/user-role.enum';
import { UserState } from '../value-object/user-state.enum';
import { CreatedUserEvent } from '../event/created-user.event';
import { Password } from 'src/modules/user/domain/value-object/password.value-object';
import { AccountLockedEvent } from '../../../auth/domain/event/account-locked.event';

export interface UserProps {
  email: string;
  password: Password;
  phoneNumber: string | null;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  state: UserState;
  twoFactorEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export class User extends AggregateRoot {
  id: string;
  props: UserProps;

  constructor(id: string, props: UserProps) {
    super();
    this.id = id;
    this.props = props;
  }

  get email(): string {
    return this.props.email;
  }

  get phoneNumber(): string | null {
    return this.props.phoneNumber;
  }

  get firstName(): string | null {
    return this.props.firstName || null;
  }

  get lastName(): string | null {
    return this.props.lastName || null;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get state(): UserState {
    return this.props.state;
  }

  get twoFactorEnabled(): boolean {
    return this.props.twoFactorEnabled;
  }

  get createdAt(): Date {
    return this.props.createdAt || new Date();
  }

  get updatedAt(): Date {
    return this.props.updatedAt || new Date();
  }

  create() {
    this.apply(new CreatedUserEvent(this));
  }

  recordFailedLogin(): void {
    this.props.state = UserState.LOCKED;

    this.apply(
      new AccountLockedEvent({
        userId: this.id,
        reason: 'Too many failed login attempts',
      }),
    );
  }
}
