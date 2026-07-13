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
        model: 'gemini-2.5-flash',
        generationConfig: expectJSON ? { responseMimeType: 'application/json' } : undefined,
      })

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemPrompt }] },
          { role: 'model', parts: [{ text: 'Understood.' }] },
        ],
      })

      let msgParts: any[] = [{ text: prompt }];
      if (imageUrl) {
         try {
            let mimeType = 'image/png';
            let data = '';
            
            if (imageUrl.startsWith('data:image')) {
               mimeType = imageUrl.split(';')[0].split(':')[1];
               data = imageUrl.split(',')[1];
            } else if (imageUrl.startsWith('http')) {
               console.log("[AI] Fetching image for Gemini:", imageUrl);
               const imgRes = await fetch(imageUrl, { cache: 'no-store' });
               if (!imgRes.ok) throw new Error(`Failed to fetch image: ${imgRes.status} ${imgRes.statusText}`);
               
               const arrayBuffer = await imgRes.arrayBuffer();
               
               if (typeof Buffer !== 'undefined') {
                   data = Buffer.from(arrayBuffer).toString('base64');
               } else {
                   // Fallback for edge runtimes without Buffer
                   const bytes = new Uint8Array(arrayBuffer);
                   let binary = '';
                   for (let i = 0; i < bytes.byteLength; i++) {
                       binary += String.fromCharCode(bytes[i]);
                   }
                   data = btoa(binary);
               }
               mimeType = imgRes.headers.get('content-type') || 'image/png';
               console.log("[AI] Successfully converted image to base64.");
            }

            if (data) {
               msgParts.push({
                  inlineData: {
                     data,
                     mimeType
                  }
               });
            }
         } catch (err) {
            console.error("[AI] Failed to load image for Gemini:", err);
         }
      }

      let attempt = 0;
      let maxAttempts = 3;
      while (attempt < maxAttempts) {
        try {
          const result = await chat.sendMessage(msgParts)
          const responseText = result.response.text()
          if (responseText) return responseText
        } catch (geminiError: any) {
          if (geminiError?.status === 429) {
            console.warn(`[AI] Gemini 429 Rate Limit hit. Retrying in 30 seconds... (Attempt ${attempt + 1}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 30000));
            attempt++;
          } else {
            console.error('Gemini API Error:', geminiError)
            break; // Break out of retry loop for non-429 errors
          }
        }
      }
      
      // If we exhausted attempts or broke out and have an image, we MUST fail because Groq cannot see images.
      if (imageUrl) {
          throw new Error('Gemini failed and Groq does not support vision. Aborting.');
      }
    } catch (geminiError) {
      console.error('Gemini API Error:', geminiError)
      if (imageUrl) throw new Error('Gemini failed and Groq does not support vision. Aborting.');
    }
  }

  // 2. Try Groq (Fallback) ONLY for text-based questions
  if (groqApiKey && !imageUrl) {
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
