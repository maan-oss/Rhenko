import type { Metadata } from "next"
import { OperatorContact, OperatorWho } from "@/app/_legal/operator"
import { B, Code, LegalPage, List, Note, P, TextLink, type LegalSection } from "@/app/_legal/shell"
import { EMAIL_CODE_MINUTES } from "@/lib/account-rules"
import {
  EDIT_WINDOW_MS,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_VIDEO_BYTES,
  MAX_VIDEOS,
  PROFILE_VISIT_WINDOW_MS,
  RECENT_SEARCH_LIMIT,
} from "@/lib/rules"

export const metadata: Metadata = {
  title: { absolute: "Privacy Policy · Rhenko" },
  description: "What Rhenko stores about you, who can see it, and how you can remove it.",
}

// This policy describes what the software does. It is not legal advice: whoever runs a server should have it reviewed for
// the place where they run it. Change UPDATED whenever the text changes.
const UPDATED = "11 October 2026"

const EDIT_MINUTES = EDIT_WINDOW_MS / 60_000
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
      <li>There is no advertising, and nothing is sent to analytics or tracking services.</li>
      <li>The operator can reach everything stored on this server, including messages, which are not end-to-end encrypted.</li>
      <li>Your email address, if you add one, is used only to send you codes.</li>
      <li>You can download or delete your data yourself, in Settings, under Account.</li>
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
        <P>The operator controls this server, where it is hosted and how it is backed up.</P>
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
            <B>Date of birth.</B> Asked at sign-up, because you must be at least 13. Only you can see it.
          </li>
          <li>
            <B>Email address.</B> Optional. See Email below.
          </li>
          <li>
            <B>Posts and activity.</B> Your posts and replies, including drafts and scheduled posts, your polls and votes, likes,
            reposts, bookmarks and their folders, highlights, lists, followed topics, and the community notes you write or rate.
            A post can be edited for {EDIT_MINUTES} minutes after it goes out, and each earlier version is kept.
          </li>
          <li>
            <B>People.</B> Who you follow, follow requests, the accounts you block or mute, the accounts whose new posts you are
            notified about, and your muted words.
          </li>
          <li>
            <B>Settings.</B> Whether your posts are protected, and which notifications you want.
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
            <B>Sign-in sessions.</B> For each signed-in device: a hash of its sign-in token, the name its browser reports (up to
            200 characters), when the session started and when it was last used. A session lasts {SESSION_DAYS} days. You can see
            and end your sessions in Settings, under Security.
          </li>
          <li>
            <B>Searches.</B> Your last {RECENT_SEARCH_LIMIT} searches. You can remove them one by one or all at once.
          </li>
          <li>
            <B>Views.</B> Rhenko records which account viewed a post, once, and which accounts visited a profile, once every{" "}
            {VISIT_HOURS} hours. Only the counts are shown, and nobody is shown who viewed. Your own views of your own posts and
            profile are not counted.
          </li>
          <li>
            <B>Network address.</B> Sign-up, sign-in and password-reset attempts are counted in the server&apos;s memory, by network
            address and by the handle or email address typed, to slow down guessing. Those counts last an hour at most, are never
            written to the database, and are lost when the server restarts. Rhenko writes no request log, although a proxy or host
            in front of it may.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "messages",
    title: "Messages",
    body: (
      <>
        <P>
          Messages are stored as you send them, with the reactions to them. They are not end-to-end encrypted, so the operator
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
        <P>Calls carry voice only. The audio travels between the browsers on the call and is not recorded or stored.</P>
        <List>
          <li>
            The server passes along the messages that set a call up and keeps the state of live calls in memory. When a call ends,
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
        <P>Uploads are saved on the server under random file names.</P>
        <List>
          <li>
            Photos can be JPEG, PNG, WebP or GIF, up to {IMAGE_MB} MB. Videos can be MP4, WebM or MOV, up to {VIDEO_MB} MB. A post
            has up to {MAX_IMAGES} photos or {MAX_VIDEOS} video.
          </li>
          <li>
            Rhenko does not remove the information a camera adds to a photo, which can include where it was taken. Remove it
            before you upload if you do not want to share it.
          </li>
          <li>
            Anyone who has the address of a profile photo or banner can open it. A photo or video in a post can be opened only by
            signed-in people who may see that post. A photo in a message can be opened only by the people in that conversation.
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
      </List>
    ),
  },
  {
    id: "email",
    title: "Email",
    body: (
      <List>
        <li>Adding an email address is optional. You confirm it with a six-digit code, in Settings, under Account.</li>
        <li>
          Rhenko uses it for two things only: verification codes, and password-reset codes. A reset code goes only to an address
          that has been confirmed. It sends no newsletters.
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
        </List>
        <P>
          Your choice of light or dark theme is kept in your browser&apos;s local storage, under <Code>theme</Code>, not in a
          cookie. In production, a service worker keeps the offline page and the app&apos;s own scripts, styles and fonts on your
          device. It does not store posts, messages or uploads.
        </P>
        <P>In production, the sign-in cookies are marked Secure, so browsers send them only over HTTPS.</P>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who else receives data",
    body: (
      <List>
        <li>
          Advertisers, data brokers and analytics services receive nothing from Rhenko. The app&apos;s fonts, scripts and images
          load from this server, not from other sites.
        </li>
        <li>The operator&apos;s mail service receives the address and the text of each verification or reset email.</li>
        <li>STUN servers, and any TURN server the operator sets up, see network addresses when you make or take a call.</li>
        <li>The host of this server, and anyone with access to its disks or backups, can reach everything stored on it.</li>
        <li>The operator may disclose data where the law requires it.</li>
      </List>
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
          Sign-in sessions last {SESSION_DAYS} days or until you end them. Emailed codes last {EMAIL_CODE_MINUTES} minutes. The
          step between your password and your two-factor code lasts {CHALLENGE_MINUTES} minutes.
        </li>
        <li>The counts that include network addresses last an hour at most, and only in the server&apos;s memory.</li>
        <li>A deactivated account keeps its hidden data until you log in again or delete the account.</li>
        <li>If the operator makes backups, a backup still holds what you deleted until that backup is replaced.</li>
      </List>
    ),
  },
  {
    id: "choices",
    title: "Your choices",
    body: (
      <>
        <List>
          <li>
            <B>Edit your profile</B> from your profile page.
          </li>
          <li>
            <B>Download your data</B> in Settings, under Account, in Your data. It is a ZIP file with your profile, posts, likes,
            bookmarks, lists, messages and your photos and videos.
          </li>
          <li>
            <B>Deactivate or delete your account</B> in Settings, under Account.
          </li>
          <li>
            <B>Add or remove your email address</B> in Settings, under Account.
          </li>
          <li>
            <B>See and end your sessions</B> in Settings, under Security.
          </li>
          <li>
            <B>Protect your posts, block accounts, and mute accounts or words</B> in Settings, under Privacy and safety.
          </li>
          <li>
            <B>Choose your notifications</B> in Settings, under Notifications.
          </li>
          <li>
            <B>Clear your recent searches</B> from the list on the search page.
          </li>
        </List>
        <P>For anything the settings do not cover, ask the operator. See Contact below.</P>
      </>
    ),
  },
  {
    id: "security",
    title: "Security",
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
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <P>
        Rhenko is not for anyone under 13, and sign-up refuses them. If you find that a child under 13 has an account, tell the
        operator.
      </P>
    ),
  },
  {
    id: "changes",
    title: "Changes",
    body: (
      <P>
        When this policy changes, the date at the top of this page changes. The <TextLink href="/terms">Terms of Service</TextLink>{" "}
        say how changes apply to you.
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
      updated={UPDATED}
      intro="This page describes what Rhenko stores about you, who can see it, who else receives it, and how you can remove it. It describes what the software does. The operator of this server controls the server itself."
      summary={SUMMARY}
      sections={SECTIONS}
      other={{ href: "/terms", label: "Read the Terms of Service" }}
    />
  )
}
