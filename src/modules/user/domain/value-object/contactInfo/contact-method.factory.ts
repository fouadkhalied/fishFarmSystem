import { ContactMethod } from './contact-method.interface';
import { EmailContactMethod } from './email-contact-method.value-object';
import { PhoneContactMethod } from './phone-contact-method.value-object';

export class ContactMethodFactory {
  static fromLoginBody(body: { email?: string; phoneNumber?: string }): ContactMethod {
    if (body.email) {
      return new EmailContactMethod(body.email);
    } else if (body.phoneNumber) {
      return new PhoneContactMethod(body.phoneNumber);
    }
    
    throw new Error('Either email or phone number must be provided');
  }
}