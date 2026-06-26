import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { testId } = await request.json()
    const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } })

    const attempt = await prisma.testAttempt.create({
      data: {
        testId,
        userId: dbUser!.id,
        responses: {},
        score: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalUnattempted: 0,
        timeTakenSeconds: 0,
        tabSwitchCount: 0,
        startedAt: new Date(),
        submittedAt: new Date() // will be updated on submit
      }
    })

    return NextResponse.json({ attemptId: attempt.id })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
