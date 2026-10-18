"use client"

import Link from "next/link"
import { useActionState, useState, useTransition } from "react"
import { useFormStatus } from "react-dom"
import { toast } from "sonner"
import { createAdAccount, createCampaign, setCampaignPaused, startAdCredit, type FormState } from "@/actions/ads"
import { ErrorLine, Field, FIELD_INPUT } from "@/components/app/form-bits"
import { Button } from "@/components/ui/button"
import { ADD_CREDIT_OPTIONS, AD_BODY_MAX, AD_CTA_MAX, AD_HEADLINE_MAX, AD_LINK_MAX, AD_TOPIC_MAX } from "@/lib/ad-rules"
import { formatMoney } from "@/lib/money"

export type CampaignRow = {
  id: string
  headline: string
  status: "in_review" | "rejected" | "active" | "paused" | "ended"
  review_note: string | null
  budget: number
  spent: number
  impressions: number
  clicks: number
}

export type AdvertiseData = {
  account: { businessName: string; country: string; contactEmail: string; balance: number } | null
  currency: string
  paymentsReady: boolean
  campaigns: CampaignRow[]
  creditAdded: boolean
  adult: boolean
}

const STATUS: Record<CampaignRow["status"], string> = {
  in_review: "Waiting for review",
  rejected: "Not approved",
  active: "Running",
  paused: "Paused",
  ended: "Ended",
}

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="h-10 rounded-full px-5 font-semibold">
      {pending ? pendingLabel : label}
    </Button>
  )
}

// The advertiser's page: the account, the balance, campaigns and how each one is doing. Everything here is a plain form
// that the server checks again, so nothing relies on this page alone.
export function AdvertisePanel({ data }: { data: AdvertiseData }) {
  if (!data.adult) {
    return <p className="px-4 py-4 text-[15px] text-muted-foreground">Advertising is for adults with a birthday on their account.</p>
  }
  return (
    <div className="flex flex-col">
      {data.account ? <Balance data={data} /> : <AccountForm />}
      {data.account ? <Campaigns data={data} /> : null}
      <section className="flex flex-col gap-2 px-4 py-4 text-[15px] text-muted-foreground">
        <p>
          Ads are shown in the home feeds, one after every eight posts, to adults who do not pay for Plus. A campaign is charged per
          thousand impressions from its balance, and it stops at its budget. Read the{" "}
          <Link href="/transparency/ads" className="underline underline-offset-4 hover:text-foreground">
            advertising policy
          </Link>{" "}
          before you start.
        </p>
      </section>
    </div>
  )
}

function AccountForm() {
  const [state, action] = useActionState<FormState, FormData>(createAdAccount, {})
  return (
    <section className="flex flex-col gap-4 border-b border-border px-4 py-4" aria-labelledby="set-up-heading">
      <h2 id="set-up-heading" className="text-lg font-semibold">
        Set up advertising
      </h2>
      <form action={action} className="flex flex-col gap-4">
        <Field label="Business name" hint="As customers know it. Shown on every ad.">
          <input name="business_name" required maxLength={80} className={FIELD_INPUT} />
        </Field>
        <Field label="Country" hint="Two letters, such as AU or US. Where the business is run from.">
          <input name="country" required maxLength={2} autoCapitalize="characters" className={FIELD_INPUT} />
        </Field>
        <Field label="Contact email" hint="Used about your campaigns and your account only.">
          <input name="contact_email" type="email" required maxLength={254} className={FIELD_INPUT} />
        </Field>
        <label className="flex items-start gap-3 text-[15px]">
          <input name="accept_policy" type="checkbox" required className="mt-1 size-4 accent-foreground" />
          <span>
            I have read the{" "}
            <Link href="/transparency/ads" className="underline underline-offset-4">
              advertising policy
            </Link>{" "}
            and I accept it for every campaign on this account.
          </span>
        </label>
        <ErrorLine message={state.error} />
        <div className="flex justify-end">
          <Submit label="Set up advertising" pendingLabel="Setting up" />
        </div>
      </form>
    </section>
  )
}

function Balance({ data }: { data: AdvertiseData }) {
  const account = data.account
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState<number>(ADD_CREDIT_OPTIONS[1])
  if (!account) return null
  const add = () =>
    startTransition(async () => {
      const result = await startAdCredit(amount)
      if (result.ok) window.location.assign(result.url)
      else toast.error(result.error)
    })
  return (
    <section className="flex flex-col gap-4 border-b border-border px-4 py-4" aria-labelledby="balance-heading">
      <div className="flex flex-col gap-1">
        <h2 id="balance-heading" className="text-lg font-semibold">
          {account.businessName}
        </h2>
        <p className="text-[15px] text-muted-foreground">
          Balance {formatMoney(account.balance, data.currency)}. Campaigns draw from it.
        </p>
      </div>
      {data.creditAdded ? <p role="status" className="text-[15px]">Credit added. It appears here once Stripe confirms the payment.</p> : null}
      {data.paymentsReady ? (
        <div className="flex flex-wrap items-center gap-2">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">Amount to add</legend>
            {ADD_CREDIT_OPTIONS.map((option) => (
              <label key={option} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-[15px] has-[:checked]:bg-foreground has-[:checked]:text-background">
                <input type="radio" name="credit" value={option} checked={amount === option} onChange={() => setAmount(option)} className="sr-only" />
                {formatMoney(option, data.currency)}
              </label>
            ))}
          </fieldset>
          <Button type="button" disabled={pending} onClick={add} className="h-10 rounded-full px-5 font-semibold">
            {pending ? "Opening payment" : `Add ${formatMoney(amount, data.currency)}`}
          </Button>
        </div>
      ) : (
        <p className="text-[15px] text-muted-foreground">Adding credit needs payments, which are not set up on this server yet.</p>
      )}
    </section>
  )
}

