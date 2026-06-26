import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"
import { Navbar } from "@/components/layout/Navbar"
import prisma from "@/lib/prisma"

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/login")
  }

  // Get user details from DB
  let dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id }
  })

  if (!dbUser && user.email) {
    dbUser = await prisma.user.create({
      data: {
        supabaseId: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || "User",
        avatarUrl: user.user_metadata?.avatar_url || null
      }
    })
  }

  const userName = dbUser?.name || user.user_metadata?.full_name || "User"
  const avatarUrl = dbUser?.avatarUrl || user.user_metadata?.avatar_url || null

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-page)] text-foreground">
      <Sidebar userName={userName} avatarUrl={avatarUrl} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Navbar userName={userName} avatarUrl={avatarUrl} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
