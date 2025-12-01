export type ContactMethodType = 'EMAIL' | 'SMS';

export interface ContactMethod {
  type: ContactMethodType;
  value: string;
  
  validate(): boolean;
  mask(): string;
}