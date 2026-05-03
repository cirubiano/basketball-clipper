"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function OpponentsRedirect() {
  const router = useRouter();
  const { activeProfile } = useAuth();

  useEffect(() => {
    if (activeProfile?.team_id) {
      router.replace(`/teams/${activeProfile.team_id}/matches?tab=rivales`);
    }
  }, [router, activeProfile]);

  return null;
}
