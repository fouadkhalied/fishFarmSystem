import { ContactMethod, ContactMethodType } from './contact-method.interface';

export class PhoneContactMethod implements ContactMethod {
  readonly type: ContactMethodType = 'SMS';
  
  constructor(readonly value: string) {
    if (!this.validate()) {
      throw new Error('Invalid phone format');
    }
  }
  
  validate(): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(this.value);
  }
  
  mask(): string {
    return `${this.value.substring(0, 3)}***${this.value.slice(-4)}`;
  }
}