function CampaignForm() {
  const [state, action] = useActionState<FormState, FormData>(createCampaign, {})
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label="Headline" hint={`Up to ${AD_HEADLINE_MAX} characters.`}>
        <input name="headline" required maxLength={AD_HEADLINE_MAX * 2} className={FIELD_INPUT} />
      </Field>
      <Field label="Text" hint={`Up to ${AD_BODY_MAX} characters.`}>
        <textarea name="body" required maxLength={AD_BODY_MAX * 4} rows={3} className="rounded-xl border border-input bg-background px-3 py-2 text-[15px] outline-none focus-visible:border-foreground/50" />
      </Field>
      <Field label="Button text" hint={`Up to ${AD_CTA_MAX} characters, such as Learn more.`}>
        <input name="cta" required maxLength={AD_CTA_MAX * 2} className={FIELD_INPUT} />
      </Field>
      <Field label="Web address" hint={`Starts with https://. Up to ${AD_LINK_MAX} characters.`}>
        <input name="link" type="url" required maxLength={AD_LINK_MAX} className={FIELD_INPUT} />
      </Field>
      <Field label="Topic (optional)" hint={`One word. People who follow it see this ad. Up to ${AD_TOPIC_MAX} characters.`}>
        <input name="topic" maxLength={AD_TOPIC_MAX} placeholder="cooking" className={FIELD_INPUT} />
      </Field>
      <Field label="Budget" hint="The most this campaign may spend, in the account's currency. Charged per thousand impressions.">
        <input name="budget" inputMode="decimal" required placeholder="25.00" className={FIELD_INPUT} />
      </Field>
      <ErrorLine message={state.error} />
      {state.done ? <p role="status" className="text-[15px]">Sent for review. It runs once a person approves it.</p> : null}
      <div className="flex justify-end">
        <Submit label="Send for review" pendingLabel="Sending" />
      </div>
    </form>
  )
}

function Campaigns({ data }: { data: AdvertiseData }) {
  return (
    <>
      <section className="flex flex-col gap-4 border-b border-border px-4 py-4" aria-labelledby="new-campaign-heading">
        <h2 id="new-campaign-heading" className="text-lg font-semibold">
          New campaign
        </h2>
        <CampaignForm />
      </section>
      <section className="flex flex-col gap-2 px-4 py-4" aria-labelledby="campaigns-heading">
        <h2 id="campaigns-heading" className="text-lg font-semibold">
          Campaigns
        </h2>
        {data.campaigns.length === 0 ? <p className="text-[15px] text-muted-foreground">No campaigns yet.</p> : null}
        <ul className="flex flex-col divide-y divide-border">
          {data.campaigns.map((campaign) => (
            <CampaignItem key={campaign.id} campaign={campaign} currency={data.currency} />
          ))}
        </ul>
      </section>
    </>
  )
}

function CampaignItem({ campaign, currency }: { campaign: CampaignRow; currency: string }) {
  const [pending, startTransition] = useTransition()
  const toggle = (paused: boolean) =>
    startTransition(async () => {
      const result = await setCampaignPaused(campaign.id, paused)
      if (!result.ok) toast.error(result.error)
    })
  return (
    <li className="flex flex-col gap-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[16px] font-semibold">{campaign.headline}</h3>
        <span className="text-[14px] text-muted-foreground">{STATUS[campaign.status]}</span>
      </div>
      {campaign.status === "rejected" && campaign.review_note ? <p className="text-[15px]">Reason: {campaign.review_note}</p> : null}
      <p className="text-[14px] text-muted-foreground">
        {formatMoney(campaign.spent, currency)} of {formatMoney(campaign.budget, currency)} spent. {campaign.impressions.toLocaleString("en-US")}{" "}
        {campaign.impressions === 1 ? "impression" : "impressions"}, {campaign.clicks.toLocaleString("en-US")} {campaign.clicks === 1 ? "click" : "clicks"}.
      </p>
      {campaign.status === "active" || campaign.status === "paused" ? (
        <div>
          <Button type="button" variant="outline" disabled={pending} onClick={() => toggle(campaign.status === "active")} className="h-9 rounded-full px-4 font-semibold">
            {campaign.status === "active" ? "Pause" : "Resume"}
          </Button>
        </div>
      ) : null}
    </li>
  )
}
