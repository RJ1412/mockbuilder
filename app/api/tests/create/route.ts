import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import prisma from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const questionPaperFile = formData.get('questionPaperFile') as File | null
    const answerKeyFile = formData.get('answerKeyFile') as File | null
    const title = formData.get('title') as string
    const totalQuestions = parseInt(formData.get('totalQuestions') as string)
    const durationMinutes = parseInt(formData.get('durationMinutes') as string)
    const markingCorrect = parseFloat(formData.get('markingCorrect') as string)
    const markingWrong = parseFloat(formData.get('markingWrong') as string)
    const sectionTimersStr = formData.get('sectionTimers') as string | null
    const sectionTimers = sectionTimersStr ? JSON.parse(sectionTimersStr) : null

    if (!questionPaperFile || !title) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } })
    if (!dbUser) {
      return NextResponse.json({ error: "User not found in DB" }, { status: 404 })
    }

    // Use admin client to bypass RLS for storage uploads
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Upload Question Paper
    const qpExt = questionPaperFile.name.split('.').pop()
    const qpPath = `${user.id}/${uuidv4()}.${qpExt}`
    const { data: qpData, error: qpError } = await supabaseAdmin.storage
      .from('question-papers')
      .upload(qpPath, questionPaperFile, {
        cacheControl: '3600',
        upsert: false
      })

    if (qpError) throw new Error("Failed to upload question paper: " + qpError.message)

    const { data: qpUrlData } = supabaseAdmin.storage.from('question-papers').getPublicUrl(qpPath)
    
    // Upload Answer Key (optional)
    let akUrl = null
    if (answerKeyFile) {
      const akExt = answerKeyFile.name.split('.').pop()
      const akPath = `${user.id}/${uuidv4()}.${akExt}`
      const { data: akData, error: akError } = await supabaseAdmin.storage
        .from('answer-keys')
        .upload(akPath, answerKeyFile, {
          cacheControl: '3600',
          upsert: false
        })
      if (akError) throw new Error("Failed to upload answer key: " + akError.message)
      const { data: akUrlData } = supabaseAdmin.storage.from('answer-keys').getPublicUrl(akPath)
      akUrl = akUrlData.publicUrl
    }

    // Create Test in Prisma
    const test = await prisma.test.create({
      data: {
        userId: dbUser.id,
        title,
        totalQuestions,
        durationMinutes,
        markingCorrect,
        markingWrong,
        sectionTimers,
        hasAnswerKey: !!answerKeyFile,
        questionPaperUrl: qpUrlData.publicUrl,
        answerKeyUrl: akUrl,
        status: "PROCESSING"
      }
    })

    return NextResponse.json({ testId: test.id })
  } catch (error: any) {
    console.error("Test creation error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
