import { ContactMethod, ContactMethodType } from './contact-method.interface';

export class EmailContactMethod implements ContactMethod {
  readonly type: ContactMethodType = 'EMAIL';
  
  constructor(readonly value: string) {
    if (!this.validate()) {
      throw new Error('Invalid email format');
    }
  }
  
  validate(): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(this.value);
  }
  
  mask(): string {
    const [local, domain] = this.value.split('@');
    return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
  }
}