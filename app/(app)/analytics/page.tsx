import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { ScoreTrendChart } from "@/components/charts/ScoreTrendChart"

export default async function AnalyticsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    include: {
      attempts: {
        orderBy: { submittedAt: 'asc' }, // chronological
        include: { test: true }
      }
    }
  })

  if (!dbUser) return null

  const attempts = dbUser.attempts

  if (attempts.length === 0) {
    return (
      <div className="max-w-5xl mx-auto py-8">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Analytics Dashboard</h1>
        <Card className="p-12 text-center text-muted-foreground bg-muted/20 border-dashed border-2">
          <p>You haven't attempted any tests yet. Complete some tests to see your analytics.</p>
        </Card>
      </div>
    )
  }

  // Aggregate stats
  const totalAttempts = attempts.length
  let totalScore = 0
  let totalMaxScore = 0
  let totalQuestions = 0
  let totalCorrect = 0
  let totalWrong = 0
  let totalUnattempted = 0
  let totalTimeSeconds = 0

  attempts.forEach(a => {
    totalScore += a.score
    totalMaxScore += a.test.totalQuestions * a.test.markingCorrect
    totalQuestions += a.test.totalQuestions
    totalCorrect += a.totalCorrect
    totalWrong += a.totalWrong
    totalUnattempted += a.totalUnattempted
    totalTimeSeconds += a.timeTakenSeconds
  })

  const avgScorePercent = totalMaxScore > 0 ? ((totalScore / totalMaxScore) * 100).toFixed(1) : 0
  const avgAccuracy = totalQuestions > 0 ? ((totalCorrect / totalQuestions) * 100).toFixed(1) : 0
  const avgTimePerQuestion = totalQuestions > 0 ? (totalTimeSeconds / totalQuestions).toFixed(1) : 0

  const trendData = attempts.map((a, i) => ({
    name: `Test ${i + 1}`,
    score: a.score,
    testName: a.test.title
  }))

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Analytics Dashboard</h1>
        <p className="text-muted-foreground mt-1">Deep dive into your performance metrics.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Average Score</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{avgScorePercent}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Overall Accuracy</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{avgAccuracy}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Tests Taken</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{totalAttempts}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Time/Question</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{avgTimePerQuestion}s</div></CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Score Progression</CardTitle>
            <CardDescription>Your score across all tests in chronological order</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ScoreTrendChart data={trendData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Response Distribution</CardTitle>
            <CardDescription>Breakdown of all questions attempted</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full" /> Correct</span>
                <span className="font-bold">{totalCorrect}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${(totalCorrect/Math.max(totalQuestions, 1))*100}%` }} /></div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm font-medium flex items-center gap-2"><div className="w-3 h-3 bg-red-500 rounded-full" /> Incorrect</span>
                <span className="font-bold">{totalWrong}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2"><div className="bg-red-500 h-2 rounded-full" style={{ width: `${(totalWrong/Math.max(totalQuestions, 1))*100}%` }} /></div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm font-medium flex items-center gap-2"><div className="w-3 h-3 bg-gray-400 rounded-full" /> Unattempted</span>
                <span className="font-bold">{totalUnattempted}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2"><div className="bg-gray-400 h-2 rounded-full" style={{ width: `${(totalUnattempted/Math.max(totalQuestions, 1))*100}%` }} /></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Time Management</CardTitle>
            <CardDescription>Total time spent across all tests</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col justify-center h-[200px]">
             <div className="text-center">
                <div className="text-5xl font-bold text-primary mb-2">{(totalTimeSeconds / 3600).toFixed(1)}</div>
                <div className="text-muted-foreground font-medium uppercase tracking-widest text-sm">Hours Practiced</div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
