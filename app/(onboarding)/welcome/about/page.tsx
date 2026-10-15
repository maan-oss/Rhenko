import { redirect } from "next/navigation"

// The setup used to be one page called About you. Its place part is now Where you are, at /welcome/location.
export default function WelcomeAboutPage() {
  redirect("/welcome/location")
}
