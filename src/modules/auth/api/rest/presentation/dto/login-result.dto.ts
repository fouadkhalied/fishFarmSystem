import { JwtUser } from "./jwt-user.dto";

export type LoginResult =
    | (JwtUser & { requiresOTP: false })
    | {
        requiresOTP: true;
        sessionToken: string;
        message: string;
        accountLocked: false;
    }
    | {
        message: string;
        accountLocked: true;
    };