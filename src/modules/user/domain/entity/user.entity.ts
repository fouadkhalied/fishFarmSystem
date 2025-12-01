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
