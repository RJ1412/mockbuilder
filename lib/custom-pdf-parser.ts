// @ts-expect-error missing typings
import pdfParse from 'pdf-parse/lib/pdf-parse.js'
import { v4 as uuidv4 } from 'uuid'
import { createClient } from '@/lib/supabase/server'

interface ParsedQuestion {
  questionNo: number
  questionText: string
  type: 'MCQ' | 'NUMERICAL'
  optionA?: string
  optionB?: string
  optionC?: string
  optionD?: string
  correctAnswer: string
  imageUrl?: string | null
}

export async function customParsePDF(buffer: Buffer): Promise<ParsedQuestion[]> {
  const supabase = createClient()
  const questions: ParsedQuestion[] = []

  // 1. Text Parsing using pdf-parse
  const data = await pdfParse(buffer)
  let text = data.text

  // 1a. Remove Devanagari block characters (Hindi) and control characters
  text = text.replace(/[\u0900-\u097F]+/g, '')
  text = text.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]+/g, ' ')
  
  // 1b. Clean up multiple spaces
  text = text.replace(/ {2,}/g, ' ')

  // 2. Anchor-based Parsing
  // Split by (A) to find all questions reliably regardless of layout
  const chunks = text.split(/\(A\)/)
  
  for (let i = 1; i < chunks.length; i++) {
    const prevChunk = chunks[i-1]
    const currentChunk = chunks[i]
    
    // The question text is the last part of prevChunk (after the previous (D))
    let qText = prevChunk
    const lastD = qText.lastIndexOf('(D)')
    if (lastD !== -1) {
      qText = qText.substring(lastD + 3)
    }
    
    // Clean up leading question numbers
    qText = qText.trim()
    qText = qText.replace(/^[\d\.\s]+/, '')
    
    // Extract options from currentChunk
    const bSplit = currentChunk.split(/\(B\)/)
    if (bSplit.length < 2) continue
    
    const optionA = bSplit[0].trim()
    const cSplit = bSplit[1].split(/\(C\)/)
    if (cSplit.length < 2) continue
    
    const optionB = cSplit[0].trim()
    const dSplit = cSplit[1].split(/\(D\)/)
    if (dSplit.length < 2) continue
    
    const optionC = dSplit[0].trim()
    
    // Option D is everything up to the first newline or just a rough approximation
    // To be safer, we can just take the first line or first 50 chars if no newline
    let optionD = dSplit[1].split('\n')[0].trim()
    if (!optionD && dSplit[1].length > 0) {
       optionD = dSplit[1].substring(0, 50).trim()
    }
    
    if (qText.length > 5) {
      questions.push({
        questionNo: questions.length + 1,
        questionText: qText,
        type: 'MCQ',
        optionA,
        optionB,
        optionC,
        optionD,
        correctAnswer: 'A'
      })
    }
  }
  
  // Deduplicate questions to filter out the garbled Hindi copies
  // Since English is usually first, we just keep questions that have a decent length
  // and we can filter out duplicates that have extremely similar optionA/B/C
  const uniqueQuestions: ParsedQuestion[] = []
  const seenOptions = new Set<string>()
  
  for (const q of questions) {
    const sig = `${q.optionA}|${q.optionB}`
    if (!seenOptions.has(sig)) {
      seenOptions.add(sig)
      q.questionNo = uniqueQuestions.length + 1
      uniqueQuestions.push(q)
    }
  }

  return uniqueQuestions
}
