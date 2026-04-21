import type { StaffDetails } from "../staff.ts";

export interface LoginSuccessResponse {
    token: string;
    settings: any; //Was ist dis?
    is_staff: boolean;
    staff_details?: StaffDetails | null;
};