import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { responses, tabSwitchCount, timeTakenSeconds } = await request.json()

    const attempt = await prisma.testAttempt.findUnique({
      where: { id: params.id },
      include: { test: { include: { questions: true } } }
    })

    if (!attempt) return NextResponse.json({ error: "Attempt not found" }, { status: 404 })

    const test = attempt.test
    const questions = test.questions

    let score = 0
    let totalCorrect = 0
    let totalWrong = 0
    let totalUnattempted = 0

    questions.forEach(q => {
      const selected = responses[q.questionNo.toString()]
      if (!selected) {
        totalUnattempted++
      } else {
        let isCorrect = false
        if (q.type === 'NUMERICAL') {
          isCorrect = parseFloat(selected) === parseFloat(q.correctAnswer)
        } else {
          isCorrect = selected.trim().toUpperCase() === q.correctAnswer.trim().toUpperCase()
        }

        if (isCorrect) {
          totalCorrect++
          score += test.markingCorrect
        } else {
          totalWrong++
          score += test.markingWrong
        }
      }
    })

    await prisma.testAttempt.update({
      where: { id: params.id },
      data: {
        responses,
        tabSwitchCount,
        timeTakenSeconds,
        score,
        totalCorrect,
        totalWrong,
        totalUnattempted,
        submittedAt: new Date()
      }
    })

    return NextResponse.json({ score, totalCorrect, totalWrong, totalUnattempted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
