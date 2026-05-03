"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CompetitionsRedirect({
  params,
}: {
  params: { teamId: string };
}) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/teams/${params.teamId}/matches?tab=competiciones`);
  }, [router, params.teamId]);
  return null;
}
