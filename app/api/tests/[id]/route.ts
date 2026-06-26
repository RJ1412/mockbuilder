import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const test = await prisma.test.findUnique({
    where: { id: params.id },
    include: {
      questions: {
        orderBy: { questionNo: 'asc' }
      }
    }
  })

  if (!test) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Remove correctAnswer and explanation if not submitted yet
  const safeQuestions = test.questions.map(q => {
    const { correctAnswer, explanation, ...safeQ } = q
    return safeQ
  })

  return NextResponse.json({ ...test, questions: safeQuestions })
}

