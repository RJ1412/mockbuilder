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

    // 2. Send PDF to Python FastApi Microservice (Image Extractor)
    console.log("Calling Python Image Extractor API...")
    
    // Create FormData with the buffer
    const formData = new FormData()
    formData.append('file', new Blob([qpBuffer], { type: 'application/pdf' }), 'test.pdf')
    
    // Send to localhost:5000 (Python microservice)
    const pythonUrl = process.env.PYTHON_PARSER_URL || 'http://127.0.0.1:5000'
    const pyRes = await fetch(`${pythonUrl}/extract?testId=${test.id}`, {
      method: 'POST',
      body: formData
    })
    
    if (!pyRes.ok) {
      throw new Error(`Python API failed: ${pyRes.statusText}`)
    }
    
    const pyData = await pyRes.json()
    const parsedQuestions = pyData.questions || []
    
    console.log("Extracted Questions from Python API:", parsedQuestions.length)

    if (parsedQuestions.length === 0) {
      throw new Error("Python parser failed to extract questions. The PDF format may be unsupported.")
    }

    // 4. Insert into DB
    const sanitize = (str: string | null | undefined) => str ? str.replace(/\0/g, '') : str;

    const questionsData = parsedQuestions.map((q: any, idx: number) => ({
      testId: test.id,
      questionNo: idx + 1,
      questionText: `[${q.part || 'Part'} - ${q.section || 'Section'}] Q${q.printed_number || q.questionNo || ''}`,
      type: q.type === 'numerical' ? 'NUMERICAL' : 'MCQ',
      imageUrl: q.image || q.imageUrl || null,
      optionA: null,
      optionB: null,
      optionC: null,
      optionD: null,
      correctAnswer: "",
      explanation: null,
      topic: null
    }))

    await prisma.question.createMany({
      data: questionsData
    })

    // 5. Update Status
    await prisma.test.update({
      where: { id: test.id },
      data: { 
        status: "PROCESSING",
        totalQuestions: parsedQuestions.length
      }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Test processing error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
