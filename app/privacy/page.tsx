import type { Metadata } from "next"
import { OperatorContact, OperatorLines, OperatorWho } from "@/app/_legal/operator"
import { B, Code, LegalPage, List, Note, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { EMAIL_CODE_MINUTES } from "@/lib/account-rules"
import {
  APPEAL_DAYS,
  LEGAL_UPDATED,
  MINIMUM_AGE,
  RETENTION,
} from "@/lib/legal"
import {
  EDIT_WINDOW_MS,
  REPLY_EDIT_WINDOW_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_VIDEO_BYTES,
  MAX_VIDEOS,
  PROFILE_VISIT_WINDOW_MS,
  RECENT_SEARCH_LIMIT,
} from "@/lib/rules"

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy · Rhenko" },
  description: "What Rhenko stores about you, why, who can see it, and the rights you have over it.",
}

// This policy describes what the software does. It is not legal advice. Whoever runs a server needs it reviewed for each
// place it serves people, and the operator fills in the details shown in the Operator section. LEGAL_UPDATED and
// TERMS_VERSION in lib/legal.ts change together whenever this text changes.

const EDIT_MINUTES = EDIT_WINDOW_MS / 60_000
const REPLY_EDIT_MINUTES = REPLY_EDIT_WINDOW_MS / 60_000
const VISIT_HOURS = PROFILE_VISIT_WINDOW_MS / 3_600_000
const IMAGE_MB = MAX_IMAGE_BYTES / (1024 * 1024)
const VIDEO_MB = MAX_VIDEO_BYTES / (1024 * 1024)

// These follow lib/auth.ts (SESSION_MS, CHALLENGE_MS) and components/app/sidebar-panel.tsx (the sidebar cookie). That
// module opens the database when it loads, which this page must not do while the app is built, so the numbers are
// written here. Change them together.
const SESSION_DAYS = 30
const CHALLENGE_MINUTES = 5

const SUMMARY = (
  <Note title="The short version">
    <List>
      <li>
        Some home feeds show ads, to adults who do not pay for Rhenko Plus. A topic ad goes only to people who follow that topic. Advertisers
        see only totals. Nothing is sent to analytics or tracking services.
      </li>
      <li>Rhenko does not sell your data, and does not share personal information with advertisers.</li>
      <li>Payments are taken by Stripe. Rhenko never sees your card number or bank details.</li>
      <li>The operator can reach everything stored on this server, including messages, which are not end-to-end encrypted.</li>
      <li>
        Your email address, if you add one, is used only to send you codes, and the daily digest if you turn it on. Date of birth is used
        only to check you are {MINIMUM_AGE} or older.
      </li>
      <li>You can download, correct or delete your data yourself, in Settings, under Account.</li>
    </List>
  </Note>
)

