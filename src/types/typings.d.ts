import { Icon } from "@/components/Icons"

interface SidebarOption {
  id: number
  name: string
  href: string
  Icon: Icon
}

interface GroupChat {
  id: string
  name: string
  creatorId: string
  members: string[]
  createdAt: number
}

interface UserRanking {
  userId: string
  position: number
}
