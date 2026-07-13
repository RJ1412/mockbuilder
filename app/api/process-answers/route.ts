import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { callAI } from '@/lib/ai'

export async function POST(request: Request) {
  try {
    const { testId } = await request.json()

    if (!testId) {
      return NextResponse.json({ error: 'testId is required' }, { status: 400 })
    }

    // Run solving in the background asynchronously so we don't timeout the client
    // Vercel allows Edge/Serverless functions to run for a bit, but for Next.js app router 
    // it's best to return immediately if possible. However, the client is explicitly calling this 
    // endpoint as a background worker and will poll the status.
    
    // Process questions in batches of 3 to avoid Groq rate limits
    const questions = await prisma.question.findMany({
      where: { testId, correctAnswer: '' },
      orderBy: { questionNo: 'asc' }
    })

    if (questions.length === 0) {
      return NextResponse.json({ success: true, message: 'No questions need solving.' })
    }
    
    // We update status to SOLVING
    await prisma.test.update({
      where: { id: testId },
      data: { status: 'PROCESSING' } // Let UI know we're still processing answers
    })

    // To prevent Vercel 504 timeouts on 75 questions, we can only process ~10 questions per request
    // and let the client call us again (Chunking).
    const batchSize = 10;
    const batch = questions.slice(0, batchSize);

    for (const q of batch) {
      let prompt = `Solve this question with the utmost precision.
If it is a multiple choice question (MCQ), provide the final correct option (A, B, C, or D).
If it is a numerical value question, calculate the exact value. If the exact value is a fraction, mathematical expression (like 2/pi), or decimal, you MUST evaluate it and round it to the CLOSEST INTEGER. Your final output must be ONLY the integer.

Question: ${q.questionText}
Type: ${q.type}
`;
      if (q.type === 'MCQ') {
        prompt += `
Options:
(A) ${q.optionA}
(B) ${q.optionB}
(C) ${q.optionC}
(D) ${q.optionD}
`;
      }

      const systemPrompt = `You are an expert JEE teacher. You must analyze the question mathematically and accurately. Respond in valid JSON format with two keys:
"correctAnswer": The final answer. For MCQ, provide ONLY the correct option (A, B, C, or D). For Numerical questions, evaluate the exact value and round it to the CLOSEST INTEGER. 
"explanation": A detailed, step-by-step mathematical explanation of how to arrive at the answer.`;

      try {
        const response = await callAI(prompt, systemPrompt, true, q.imageUrl);
        let parsed = { correctAnswer: "", explanation: "" };
        try {
           parsed = JSON.parse(response);
        } catch(e) {
           console.error("JSON parse failed", response);
        }
        
        let cleanedAnswer = String(parsed.correctAnswer || "").trim().replace(/^['"]|['"]$/g, '').toUpperCase();
        
        // Fallback for safety
        if (q.type === 'MCQ' && !['A', 'B', 'C', 'D'].includes(cleanedAnswer)) {
            cleanedAnswer = 'A'; // Hard fallback if AI hallucinates
        } else if (q.type === 'NUMERICAL') {
            // Match the closest integer, stripping out non-digits except minus sign
            const match = cleanedAnswer.match(/-?\d+/);
            cleanedAnswer = match ? match[0] : '0';
        }

        await prisma.question.update({
          where: { id: q.id },
          data: { correctAnswer: cleanedAnswer, explanation: parsed.explanation || "No explanation provided." }
        })
      } catch (err) {
        console.error(`AI failed for question ${q.id}:`, err);
        // Leave empty so next batch can retry, or fallback to A
        await prisma.question.update({
          where: { id: q.id },
          data: { correctAnswer: q.type === 'MCQ' ? 'A' : '0' }
        })
      }
    }

    // Check if more questions remain
    const remaining = questions.length - batch.length;
    if (remaining <= 0) {
       await prisma.test.update({
         where: { id: testId },
         data: { status: 'READY' }
       })
    }

    return NextResponse.json({ 
      success: true, 
      processed: batch.length,
      remaining: remaining,
      complete: remaining <= 0
    })

  } catch (error: any) {
    console.error("AI Solver error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
