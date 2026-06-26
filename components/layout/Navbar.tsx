"use client"

import { ThemeToggle } from "./ThemeToggle"
import { Button } from "@/components/ui/button"
import { Bell, LogOut, Settings } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { usePathname, useRouter } from "next/navigation"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const pathToTitle: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tests/new": "New Test",
  "/history": "My Tests",
  "/analytics": "Analytics",
  "/settings": "Settings",
}

export function Navbar({ userName, avatarUrl }: { userName: string, avatarUrl: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const title = pathToTitle[pathname] || "MockIQ"

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-6">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <Button variant="ghost" size="icon" className="text-muted-foreground">
          <Bell className="h-5 w-5" />
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              {avatarUrl ? (
                <img src={avatarUrl} alt={userName} className="rounded-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-primary text-white">
                  {userName.charAt(0)}
                </div>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
