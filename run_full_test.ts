import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'
import { callAI } from './lib/ai'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const prisma = new PrismaClient()

async function main() {
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error("No user found in DB. Please sign in first.");
        return;
    }

    const test = await prisma.test.create({
        data: {
            userId: user.id,
            title: "Auto-Generated Full Test",
            questionPaperUrl: "local",
            totalQuestions: 75,
            durationMinutes: 180,
            markingCorrect: 4,
            markingWrong: -1,
            status: "PROCESSING"
        }
    });

    const testId = test.id;
    console.log(`Test created with ID: ${testId}`);

    const pdfPath = path.join(__dirname, 'image_extractor', 'last_upload.pdf');
    if (!fs.existsSync(pdfPath)) {
        console.error(`PDF not found at ${pdfPath}`);
        return;
    }

    console.log("Sending PDF to Python server for extraction...");
    const formData = new FormData();
    const fileBuffer = fs.readFileSync(pdfPath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    formData.append('file', blob, 'upload.pdf');

    const extractRes = await fetch(`http://127.0.0.1:5000/extract?testId=${testId}`, {
        method: 'POST',
        body: formData
    });

    if (!extractRes.ok) {
        console.error("Extraction failed:", await extractRes.text());
        return;
    }

    const extractData = await extractRes.json();
    console.log(`Extracted ${extractData.questions.length} questions. Saving to database...`);

    const qData = extractData.questions.map((q: any) => ({
        testId,
        questionNo: q.printed_number,
        type: q.type === 'numerical' ? 'NUMERICAL' : 'MCQ',
        questionText: `Question ${q.printed_number}`,
        optionA: q.type === 'numerical' ? '' : 'Option A',
        optionB: q.type === 'numerical' ? '' : 'Option B',
        optionC: q.type === 'numerical' ? '' : 'Option C',
        optionD: q.type === 'numerical' ? '' : 'Option D',
        correctAnswer: '',
        explanation: '',
        imageUrl: q.image,
    }));

    await prisma.question.createMany({
        data: qData
    });

    console.log("Database seeded. Beginning AI answer generation...");

    const questions = await prisma.question.findMany({
        where: { testId },
        orderBy: { questionNo: 'asc' }
    });

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`Solving question ${i + 1}/${questions.length} (Q${q.questionNo})`);
        
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
            
            if (q.type === 'MCQ' && !['A', 'B', 'C', 'D'].includes(cleanedAnswer)) {
                cleanedAnswer = 'A';
            } else if (q.type === 'NUMERICAL') {
                const match = cleanedAnswer.match(/-?\d+/);
                cleanedAnswer = match ? match[0] : '0';
            }

            await prisma.question.update({
                where: { id: q.id },
                data: { correctAnswer: cleanedAnswer, explanation: parsed.explanation || "No explanation provided." }
            });
            console.log(`  -> Answer: ${cleanedAnswer}`);
        } catch (err) {
            console.error(`  -> AI failed for question ${q.id}:`, err);
            await prisma.question.update({
                where: { id: q.id },
                data: { correctAnswer: q.type === 'MCQ' ? 'A' : '0' }
            });
        }
    }

    await prisma.test.update({
        where: { id: testId },
        data: { status: 'READY' }
    });

    console.log("All done! The test is ready in the dashboard.");
}

main().catch(console.error);
