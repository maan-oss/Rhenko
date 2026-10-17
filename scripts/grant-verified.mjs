// Grants or removes the verified badge on one account.
//
//   node scripts/grant-verified.mjs <handle>            grant the badge
//   node scripts/grant-verified.mjs <handle> --revoke   remove the badge
//
// Reads and writes the database the app uses (DATABASE_URL). The server can keep running. Badges are not something
// people can request in the app.
import postgres from "postgres"

const args = process.argv.slice(2)
const revoke = args.includes("--revoke")
const handle = args.find((arg) => !arg.startsWith("--"))?.replace(/^@/, "")

if (!handle) {
  console.error("Usage: node scripts/grant-verified.mjs <handle> [--revoke]")
  process.exit(1)
}

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Set it to the Postgres database the app uses.")
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false })
try {
  // handle is citext, so the match ignores case.
  const [user] = await sql.unsafe("SELECT handle FROM users WHERE handle = $1", [handle])
  if (!user) {
    console.error(`No account named @${handle}.`)
    process.exitCode = 1
  } else {
    await sql.unsafe("UPDATE users SET verified = $1 WHERE handle = $2", [revoke ? 0 : 1, handle])
    console.log(`@${user.handle} is ${revoke ? "no longer verified" : "verified"}.`)
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  await sql.end()
}
