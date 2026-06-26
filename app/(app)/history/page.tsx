import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Clock, CheckCircle, FileText, ArrowRight } from "lucide-react"

export default async function HistoryPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    include: {
      attempts: {
        orderBy: { submittedAt: 'desc' },
        include: { test: true }
      }
    }
  })

  if (!dbUser) return null

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Tests</h1>
          <p className="text-muted-foreground mt-1">Review your past performance and track your progress.</p>
        </div>
        <Button asChild>
          <Link href="/tests/new">Create New Test</Link>
        </Button>
      </div>

      <div className="grid gap-4">
        {dbUser.attempts.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground bg-muted/20 border-dashed border-2">
            <p>You haven't attempted any tests yet.</p>
          </Card>
        ) : (
          dbUser.attempts.map((attempt) => {
            const test = attempt.test
            const maxScore = test.totalQuestions * test.markingCorrect
            const accuracy = (attempt.totalCorrect + attempt.totalWrong + attempt.totalUnattempted) > 0 
              ? ((attempt.totalCorrect / (attempt.totalCorrect + attempt.totalWrong + attempt.totalUnattempted)) * 100).toFixed(0) 
              : 0

            return (
              <Card key={attempt.id} className="group hover:border-primary/50 transition-colors">
                <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">{test.title}</h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {new Date(attempt.submittedAt).toLocaleDateString()}</span>
                      <span className="flex items-center gap-1"><FileText className="w-4 h-4" /> {test.totalQuestions} Questions</span>
                      <span className="flex items-center gap-1"><CheckCircle className="w-4 h-4" /> {accuracy}% Accuracy</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-2xl font-bold">{attempt.score} <span className="text-lg text-muted-foreground font-normal">/ {maxScore}</span></div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Score</div>
                    </div>
                    <Button variant="outline" className="shrink-0" asChild>
                      <Link href={`/tests/${test.id}/result?attempt=${attempt.id}`}>
                        View Result <ArrowRight className="w-4 h-4 ml-2" />
                      </Link>
                    </Button>
                  </div>
                  
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
