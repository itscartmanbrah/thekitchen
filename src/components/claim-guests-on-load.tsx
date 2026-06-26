'use client'

import { useEffect } from 'react'
import { claimOpenPlayGuests } from '@/lib/claim-guests'

// Runs once when a signed-in user lands in the app — links any Open Play guest
// check-ins from this device to their account. Covers OAuth (Google), where the
// server callback can't run the client-side claim.
export function ClaimGuestsOnLoad() {
  useEffect(() => { claimOpenPlayGuests() }, [])
  return null
}
