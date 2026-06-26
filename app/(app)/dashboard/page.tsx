import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ScoreTrendChart } from "@/components/charts/ScoreTrendChart"
import { AccuracyDonut } from "@/components/charts/AccuracyDonut"

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    include: {
      tests: {
        orderBy: { createdAt: "desc" },
        take: 5
      },
      attempts: {
        orderBy: { submittedAt: "desc" },
        include: {
          test: true
        }
      }
    }
  })

  if (!dbUser) return null

  // Calculate Stats
  const totalTests = dbUser.attempts.length
  const avgScore = totalTests > 0 ? (dbUser.attempts.reduce((acc, a) => acc + a.score, 0) / totalTests).toFixed(1) : "0"
  const bestScore = totalTests > 0 ? Math.max(...dbUser.attempts.map(a => a.score)) : 0
  const lastActive = totalTests > 0 ? new Date(dbUser.attempts[0].submittedAt).toLocaleDateString() : "Never"

  const scoreTrendData = dbUser.attempts.slice(0, 10).reverse().map((a, i) => ({
    name: `T${i + 1}`,
    score: a.score,
    testName: a.test.title
  }))

  const donutData = dbUser.attempts.reduce((acc, a) => {
    acc.correct += a.totalCorrect
    acc.wrong += a.totalWrong
    acc.unattempted += a.totalUnattempted
    return acc
  }, { correct: 0, wrong: 0, unattempted: 0 })

  const totalQuestions = donutData.correct + donutData.wrong + donutData.unattempted
  const accuracy = totalQuestions > 0 ? ((donutData.correct / totalQuestions) * 100).toFixed(1) : "0"

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Good morning, {dbUser.name.split(' ')[0]} 👋</h1>
        <p className="text-muted-foreground">Here's a summary of your performance.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Attempts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTests}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgScore}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Best Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bestScore}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Active</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lastActive}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-7">
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Score Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ScoreTrendChart data={scoreTrendData} />
          </CardContent>
        </Card>
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Overall Accuracy</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
             {totalQuestions > 0 ? <AccuracyDonut data={donutData} accuracy={accuracy} /> : <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Tests</CardTitle>
          </CardHeader>
          <CardContent>
            {dbUser.attempts.length === 0 ? (
              <p className="text-sm text-muted-foreground">You haven't attempted any tests yet.</p>
            ) : (
              <div className="space-y-4">
                {dbUser.attempts.slice(0, 5).map(attempt => (
                  <div key={attempt.id} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="font-medium">{attempt.test.title}</p>
                      <p className="text-xs text-muted-foreground">{new Date(attempt.submittedAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-sm">{attempt.score} / {attempt.test.totalQuestions * attempt.test.markingCorrect}</span>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/tests/${attempt.testId}/result?attempt=${attempt.id}`}>View Result</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="bg-primary/5 border-primary/20 flex flex-col justify-center items-center p-6 text-center">
          <h3 className="text-xl font-bold mb-2">Ready for your next test?</h3>
          <p className="text-muted-foreground mb-6">Upload a new question paper and challenge yourself.</p>
          <Button asChild size="lg">
            <Link href="/tests/new">Start New Test</Link>
          </Button>
        </Card>
      </div>
    </div>
  )
}
