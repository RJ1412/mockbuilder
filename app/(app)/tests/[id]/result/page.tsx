import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AccuracyDonut } from "@/components/charts/AccuracyDonut"
import { ArrowLeft, CheckCircle, XCircle, MinusCircle, HelpCircle } from "lucide-react"

export default async function TestResultPage({ params, searchParams }: { params: { id: string }, searchParams: { attempt: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const attemptId = searchParams.attempt

  const attempt = await prisma.testAttempt.findUnique({
    where: { id: attemptId, userId: (await prisma.user.findUnique({ where: { supabaseId: user.id } }))?.id },
    include: { test: { include: { questions: { orderBy: { questionNo: 'asc' } } } } }
  })

  if (!attempt) notFound()

  const { test } = attempt
  const questions = test.questions

  const maxScore = test.totalQuestions * test.markingCorrect
  const totalAttempted = attempt.totalCorrect + attempt.totalWrong + attempt.totalUnattempted
  const accuracy = totalAttempted > 0 
    ? ((attempt.totalCorrect / (attempt.totalCorrect + attempt.totalWrong + attempt.totalUnattempted)) * 100).toFixed(1) 
    : "0"

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Button variant="ghost" className="mb-2 -ml-4" asChild>
            <Link href="/dashboard"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Result: {test.title}</h1>
          <p className="text-muted-foreground mt-1">Submitted on {new Date(attempt.submittedAt).toLocaleString()}</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold text-primary">{attempt.score} <span className="text-2xl text-muted-foreground">/ {maxScore}</span></div>
          <p className="text-sm font-medium">Total Score</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-4 bg-primary/10 rounded-full text-primary">
              <CheckCircle className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Correct</p>
              <p className="text-2xl font-bold">{attempt.totalCorrect}</p>
              <p className="text-xs text-muted-foreground">+{attempt.totalCorrect * test.markingCorrect} marks</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-4 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full">
              <XCircle className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Wrong</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{attempt.totalWrong}</p>
              <p className="text-xs text-muted-foreground">{attempt.totalWrong * test.markingWrong} marks</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/50 border-border">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="p-4 bg-muted text-muted-foreground rounded-full">
              <MinusCircle className="w-8 h-8" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Unattempted</p>
              <p className="text-2xl font-bold">{attempt.totalUnattempted}</p>
              <p className="text-xs text-muted-foreground">0 marks</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 flex flex-col items-center justify-center h-full">
            <div className="w-full h-24 mb-2">
              <AccuracyDonut 
                data={{ correct: attempt.totalCorrect, wrong: attempt.totalWrong, unattempted: attempt.totalUnattempted }} 
                accuracy={accuracy} 
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <h2 className="text-2xl font-bold tracking-tight border-b pb-2">Detailed Analysis</h2>
        
        {questions.map((q) => {
          const response = attempt.responses ? (attempt.responses as any)[q.questionNo.toString()] : null
          let isCorrect = false
          if (q.type === 'NUMERICAL') {
            if (response) {
               isCorrect = parseFloat(response) === parseFloat(q.correctAnswer)
            }
          } else {
            isCorrect = response === q.correctAnswer
          }
          const isUnattempted = !response

          return (
            <Card key={q.id} className={`border-l-4 ${isCorrect ? 'border-l-green-500' : isUnattempted ? 'border-l-gray-400' : 'border-l-red-500'}`}>
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <div className="w-8 h-8 shrink-0 rounded bg-muted flex items-center justify-center font-bold text-sm">
                    Q{q.questionNo}
                  </div>
                  <div className="flex-1 space-y-4">
                    {q.imageUrl && <img src={q.imageUrl} alt="Question" className="max-w-md rounded-lg border" />}
                    <p className="text-lg font-medium">{q.questionText}</p>
                    
                    {q.type === 'NUMERICAL' ? (
                       <div className="flex gap-4">
                         <div className="p-4 bg-muted/50 rounded-lg border">
                           <span className="text-sm font-semibold text-muted-foreground uppercase">Your Answer</span>
                           <div className={`text-xl font-bold ${isCorrect ? 'text-green-600' : isUnattempted ? 'text-gray-500' : 'text-red-600'}`}>
                             {response || 'Not Attempted'}
                           </div>
                         </div>
                         <div className="p-4 bg-green-50 dark:bg-green-900/10 rounded-lg border border-green-200 dark:border-green-900">
                           <span className="text-sm font-semibold text-green-700 dark:text-green-400 uppercase">Correct Answer</span>
                           <div className="text-xl font-bold text-green-700 dark:text-green-400">
                             {q.correctAnswer}
                           </div>
                         </div>
                       </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {['A', 'B', 'C', 'D'].map(opt => {
                          const optKey = `option${opt}` as keyof typeof q
                          const isSelected = response === opt
                          const isActualCorrect = q.correctAnswer === opt

                          let bgClass = "bg-card border-border"
                          if (isSelected && isCorrect) bgClass = "bg-green-100 border-green-500 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          else if (isSelected && !isCorrect) bgClass = "bg-red-100 border-red-500 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                          else if (!isSelected && isActualCorrect) bgClass = "bg-green-50 border-green-500 text-green-800 dark:bg-green-900/10 dark:text-green-400 border-dashed"

                          return (
                            <div key={opt} className={`p-3 rounded-lg border flex items-center gap-3 ${bgClass}`}>
                              <div className="w-6 h-6 rounded bg-background flex items-center justify-center text-xs font-bold shrink-0 shadow-sm border">
                                {opt}
                              </div>
                              <span className="text-sm">{q[optKey] as string}</span>
                              {isSelected && <span className="ml-auto text-xs font-bold uppercase tracking-wider opacity-70">Your Answer</span>}
                              {!isSelected && isActualCorrect && <span className="ml-auto text-xs font-bold uppercase tracking-wider text-green-600 dark:text-green-400">Correct Answer</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {q.explanation && (
                      <div className="mt-4 p-4 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
                        <p className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">
                          <HelpCircle className="w-4 h-4" /> AI Explanation
                        </p>
                        <div className="text-sm text-blue-900 dark:text-blue-200 whitespace-pre-wrap">{q.explanation}</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
