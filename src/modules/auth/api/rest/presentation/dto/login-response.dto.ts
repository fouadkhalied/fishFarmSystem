import { AuthUser } from "./auth-user.dto";

export interface LoginResponse {
    requiresOTP: boolean;
    user?: AuthUser;
    message?: string;
    deliveryMethod?: string;
    userEmail?: string;
    userPhoneNumber?: string | null;
  }