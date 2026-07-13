"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Clock, Star, AlertTriangle, CheckCircle, HelpCircle } from "lucide-react"

export function CBTInterface({ test }: { test: any }) {
  const router = useRouter()
  const [attemptId, setAttemptId] = useState<string | null>(null)
  
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [responses, setResponses] = useState<Record<string, string>>({})
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({})
  const [visited, setVisited] = useState<Record<string, boolean>>({})
  
  const [timeLeft, setTimeLeft] = useState(test.durationMinutes * 60)
  const [tabSwitchCount, setTabSwitchCount] = useState(0)
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false)

  const currentQuestion = test.questions[currentQuestionIdx]

  // Track Visited
  useEffect(() => {
    if (currentQuestion) {
      setVisited(prev => ({ ...prev, [currentQuestion.questionNo]: true }))
    }
  }, [currentQuestionIdx, currentQuestion])

  // Initialize Attempt
  useEffect(() => {
    const initAttempt = async () => {
      // Check localStorage first
      const storedData = localStorage.getItem(`mockiq_attempt_${test.id}`)
      if (storedData) {
        const parsed = JSON.parse(storedData)
        if (parsed.attemptId) {
          setAttemptId(parsed.attemptId)
          setResponses(parsed.responses || {})
          setMarkedForReview(parsed.markedForReview || {})
          setVisited(parsed.visited || {})
          if (parsed.timeLeft) setTimeLeft(parsed.timeLeft)
          if (parsed.tabSwitchCount) setTabSwitchCount(parsed.tabSwitchCount)
          return
        }
      }

      // If no stored attempt, create one
      try {
        const res = await fetch("/api/attempts/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testId: test.id })
        })
        const data = await res.json()
        if (data.attemptId) {
          setAttemptId(data.attemptId)
          localStorage.setItem(`mockiq_attempt_${test.id}`, JSON.stringify({
            attemptId: data.attemptId,
            responses: {},
            markedForReview: {},
            visited: {},
            timeLeft: test.durationMinutes * 60,
            tabSwitchCount: 0
          }))
        }
      } catch (err) {
        toast.error("Failed to start attempt. Please try again.")
      }
    }
    initAttempt()
  }, [test.id, test.durationMinutes])

  // Timer & Auto Submit
  useEffect(() => {
    if (!attemptId || timeLeft <= 0 || isSubmitting) return

    const timerId = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerId)
          handleFinalSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerId)
  }, [attemptId, isSubmitting])

  // Save State to LocalStorage periodically & on change
  useEffect(() => {
    if (attemptId) {
      localStorage.setItem(`mockiq_attempt_${test.id}`, JSON.stringify({
        attemptId,
        responses,
        markedForReview,
        visited,
        timeLeft,
        tabSwitchCount
      }))
    }
  }, [attemptId, responses, markedForReview, visited, timeLeft, tabSwitchCount, test.id])

  // Sync to Backend periodically
  useEffect(() => {
    if (!attemptId) return
    const syncId = setInterval(() => {
      fetch(`/api/attempts/${attemptId}/save`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses, tabSwitchCount })
      })
    }, 30000) // every 30s
    return () => clearInterval(syncId)
  }, [attemptId, responses, tabSwitchCount])

  // Tab Visibility API
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setTabSwitchCount(prev => {
          const newCount = prev + 1
          toast.error(`Tab switch detected! (${newCount} times)`)
          return newCount
        })
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  // Disable Right Click
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault()
    document.addEventListener("contextmenu", handleContextMenu)
    return () => document.removeEventListener("contextmenu", handleContextMenu)
  }, [])

  const handleSelectOption = (option: string) => {
    setResponses(prev => ({ ...prev, [currentQuestion.questionNo]: option }))
  }

  const handleNumericalInput = (value: string) => {
    setResponses(prev => ({ ...prev, [currentQuestion.questionNo]: value }))
  }

  const handleClearResponse = () => {
    setResponses(prev => {
      const newRes = { ...prev }
      delete newRes[currentQuestion.questionNo]
      return newRes
    })
  }

  const handleMarkReview = () => {
    setMarkedForReview(prev => ({ 
      ...prev, 
      [currentQuestion.questionNo]: !prev[currentQuestion.questionNo] 
    }))
    if (currentQuestionIdx < test.questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1)
    }
  }

  const handleSaveAndNext = () => {
    if (currentQuestionIdx < test.questions.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1)
    }
  }

  const handleFinalSubmit = async () => {
    if (!attemptId || isSubmitting) return
    setIsSubmitting(true)
    
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          responses, 
          tabSwitchCount, 
          timeTakenSeconds: (test.durationMinutes * 60) - timeLeft 
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      
      localStorage.removeItem(`mockiq_attempt_${test.id}`)
      router.push(`/tests/${test.id}/result?attempt=${attemptId}`)
    } catch (err: any) {
      toast.error(err.message || "Failed to submit test")
      setIsSubmitting(false)
    }
  }

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const getPaletteColor = (qNo: number) => {
    const isAnswered = !!responses[qNo]
    const isMarked = !!markedForReview[qNo]
    const isVisited = !!visited[qNo]

    if (isAnswered && isMarked) return "bg-purple-300 text-purple-900 border-purple-400"
    if (isAnswered) return "bg-green-500 text-white border-green-600"
    if (isMarked) return "bg-purple-500 text-white border-purple-600"
    if (isVisited) return "bg-red-400 text-white border-red-500"
    return "bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-zinc-600"
  }

  const OptionCard = ({ label, optionId }: { label: string, optionId: string }) => {
    const isSelected = responses[currentQuestion.questionNo] === optionId
    
    return (
      <div 
        onClick={() => handleSelectOption(optionId)}
        className={`w-full p-4 rounded-xl border-2 cursor-pointer transition-all duration-150 flex items-center gap-4
          ${isSelected 
            ? 'border-primary bg-primary text-primary-foreground shadow-md' 
            : 'border-border bg-card hover:border-primary/50 hover:bg-primary/5'}`}
      >
        <div className={`w-8 h-8 flex shrink-0 items-center justify-center rounded-full border-2 font-bold
          ${isSelected ? 'border-primary-foreground bg-primary text-primary-foreground' : 'border-muted-foreground text-muted-foreground'}`}>
          {label}
        </div>
        <div className="text-lg font-semibold flex-1">
          Option {label}
        </div>
      </div>
    )
  }

  if (!attemptId) {
    return <div className="flex h-screen w-screen items-center justify-center"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" /></div>
  }

  if (!test.questions || test.questions.length === 0 || !currentQuestion) {
    return (
      <div className="flex h-screen w-screen items-center justify-center flex-col gap-4">
        <h2 className="text-2xl font-bold text-destructive">Test Processing Failed</h2>
        <p className="text-muted-foreground">This test has no questions. It may have failed during processing.</p>
        <Button onClick={() => router.push('/dashboard')}>Return to Dashboard</Button>
      </div>
    )
  }

  if (showConfirmSubmit) {
    const answered = Object.keys(responses).length
    const marked = Object.values(markedForReview).filter(Boolean).length
    const unattempted = test.totalQuestions - answered
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-card p-8 rounded-2xl border shadow-xl max-w-md w-full">
          <h2 className="text-2xl font-bold mb-6 text-center">Submit Test?</h2>
          <div className="grid grid-cols-2 gap-4 mb-8">
            <div className="flex flex-col items-center p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg">
              <CheckCircle className="w-6 h-6 mb-2" />
              <span className="font-bold text-xl">{answered}</span>
              <span className="text-xs uppercase">Answered</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg">
              <AlertTriangle className="w-6 h-6 mb-2" />
              <span className="font-bold text-xl">{unattempted}</span>
              <span className="text-xs uppercase">Unanswered</span>
            </div>
            <div className="flex flex-col items-center p-4 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 rounded-lg col-span-2">
              <Star className="w-6 h-6 mb-2" />
              <span className="font-bold text-xl">{marked}</span>
              <span className="text-xs uppercase">Marked for Review</span>
            </div>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" className="w-full" onClick={() => setShowConfirmSubmit(false)}>Cancel</Button>
            <Button className="w-full" onClick={handleFinalSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Yes, Submit'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-page)]">
      {/* Left Panel */}
      <div className="flex-1 flex flex-col min-w-0 border-r border-border bg-card">
        {/* Top Bar */}
        <div className="h-16 shrink-0 border-b border-border bg-card flex items-center justify-between px-6 shadow-sm z-10">
          <h1 className="font-semibold text-lg truncate pr-4">{test.title}</h1>
          <div className="flex items-center gap-4">
            {test.sectionTimers && <span className="text-sm font-medium bg-muted px-3 py-1 rounded-full">Section 1</span>}
            <div className={`font-mono text-xl font-bold flex items-center gap-2 ${timeLeft < 300 ? 'text-red-500 animate-pulse' : 'text-primary'}`}>
              <Clock className="w-5 h-5" />
              {formatTime(timeLeft)}
            </div>
          </div>
        </div>

        {/* Question Area */}
        <div className="flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-8 border-b pb-4">
              <span className="text-lg font-bold text-primary">Question {currentQuestionIdx + 1} of {test.totalQuestions}</span>
              {markedForReview[currentQuestion.questionNo] && (
                <span className="flex items-center text-sm font-semibold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-3 py-1 rounded-full">
                  <Star className="w-4 h-4 mr-1 fill-current" /> Marked for Review
                </span>
              )}
            </div>
            
            <div className="text-xl leading-relaxed mb-10 font-medium">
              {currentQuestion.imageUrl && (
                <div className="mb-4">
                  <img src={currentQuestion.imageUrl} alt="Question" className="max-w-full rounded-md border" />
                </div>
              )}
              {currentQuestion.questionText}
            </div>

            {currentQuestion.type === 'NUMERICAL' ? (
              <div className="mt-8 max-w-md">
                <label className="block text-sm font-semibold mb-2">Numerical Answer</label>
                <Input 
                  type="number" 
                  step="any"
                  placeholder="Enter your answer..."
                  value={responses[currentQuestion.questionNo] || ''}
                  onChange={(e) => handleNumericalInput(e.target.value)}
                  className="text-lg p-6 font-mono"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {['A', 'B', 'C', 'D'].map((opt) => (
                  <OptionCard 
                    key={opt} 
                    label={opt} 
                    optionId={opt} 
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Action Row */}
        <div className="h-20 shrink-0 border-t border-border bg-card flex items-center justify-between px-6 lg:px-12 shadow-sm z-10">
          <div className="flex gap-4">
            <Button 
              variant="outline" 
              onClick={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
              disabled={currentQuestionIdx === 0}
            >
              &larr; Previous
            </Button>
            <Button variant="ghost" onClick={handleClearResponse}>
              Clear Response
            </Button>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" className="border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-900 dark:text-purple-300 dark:hover:bg-purple-900/20" onClick={handleMarkReview}>
              <Star className="w-4 h-4 mr-2" /> Mark for Review
            </Button>
            <Button onClick={handleSaveAndNext}>
              Save & Next &rarr;
            </Button>
          </div>
        </div>
      </div>

      {/* Right Panel (Palette) */}
      <div className="w-80 shrink-0 bg-card flex flex-col border-l border-border">
        <div className="p-6 border-b border-border">
          <div className="grid grid-cols-2 gap-y-3 text-xs">
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-green-500 border border-green-600" /> Answered</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-red-400 border border-red-500" /> Not Answered</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-gray-200 dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600" /> Not Visited</div>
            <div className="flex items-center gap-2"><div className="w-4 h-4 rounded bg-purple-500 border border-purple-600" /> Marked</div>
            <div className="flex items-center gap-2 col-span-2"><div className="w-4 h-4 rounded bg-purple-300 border border-purple-400" /> Answered & Marked</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-[var(--bg-sidebar)]">
          <h3 className="font-semibold text-sm mb-4 text-muted-foreground uppercase tracking-wider">Question Palette</h3>
          <div className="grid grid-cols-5 gap-2">
            {test.questions.map((q: any, i: number) => (
              <button
                key={q.questionNo}
                onClick={() => setCurrentQuestionIdx(i)}
                className={`w-full aspect-square rounded-md text-sm font-semibold flex items-center justify-center border transition-all hover:scale-105
                  ${getPaletteColor(q.questionNo)}
                  ${currentQuestionIdx === i ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
              >
                {q.questionNo}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 border-t border-border bg-card shadow-sm z-10">
          <Button size="lg" className="w-full text-lg font-bold h-14 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowConfirmSubmit(true)}>
            Submit Test
          </Button>
        </div>
      </div>
    </div>
  )
}
