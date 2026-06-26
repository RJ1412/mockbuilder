import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { callAI } from '@/lib/ai'
import { customParsePDF } from '@/lib/custom-pdf-parser'
import { parsePdfAdvanced } from '@/lib/advanced-pdf-parser'

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { testId } = await request.json()
    if (!testId) {
      return NextResponse.json({ error: "Missing testId" }, { status: 400 })
    }

    const test = await prisma.test.findUnique({ where: { id: testId } })
    if (!test) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 })
    }
    
    const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } })
    if (test.userId !== dbUser?.id) {
       return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 1. Download PDFs
    // For questionPaperUrl, extract the path from the URL
    const qpPath = test.questionPaperUrl.split('/question-papers/')[1]
    const { data: qpBlob, error: qpError } = await supabase.storage.from('question-papers').download(qpPath)
    if (qpError) throw new Error("Failed to download question paper: " + qpError.message)
    const qpBuffer = Buffer.from(await qpBlob.arrayBuffer())

    // 2. Advanced Layout-Aware Parser (Local Node.js)
    console.log("Starting Local Advanced PDF Parse...")
    const parsedQuestions = await parsePdfAdvanced(qpBuffer)
    console.log("Extracted Questions:", parsedQuestions.length)

    if (parsedQuestions.length === 0) {
      throw new Error("Local parser failed to extract questions. The PDF format may be unsupported.")
    }

    // 4. Insert into DB
    const sanitize = (str: string | null | undefined) => str ? str.replace(/\0/g, '') : str;

    const questionsData = parsedQuestions.slice(0, test.totalQuestions).map((q: any) => ({
      testId: test.id,
      questionNo: parseInt(q.questionNo) || 0,
      questionText: sanitize(q.questionText) || '',
      type: q.type || 'MCQ',
      imageUrl: q.imageUrl || null,
      optionA: sanitize(q.optionA) || null,
      optionB: sanitize(q.optionB) || null,
      optionC: sanitize(q.optionC) || null,
      optionD: sanitize(q.optionD) || null,
      correctAnswer: q.correctAnswer || "",
      explanation: sanitize(q.explanation) || null,
      topic: sanitize(q.topic) || null
    }))

    await prisma.question.createMany({
      data: questionsData
    })

    // 5. Update Status
    await prisma.test.update({
      where: { id: test.id },
      data: { status: "PROCESSING" }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Test processing error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
