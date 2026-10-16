// What each number on the analytics pages counts. The pages show these words beside the numbers, so the explanation and the
// count always agree. Change a rule here and every page that shows it changes with it.
export const DEFINITIONS = {
  views: "Times people saw the post, with each person counted once. Your own views are never counted.",
  visits: "Times people opened your profile. Each person counts once every six hours. Your own visits are never counted.",
  follows: "People who followed you on each day shown.",
  likes: "People who liked the post, all time.",
  reposts: "Times the post was reposted, all time.",
  quotes: "Posts that quote this one, all time.",
  replies: "Replies to the post, all time.",
  bookmarks: "People who saved the post, all time.",
  clicks: "Times someone opened a link, a profile, the post, a photo or a hashtag from it, all time.",
  engagement: "Likes, reposts, quotes, replies and bookmarks, divided by views. Blank until the post has views.",
} as const
