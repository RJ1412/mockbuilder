import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { Moon, User as UserIcon } from "lucide-react"

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id }
  })

  if (!dbUser) return null

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account preferences.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserIcon className="w-5 h-5" /> Profile</CardTitle>
            <CardDescription>Your personal information.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-6">
              <div className="relative">
                {dbUser.avatarUrl ? (
                  <img src={dbUser.avatarUrl} alt={dbUser.name} className="w-20 h-20 rounded-full object-cover border-2 border-border" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-3xl font-bold">
                    {dbUser.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="space-y-1 flex-1">
                <Label>Full Name</Label>
                <Input value={dbUser.name} readOnly disabled />
                <p className="text-xs text-muted-foreground">Synced from Google.</p>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Email Address</Label>
              <Input value={dbUser.email} readOnly disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Moon className="w-5 h-5" /> Appearance</CardTitle>
            <CardDescription>Customize the interface.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="font-medium">Theme Preference</span>
              <p className="text-sm text-muted-foreground">Switch between light and dark modes.</p>
            </div>
            <div className="flex items-center gap-4 bg-muted p-2 rounded-full">
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
