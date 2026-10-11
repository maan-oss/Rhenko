"use client"

import { useEffect } from "react"
import { recordProfileVisit } from "@/actions/analytics"

// Records a profile visit when the profile opens. The server counts each person once per window.
export function ProfileVisit({ profileId }: { profileId: string }) {
  useEffect(() => {
    void recordProfileVisit(profileId)
  }, [profileId])
  return null
}
