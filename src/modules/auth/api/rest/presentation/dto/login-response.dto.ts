import { ContactMethod } from "src/modules/user/domain/value-object/contactInfo/contact-method.interface";
import { AuthUser } from "./auth-user.dto";

export interface LoginResponse {
    requiresOTP: boolean;
    user?: AuthUser;
    message?: string;
    deliveryMethod?: string;
    recipient?: ContactMethod;
    sessionToken?: string;
  }