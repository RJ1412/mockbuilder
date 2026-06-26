import { GoogleGenerativeAI } from '@google/generative-ai'
import Groq from 'groq-sdk'

export async function callAI(
  prompt: string,
  systemPrompt: string,
  expectJSON: boolean,
  imageUrl?: string | null
): Promise<string> {
  const geminiApiKey = process.env.GEMINI_API_KEY
  const groqApiKey = process.env.GROQ_API_KEY

  if (!geminiApiKey && !groqApiKey) {
    throw new Error('No AI API keys provided. Please set GEMINI_API_KEY or GROQ_API_KEY.')
  }

  // 1. Try Gemini
  if (geminiApiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey)
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash-latest',
        generationConfig: expectJSON ? { responseMimeType: 'application/json' } : undefined,
      })

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Understood.' }] },
        ],
      })

      let msgParts: any[] = [{ text: prompt }];
      if (imageUrl && imageUrl.startsWith('data:image')) {
         const mimeType = imageUrl.split(';')[0].split(':')[1];
         const data = imageUrl.split(',')[1];
         msgParts.push({
            inlineData: {
               data,
               mimeType
            }
         });
      }

      const result = await chat.sendMessage(msgParts)
      const responseText = result.response.text()
      if (responseText) return responseText
    } catch (geminiError) {
      console.error('Gemini API Error, falling back to Groq:', geminiError)
    }
  }

  // 2. Try Groq (Fallback)
  if (groqApiKey) {
    try {
      const groq = new Groq({ apiKey: groqApiKey })
      
      let finalSystemPrompt = systemPrompt
      if (expectJSON) {
        finalSystemPrompt += "\nRespond only with valid JSON, no markdown, no explanation."
      }

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: finalSystemPrompt },
          { role: 'user', content: prompt }
        ],
        model: 'llama-3.1-8b-instant',
        // groq might fail if response_format is used and json is not requested, but we requested it.
      })

      const content = chatCompletion.choices[0]?.message?.content
      if (content) {
        // If expectJSON is true, try to clean up the response to just the JSON part
        // in case groq didn't perfectly follow instructions.
        if (expectJSON) {
          const jsonMatch = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
          if (jsonMatch) {
            return jsonMatch[0];
          }
        }
        return content
      }
    } catch (groqError) {
      console.error('Groq API Error:', groqError)
      throw new Error('Both Gemini and Groq AI calls failed.')
    }
  }

  throw new Error('Failed to generate AI response.')
}