const SECTIONS: LegalSection[] = [
  {
    id: "operator",
    title: "Operator",
    body: (
      <>
        <OperatorWho />
        <P>
          The operator decides why and how this server holds your data, so it is the controller of that data under the GDPR and
          the UK GDPR, and the equivalent party under the other laws listed in this policy.
        </P>
        <OperatorLines
          items={[
            { which: "address", label: "Postal address", max: 300 },
            { which: "privacyEmail", label: "Privacy contact", email: true },
            { which: "grievanceOfficer", label: "Grievance officer (India)" },
            { which: "grievanceEmail", label: "Grievance email (India)", email: true },
            { which: "euRepresentative", label: "EU representative" },
            { which: "ukRepresentative", label: "UK representative" },
            { which: "hosting", label: "Where the server is hosted" },
          ]}
        />
      </>
    ),
  },
  {
    id: "stored",
    title: "What is stored",
    body: (
      <>
        <P>Rhenko keeps what you give it and what you do in it.</P>
        <List>
          <li>
            <B>Account.</B> Your handle, your display name and a salted hash of your password. The password itself is not stored.
            You can add a bio, location, website, status, profile photo and banner.
          </li>
          <li>
            <B>Date of birth.</B> Asked at sign-up, because you must be at least {MINIMUM_AGE}. Only you can see it. It also decides whether you may see ads.
          </li>
          <li>
            <B>Agreement.</B> The version of the Terms and Privacy Policy you agreed to, and when you agreed.
          </li>
          <li>
            <B>Email address.</B> Optional. See Email below.
          </li>
          <li>
            <B>Passkeys.</B> If you add one for sign-in: its public key, the name you gave it, and when it was added and last used.
          </li>
          <li>
            <B>Posts and activity.</B> Your posts and replies, including drafts and scheduled posts, your polls and votes, likes,
            reposts, bookmarks and their folders, highlights, lists, followed topics, and the notes from readers you write or rate.
            A post can be edited for {EDIT_MINUTES} minutes after it goes out, a reply for {REPLY_EDIT_MINUTES} minutes, and each earlier version is kept.
          </li>
          <li>
            <B>People.</B> Who you follow, follow requests, the accounts you block or mute, the accounts whose new posts you are
            notified about, and your muted words.
          </li>
          <li>
            <B>Circles.</B> The circles you join, your requests to join one, and the answers you gave to its questions.
          </li>
          <li>
            <B>Where you are.</B> Optional. Your country, a city or town, and a state or region if you give one. Rhenko never stores a street address, postcode, house
            number or your device&apos;s location. It is used only to suggest people near you, and nobody else is shown it.
          </li>
          <li>
            <B>Profile location.</B> The Location on your profile is free text that you write. It is shown on your profile to anyone who can see it, and it is separate from where you are.
          </li>
          <li>
            <B>Languages.</B> The languages you speak, how well you speak each one, and the ones you are learning. They are used to
            suggest people to practise with.
          </li>
          <li>
            <B>Connection choices.</B> Whether you are suggested to people nearby and to language partners, whether you finished
            setup, and the people you chose Not now on. Those last are kept for {RETENTION.dismissedConnectionsDays} days.
          </li>
          <li>
            <B>Language of posts and messages.</B> A guess at the language of each post and message, made from its text when it is
            saved. It can be wrong. It is used to offer a translation to the people who read it.
          </li>
          <li>
            <B>Translations.</B> When someone asks for a translation, the translated text is kept with the post or message, so the
            same text is not sent twice. A post&apos;s translations are removed when it is edited, and a message&apos;s when it is
            deleted.
          </li>
          <li>
            <B>Settings.</B> Whether your posts are protected, whether the counts on your posts are hidden, and which notifications you
            want.
          </li>
          <li>
            <B>Payments.</B> For the paid features: whether you have Rhenko Plus or the paid subscriber ring, when it renews or ends, the
            identifiers Stripe gives the customer and the subscription, the tips you sent and received (the amount, Rhenko&apos;s share, the
            post and the payment identifier), and whether your payouts are set up. Stripe keeps card and bank details. Rhenko does not.
          </li>
          <li>
            <B>Advertising.</B> If you run ads: the business name, country, contact email, the time you accepted the advertising policy,
            and your campaigns and their results. If you report an ad, the report and the reason you gave. The operator can see who sent
            each report. The advertiser cannot.
          </li>
          <li>
            <B>Ad impressions.</B> When an ad is shown to you, the campaign is recorded with a one-way code made from your account and the
            day. The code stops a second view that day from being charged. It does not contain your account identifier, and advertisers
            never see it.
          </li>
          <li>
            <B>Post clicks.</B> Clicks on your posts are counted by kind (link, profile, detail, photo or hashtag), with a time and no account. The counts are kept until the post is deleted.
          </li>
          <li>
            <B>Notifications.</B> A record of what other people did that involves you, such as likes, replies and follows, so
            that you can read it in Notifications.
          </li>
          <li>
            <B>Reports.</B> The reports you send: the post, the reason you chose and the time. The operator can see who sent each
            one.
          </li>
          <li>
            <B>Notices about content, and appeals.</B> When a notice is sent through the notice form, we keep what it says and how
            to reach the sender (see Reports and notices below). If your post is hidden, we keep the notice we sent you, and any
            appeal you make.
          </li>
          <li>
            <B>Sign-in sessions.</B> For each signed-in device: a hash of its sign-in token, the name its browser reports (up to
            200 characters), when the session started and when it was last used. A session lasts {SESSION_DAYS} days. You can see
            and end your sessions in Settings, under Security.
          </li>
          <li>
            <B>Searches.</B> Your last {RECENT_SEARCH_LIMIT} searches, and any you save. You can remove them one by one or all at
            once.
          </li>
          <li>
            <B>Views.</B> Rhenko records which account viewed a post, once, and which accounts visited a profile, once every{" "}
            {VISIT_HOURS} hours. Only the counts are shown, and nobody is shown who viewed. Your own views of your own posts and
            profile are not counted.
          </li>
          <li>
            <B>Your For you feed.</B> Rhenko records which posts were put in your For you feed, how long each one was on your screen
            (added up), and the posts you marked Not interested. These are used to rank your For you feed and to train the ranking
            described under How posts are ordered. Nobody else is shown them.
          </li>
          <li>
            <B>Attempt counts.</B> Sign-up, sign-in, password-reset, notice and human-check attempts are counted, to slow down guessing.
            Each count is kept in a table in the database, with the network address the attempt came from and the handle or email address
            typed, in plain text. Rhenko uses the address a proxy reports only where the server is set to trust its proxy; otherwise every
            attempt is counted against one shared address. A count is removed when its time window ends, at most an hour after it starts.
            Sign-in also keeps a keyed hash of the network address for {SESSION_DAYS} days, to spot many accounts made from one place.
            Rhenko writes no request log, although a proxy or host in front of it may.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "basis",
    title: "Why we use it",
    body: (
      <>
        <P>Each use needs a reason in law. These are the reasons Rhenko relies on.</P>
        <List>
          <li>
            <B>To run your account and the service you ask for</B>, including posts, messages, calls, notifications, subscriptions and
            tips. This is the contract between you and the operator.
          </li>
          <li>
            <B>To show ads</B>, using only whether you are an adult (from your date of birth), whether you pay for Plus and the topics you follow, as described under Advertising
            in the Terms. This is the operator&apos;s legitimate interest in paying for the service, weighed against your rights. You can
            remove ads by subscribing to Plus.
          </li>
          <li>
            <B>To keep the service safe and fair</B>: sign-in protection, checks for bots and fake accounts, moderation, reports and the
            record of decisions. This is
            the operator&apos;s legitimate interest, weighed against your rights, and it is why you can appeal.
          </li>
          <li>
            <B>To meet legal duties</B>: checking age, acting on notices and orders, keeping records the law requires, and telling
            the regulator of a breach.
          </li>
          <li>
            <B>With your consent</B>, only where you choose a feature that asks for it. You can withdraw that consent at any time.
          </li>
        </List>
        <P>
          Rhenko does not use your posts, messages, likes, contacts or location to choose ads. Your For you feed is personalised from what you do on Rhenko, as described under How posts are ordered. Posts and messages are not used
          to train AI models. The ranking weights are learned from what all accounts do, and no weight holds a record of any one person.
        </P>
      </>
    ),
  },
  {
    id: "messages",
    title: "Messages",
    body: (
      <>
        <P>
          Messages are stored as you send them, with the reactions to them, and voice messages are stored like photos. They are not end-to-end encrypted, so the operator
          can technically read them. They are kept until they are deleted.
        </P>
        <List>
          <li>Deleting a message you sent erases its text and photo for everyone in the conversation.</li>
          <li>
            Leaving a conversation removes you from it. When the last person leaves, the conversation and its photos are deleted.
          </li>
          <li>Deleting your account deletes the messages you sent.</li>
          <li>
            The people in a conversation can see when you have seen a message and when you are typing. Typing is not stored.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "calls",
    title: "Calls",
    body: (
      <>
        <P>Calls carry voice, and video when your camera is on. The audio and video travel between the browsers on the call and are not recorded or stored.</P>
        <List>
          <li>
            The server passes along the messages that set a call up and keeps the state of live calls in the database until they end, and the messages that set a call up stay there for about a minute. When a call ends,
            one line is saved in the conversation: that a call happened, how it ended, how long it lasted and how many people took
            part.
          </li>
          <li>
            Browsers find a route to each other with a STUN server. By default that is Google&apos;s public one, which sees your
            network address, as do the other people on the call. The operator can use their own STUN or TURN servers instead.
          </li>
          <li>A TURN server, if the operator sets one up, can carry the audio when browsers cannot connect directly. It stays encrypted.</li>
        </List>
      </>
    ),
  },
  {
    id: "uploads",
    title: "Photos and videos",
    body: (
      <>
        <P>Uploads are saved under random file names, with the storage provider the operator has set up: Cloudflare R2 or Supabase Storage.</P>
        <List>
          <li>
            Photos can be JPEG, PNG, WebP or GIF, up to {IMAGE_MB} MB. Videos can be MP4, WebM or MOV, up to {VIDEO_MB} MB. A post
            has up to {MAX_IMAGES} photos or {MAX_VIDEOS} video.
          </li>
          <li>
            Before a photo is stored, Rhenko removes the details a camera or editing app adds to it: location, camera make and model,
            time, and any embedded text or comments. The picture itself is stored unchanged.
          </li>
          <li>
            Rhenko does not change videos. Any location or device details in a video stay in the file, so remove them before you upload
            a video if you do not want to share them.
          </li>
          <li>
            Opening a photo or video sends your browser to a link at the storage provider. Rhenko makes the link only after checking that
            you may see the file. It works for one hour and needs no sign-in, so anyone who has it can open the file until it expires.
          </li>
          <li>
            Anyone who has the address of a profile photo or banner can open it. A photo or video in a post can be opened only by
            signed-in people who may see that post. A photo in a message can be opened only by the people in that conversation.
            While a post is hidden, its files are not served to anyone through the app.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "visibility",
    title: "Who can see what",
    body: (
      <List>
        <li>
          You need to be signed in to see posts and profiles, and anyone can create an account. What you post is therefore
          visible to anyone who joins this server, unless you protect your posts.
        </li>
        <li>
          If you protect your posts, new followers need your approval, and only followers can see your posts and your lists of
          followers and following. Your profile stays visible.
        </li>
        <li>Accounts you block cannot follow you, see your posts or message you.</li>
        <li>
          Only you can see your date of birth, your email address, the list of posts you liked, your bookmarks, your drafts and
          scheduled posts, and your private lists.
        </li>
        <li>
          People are told when you follow them, mention them, or like, repost, reply to or quote their posts, unless they turned
          those notifications off.
        </li>
        <li>The earlier versions of an edited post can be seen by anyone who can see the post.</li>
        <li>
          Advertisers see only totals for their own campaigns: how many times each ad was shown and clicked. They never see who saw or
          clicked an ad.
        </li>
        <li>
          A post hidden under the Community Rules is not visible to anyone, its author included. The author sees the notice and
          can appeal it.
        </li>
      </List>
    ),
  },
  {
    id: "ordering",
    title: "How posts are ordered",
    body: (
      <>
        <P>
          The For you feed is ranked to show you posts you are likely to like, repost, bookmark or read. It uses these signals, and
          it does not use your age, your location, or the posts you write:
        </P>
        <List>
          <li>Whether you follow the author, and whether you have liked, reposted or bookmarked that author&apos;s posts lately.</li>
          <li>What the people you follow have liked, and how many of them liked the post.</li>
          <li>The hashtags you follow.</li>
          <li>How recent a post is, and its likes, reposts, quotes, replies and views.</li>
          <li>
            Whether you have already been shown the post, whether you kept it on screen for three seconds or more, and whether you
            have already liked, reposted or bookmarked it.
          </li>
          <li>Whether the post has a web link, how long it is, and how many followers its author has.</li>
        </List>
        <P>
          Two rules keep the feed varied: no author fills more than two of the top places, and posts from the same kind of source
          (for example, people you follow) do not fill more than three places in a row. Your own posts from the last hour, up to three, lead the first page of For you, newest first, outside these rules. A post you mark Not interested leaves your
          For you and stays out of it.
        </P>
        <P>
          The weights for these signals are learned from what people did after they were shown posts, and they are refreshed about
          once an hour. A new set of weights is used only when it predicts that later behaviour better than the default weights. The
          learned weights are the same for every account and hold no record of any one person.
        </P>
        <P>
          Suggested people on Connect, and in the setup steps, are a separate list and are not part of any feed. They use the city
          or town you gave, the languages you speak and are learning, the people and topics you follow, how many followers someone
          has, and whether they posted in the last two weeks. Only you see them. The transparency page sets out the rules in full.
        </P>
        <List>
          <li>
            <B>For you</B> shows the posts you are allowed to see, ranked as described above.
          </li>
          <li>
            <B>Following</B> shows posts from the accounts and topics you follow, newest first.
          </li>
          <li>
            <B>Explore</B> can be sorted by top, which adds up likes, reposts (counted twice) and replies, or by latest. Top uses
            those counts and nothing else about you.
          </li>
        </List>
        <P>
          Ads are shown in the For you and Following feeds, after about every eight posts (sometimes nine), and each one is labelled Ad. Rhenko Plus removes
          them. Ads are not ranked by what they predict you will do.
        </P>
        <P>
          The main settings that shape what you see are your follows, blocks, mutes, muted words, and whether a post is hidden or
          protected. You can change each one in Settings, under Privacy and safety.
        </P>
        <P>
          Each post is also scored automatically when it goes live and when it is edited, for signs of spam and scams. A post that scores
          50 or more stays out of other people&apos;s For you feeds and sends no notifications. A post that scores 75 or more is hidden, and
          its author is sent a notice they can appeal. An account that looks automated may be asked to confirm it is a person, and may have
          following, messaging and posting paused for a while.
        </P>
      </>
    ),
  },
  {
    id: "notices",
    title: "Reports and notices about content",
    body: (
      <>
        <List>
          <li>
            A <B>report</B> is kept with the post it is about, the reason and the reporter. Reports are read by people
            who run the server.
          </li>
          <li>
            A <B>notice</B> sent through the notice form is kept with the name, email address, optional postal address and link
            the sender gave, what the notice is about, the description and the sender&apos;s signature. The sender is sent a reference when the notice arrives, and the operator emails the decision to the sender. The author of the content
            is not told who sent a notice. The author is told the kind of notice and the reason for the decision.
          </li>
          <li>
            <B>Decisions</B> and the reasons for them are kept with the notice. So are the appeals and their decisions.
          </li>
        </List>
        <P>
          We keep notices and decisions for {RETENTION.legalNoticesDays / 365} years, because they may be needed to show that a
          decision was lawful, and then delete them. A notice about content keeps the decision and reason even after the content
          itself is deleted, but not the content.
        </P>
      </>
    ),
  },
  {
    id: "email",
    title: "Email",
    body: (
      <List>
        <li>Adding an email address is optional. You confirm it with a six-digit code, in Settings, under Account.</li>
        <li>
          Rhenko uses it for three things only: verification codes, password-reset codes, and the daily digest if you turn it on. A
          reset code goes only to an address that has been confirmed. It sends no newsletters or marketing.
        </li>
        <li>
          The daily digest is off until you turn it on in Settings, under Notifications, and it goes only to a confirmed address. It is
          one email a day, with how many likes, replies, messages and the like you missed, and who and what the five newest were. It
          holds no words from posts, and none from messages unless you turned on message previews. Rhenko keeps the UTC hour you chose
          and when the last digest went out. Every digest has a link that turns it off without signing in, and removing your address
          turns it off.
        </li>
        <li>Codes work for {EMAIL_CODE_MINUTES} minutes. They are stored as hashes, not as the codes themselves.</li>
        <li>Your address is not shown to anyone else.</li>
        <li>
          Email goes out through the operator&apos;s mail service. If the operator has not set one up, the email features say so.
        </li>
        <li>You can remove your address in Settings, under Account.</li>
      </List>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <>
        <P>Rhenko sets only the cookies it needs to work. There are no advertising, analytics or third-party cookies.</P>
        <List>
          <li>
            <Code>rhenko_session</Code> keeps you signed in, for up to {SESSION_DAYS} days. Scripts on the page cannot read it.
          </li>
          <li>
            <Code>rhenko_accounts</Code> remembers the other accounts you have signed in to on this browser, up to 5, so you can
            switch between them. Scripts on the page cannot read it either. It lasts up to {SESSION_DAYS} days, and an account is
            taken out of it when you log out of that account.
          </li>
          <li>
            <Code>rhenko_challenge</Code> is set for {CHALLENGE_MINUTES} minutes between entering your password and entering your
            two-factor code.
          </li>
          <li>
            <Code>rhenko-sidebar</Code> remembers whether the sidebar is collapsed, for a year.
          </li>
          <li>
            <Code>rhenko-feed</Code> remembers whether Home opens on For you or Following, for a year.
          </li>
          <li>
            <Code>rhenko_webauthn</Code> holds a passkey sign-in in progress, for {CHALLENGE_MINUTES} minutes.
          </li>
        </List>
        <P>
          Your choice of light or dark theme is kept in your browser&apos;s local storage, under <Code>theme</Code>, not in a
          cookie. In production, a service worker keeps the offline page and the app&apos;s own scripts, styles and fonts on your
          device. It does not store posts, messages or uploads.
        </P>
        <P>In production, the sign-in cookies are marked Secure, so browsers send them only over HTTPS.</P>
        <P>
          When you pay, Stripe&apos;s checkout and billing pages set their own cookies on Stripe&apos;s site, under Stripe&apos;s policy. Rhenko
          does not set or read them.
        </P>
        <P>
          Because Rhenko sets no cookies for advertising or analytics, there is nothing for a cookie banner to switch off. The
          cookies above are needed for the service you ask for.
        </P>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who else receives data",
    body: (
      <>
        <P>
          Rhenko does not sell personal information and does not share it for cross-context behavioural advertising. Advertisers
          receive only totals for their own campaigns. Data brokers and analytics services receive nothing from Rhenko. The
          app&apos;s fonts, scripts and images load from this server, not from other sites.
        </P>
        <List>
          <li>
            Stripe receives what it needs to take a payment, to manage a subscription, to refund a payment and to pay out tips. It keeps
            that under its own privacy policy. Rhenko does not receive card numbers or bank details.
          </li>
          <li>The operator&apos;s mail service receives the address and the text of each verification, reset, notice or digest email.</li>
          <li>
            A translation service, only if the operator has turned translation on. It receives the text of the one post or message you
            ask to translate, and the two languages involved. Nothing else is sent to it. Translation is off unless the operator sets
            it up.
          </li>
          <li>
            Sarvam AI, the service Sahayak answers with, only if the operator has turned Sahayak on. When someone mentions @sahayak,
            it receives that post&apos;s question, and the posts it replies to or quotes that the person asking can see, with their authors&apos; handles. Nothing else is
            sent to it.
          </li>
          <li>
            Cloudflare, only if the operator has turned on Cloudflare Turnstile for the human check. Its script runs in your browser, so
            Cloudflare sees your network address and the page the check is on, and the server checks your answer with Cloudflare. Without
            Turnstile the check is a puzzle that runs in your browser and sends nothing to a third party.
          </li>
          <li>STUN servers, and any TURN server the operator sets up, see network addresses when you make or take a call.</li>
          <li>
            A link in a post or a chat message makes the server fetch that page once to build a preview. The page&apos;s site sees a request from this server,
            not from you. The preview picture is stored here and can be opened by anyone who has its address.
          </li>
          <li>The host of this server, and anyone with access to its disks or backups, can reach everything stored on it.</li>
          <li>
            Authorities receive data only where a law or a valid order requires it. The operator keeps a record of each such
            request, and the <TextLink href="/transparency">transparency figures</TextLink> count them.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "transfers",
    title: "Where data is kept",
    body: (
      <P>
        Your data is stored where the operator hosts the server, shown above. If that is outside the country you live in, your
        data is transferred there. The operator is responsible for putting in place any safeguard the law requires for that
        transfer, such as the standard contractual clauses for transfers out of the EU or UK.
      </P>
    ),
  },
  {
    id: "retention",
    title: "How long it is kept",
    body: (
      <List>
        <li>
          Posts, messages and the rest of your content are kept until you delete them or delete your account. Deleting a post also
          deletes the replies under it and the photos and videos in them.
        </li>
        <li>
          A hidden post is kept for {APPEAL_DAYS} days so that you can appeal. If no appeal is made, or the appeal fails, it is deleted
          with its files.
        </li>
        <li>
          Views and profile visits are kept for {RETENTION.viewsDays} days, and the counts shown to you cover that period.
        </li>
        <li>
          What was put in your For you feed and how long you had each post on screen are kept for {RETENTION.feedSignalsDays} days.
          Posts you marked Not interested stay hidden from your For you until the post is deleted or your account is closed.
        </li>
        <li>Read notifications are deleted after {RETENTION.readNotificationsDays} days. Unread ones are kept until you read them.</li>
        <li>
          Your city or town, your country, your languages and your connection choices are kept until you change them or delete your
          account.
        </li>
        <li>
          People you chose Not now on are kept for {RETENTION.dismissedConnectionsDays} days, then forgotten. You can show them again
          at any time, in Settings, under Connections and languages.
        </li>
        <li>
          Translations are kept with the post or message they translate. A post&apos;s translations are removed when it is edited, and
          a message&apos;s when it is deleted.
        </li>
        <li>
          A question for Sahayak is kept until it is answered, and its record is removed {RETENTION.sahayakDays} days after that. The
          answer is a post, kept like any other.
        </li>
        <li>
          Payment and accounting records (subscriptions, tips, advertising payments and the advertising ledger) are kept for as long as
          the accounting and tax law where the operator is based requires. The operator deletes them when that period ends. The one-way
          codes in the advertising ledger are kept with those entries. Stripe keeps its own records under its own policy.
        </li>
        <li>
          Notices about content, their decisions and the appeals are kept for {RETENTION.legalNoticesDays / 365} years, then
          deleted.
        </li>
        <li>
          Sign-in sessions last {SESSION_DAYS} days or until you end them. Emailed codes last {EMAIL_CODE_MINUTES} minutes. The
          step between your password and your two-factor code lasts {CHALLENGE_MINUTES} minutes.
        </li>
        <li>Attempt counts are removed when their time window ends, at most an hour after it starts.</li>
        <li>
          Where an account was made from, and when it passed a human check, is kept for {RETENTION.signalsDays} days as a keyed hash
          that cannot be read back to an address. The browser you used is not kept. Puzzle records for the human check are removed a
          day after they expire.
        </li>
        <li>A deactivated account keeps its data until you log in again or delete the account.</li>
        <li>If the operator makes backups, a backup still holds what you deleted until that backup is replaced.</li>
      </List>
    ),
  },
  {
    id: "choices",
    title: "Your rights and choices",
    body: (
      <>
        <P>
          Wherever you live, you can use the tools in Settings to get a copy of your data, correct it, restrict or stop some uses,
          and delete it. These are the rights the main laws give you, and what to do about each.
        </P>
        <List>
          <li>
            <B>Access and a copy.</B> <TextLink href="/settings">Settings, under Account, Your data</TextLink>, downloads a ZIP of
            your profile, posts, likes, bookmarks, lists, messages, your city or town, your languages and connection choices, and
            your photos and videos. It does not yet include notifications, saved searches, sign-in sessions, passkeys, reports you sent, notices, subscription and tip records, or For you history.
          </li>
          <li>
            <B>Correction.</B> Edit your profile from your profile page, and your handle and email address in Settings, under
            Account.
          </li>
          <li>
            <B>Deletion.</B> Delete your account in Settings, under Account. Some records are kept as the sections above describe.
          </li>
          <li>
            <B>Objection and restriction.</B> Protect your posts, block or mute accounts and words, or turn off notifications, in
            Settings, under Privacy and safety and Notifications.
          </li>
          <li>
            <B>Appeal a decision about your content</B> from <TextLink href="/notices">Notices</TextLink> within {APPEAL_DAYS} days.
          </li>
          <li>
            <B>Ask us.</B> For anything the settings do not cover, write to the privacy contact above. We reply within a month, and
            tell you if we need more time or cannot do what you ask, and why.
          </li>
        </List>
        <P>
          <B>In the EU, UK and EEA</B>, you can also object to processing based on legitimate interests, ask for a restriction, and
          complain to your national data protection authority.
        </P>
        <P>
          <B>In California</B>, you can ask what personal information we hold, ask for it to be deleted or corrected, and you will
          not be treated differently for using these rights. We do not sell or share personal information.
        </P>
        <P>
          <B>In Australia</B>, you can ask for access to and correction of your information. Complaints can go to the Office of the
          Australian Information Commissioner.
        </P>
        <P>
          <B>In India</B>, you can ask for a summary of your data, for correction and erasure, and to nominate someone to act for
          you. Complaints go first to the grievance officer named above. If that does not resolve it, you can complain to the Data
          Protection Board of India.
        </P>
      </>
    ),
  },
  {
    id: "security",
    title: "Security and breaches",
    body: (
      <>
        <List>
          <li>Passwords are stored as salted scrypt hashes. Sign-in tokens, recovery codes and emailed codes are stored as hashes too.</li>
          <li>Two-factor keys are encrypted with the server&apos;s own key.</li>
          <li>
            In production, the sign-in cookies are marked Secure and browsers are told to use HTTPS for a year.
          </li>
        </List>
        <P>
          These measures protect your data from other users. They do not hide it from whoever runs the server, who can reach
          everything stored on it.
        </P>
        <P>
          If a breach puts your personal information at real risk, the operator will tell you without undue delay, and will tell
          the regulator within the time the law sets: 72 hours under the GDPR and UK GDPR, and as soon as practicable under the
          Australian Notifiable Data Breaches scheme and India&apos;s Digital Personal Data Protection Act.
        </P>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <P>
        Rhenko is not for anyone under {MINIMUM_AGE}. Sign-up refuses them, and the operator does not knowingly collect information
        from anyone younger. If you find that someone under {MINIMUM_AGE} has an account, tell the operator, and the account will be
        closed and its data deleted.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <P>
        When this policy changes in a way that matters, the date at the top of this page changes, and you are asked to agree to
        the new version before you use Rhenko again. The <TextLink href="/terms">Terms of Service</TextLink> say how that works.
      </P>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <OperatorContact
        about="Questions about your data, and requests the settings do not cover, go to the operator."
        without="Until an address is published, the options in Settings, under Account, are the way to download or delete your data."
      />
    ),
  },
]

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={LEGAL_UPDATED}
      intro="This page describes what Rhenko stores about you, why, who can see it, who else receives it, how long it is kept, and what you can do about it. It describes what the software does. The operator of this server controls the server itself."
      summary={SUMMARY}
      sections={SECTIONS}
      other={{ href: "/terms", label: "Read the Terms of Service" }}
    />
  )
}
