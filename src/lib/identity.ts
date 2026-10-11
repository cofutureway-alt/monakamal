import type { Profile } from "@/contexts/AuthContext";
import { isSyntheticEmail } from "@/lib/phone";

// Best label to display for the user (phone > real email > auth email)
export function displayIdentity(profile: Profile | null, userEmail?: string | null): string {
  if (!profile) return userEmail || "";
  return (
    profile.phone_number ||
    profile.email ||
    (profile.auth_email && !isSyntheticEmail(profile.auth_email)
      ? profile.auth_email
      : "") ||
    userEmail ||
    ""
  );
}
