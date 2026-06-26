'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function ProcessingStatus({ testId }: { testId: string }) {
  const router = useRouter()
  const [progress, setProgress] = useState("Initializing AI Solver...")
  
  useEffect(() => {
    let isCancelled = false
    
    const pollAnswers = async () => {
      try {
        const res = await fetch('/api/process-answers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ testId })
        })
        
        const data = await res.json()
        if (data.complete || data.message === 'No questions need solving.') {
          if (!isCancelled) {
            router.refresh()
          }
          return
        }
        
        if (data.remaining !== undefined) {
          setProgress(`Solving answers with AI... ${data.remaining} remaining`)
        }
        
        // Poll again after a short delay
        if (!isCancelled) {
          setTimeout(pollAnswers, 1000)
        }
      } catch (err) {
        console.error("Polling error:", err)
        setProgress("Error processing answers. Will retry...")
        if (!isCancelled) {
          setTimeout(pollAnswers, 3000)
        }
      }
    }
    
    pollAnswers()
    
    return () => { isCancelled = true }
  }, [testId, router])

  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center">
      <div className="animate-spin w-10 h-10 border-4 border-primary border-t-transparent rounded-full mb-6" />
      <h2 className="text-2xl font-bold mb-2">Generating Genuine Answers...</h2>
      <p className="text-muted-foreground mb-6">{progress}</p>
      <p className="text-xs text-muted-foreground max-w-md">
        We are using AI (Gemini) to mathematically solve the test and extract the correct options. This may take a few minutes for a 75-question test.
      </p>
    </div>
  )
}
