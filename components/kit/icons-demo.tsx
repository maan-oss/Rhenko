"use client"

import {
  BellIcon,
  BookmarkIcon,
  HeartIcon,
  MessageCircleIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  WifiIcon,
} from "lucide-animated"
import UseAnimations from "react-useanimations"
import alertCircle from "react-useanimations/lib/alertCircle"
import checkmark from "react-useanimations/lib/checkmark"
import heart from "react-useanimations/lib/heart"
import loading from "react-useanimations/lib/loading"
import mail from "react-useanimations/lib/mail"
import userPlus from "react-useanimations/lib/userPlus"

export function IconsDemo() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">lucide-animated (hover to play)</p>
        <div className="flex flex-wrap items-center gap-5">
          <HeartIcon size={24} />
          <BellIcon size={24} />
          <SearchIcon size={24} />
          <MessageCircleIcon size={24} />
          <SettingsIcon size={24} />
          <WifiIcon size={24} />
          <BookmarkIcon size={24} />
          <SendIcon size={24} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">react-useanimations</p>
        <div className="flex flex-wrap items-center gap-5">
          <UseAnimations animation={heart} size={32} />
          <UseAnimations animation={checkmark} size={32} />
          <UseAnimations animation={alertCircle} size={32} />
          <UseAnimations animation={loading} size={32} />
          <UseAnimations animation={mail} size={32} />
          <UseAnimations animation={userPlus} size={32} />
        </div>
      </div>
    </div>
  )
}
