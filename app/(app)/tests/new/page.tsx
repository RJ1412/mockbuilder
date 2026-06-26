"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { UploadCloud, CheckCircle, Loader2, Plus, Trash2 } from "lucide-react"

export default function NewTestPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isProcessing, setIsProcessing] = useState(false)
  
  // Form State
  const [questionPaperFile, setQuestionPaperFile] = useState<File | null>(null)
  const [hasAnswerKey, setHasAnswerKey] = useState(false)
  const [answerKeyFile, setAnswerKeyFile] = useState<File | null>(null)
  
  const [title, setTitle] = useState("")
  const [totalQuestions, setTotalQuestions] = useState("")
  const [durationMinutes, setDurationMinutes] = useState("")
  const [markingCorrect, setMarkingCorrect] = useState("4")
  const [markingWrong, setMarkingWrong] = useState("-1")
  
  const [useSectionalTimers, setUseSectionalTimers] = useState(false)
  const [sections, setSections] = useState([{ name: "Section 1", minutes: 30 }])

  const handleFileDrop = (e: React.DragEvent, type: "paper" | "key") => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && file.type === "application/pdf") {
      if (type === "paper") setQuestionPaperFile(file)
      else setAnswerKeyFile(file)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: "paper" | "key") => {
    const file = e.target.files?.[0]
    if (file && file.type === "application/pdf") {
      if (type === "paper") setQuestionPaperFile(file)
      else setAnswerKeyFile(file)
    }
  }

  const handleProcess = async () => {
    setIsProcessing(true)
    setStep(3)

    try {
      const formData = new FormData()
      formData.append("questionPaperFile", questionPaperFile!)
      if (hasAnswerKey && answerKeyFile) {
        formData.append("answerKeyFile", answerKeyFile)
      }
      formData.append("title", title)
      formData.append("totalQuestions", totalQuestions)
      formData.append("durationMinutes", durationMinutes)
      formData.append("markingCorrect", markingCorrect)
      formData.append("markingWrong", markingWrong)
      if (useSectionalTimers) {
        formData.append("sectionTimers", JSON.stringify(sections))
      }

      const createRes = await fetch("/api/tests/create", {
        method: "POST",
        body: formData,
      })
      
      const createContentType = createRes.headers.get("content-type")
      if (!createContentType || createContentType.indexOf("application/json") === -1) {
        throw new Error("Server returned an invalid response (possible timeout during creation). Please try again.")
      }

      const { testId, error } = await createRes.json()
      if (error) throw new Error(error)

      // Start processing
      const processRes = await fetch("/api/process-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testId }),
      })
      
      const contentType = processRes.headers.get("content-type")
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const processData = await processRes.json()
        if (processData.error) throw new Error(processData.error)
      } else {
        throw new Error("Server returned an invalid response (possible timeout). Please try again.")
      }

      router.push(`/tests/${testId}/preview`)
    } catch (err: any) {
      alert("Error: " + err.message)
      setStep(2)
      setIsProcessing(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Create New Test</h1>
        <div className="flex items-center gap-2 mt-4 text-sm font-medium">
          <div className={`flex items-center justify-center w-6 h-6 rounded-full ${step >= 1 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>1</div>
          <span className={step >= 1 ? "text-foreground" : "text-muted-foreground"}>Upload</span>
          <div className="w-12 h-px bg-border mx-2" />
          <div className={`flex items-center justify-center w-6 h-6 rounded-full ${step >= 2 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>2</div>
          <span className={step >= 2 ? "text-foreground" : "text-muted-foreground"}>Configure</span>
          <div className="w-12 h-px bg-border mx-2" />
          <div className={`flex items-center justify-center w-6 h-6 rounded-full ${step >= 3 ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>3</div>
          <span className={step >= 3 ? "text-foreground" : "text-muted-foreground"}>Processing</span>
        </div>
      </div>

      {step === 1 && (
        <Card className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader>
            <CardTitle>Upload Documents</CardTitle>
            <CardDescription>Upload your question paper and optional answer key in PDF format.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Question Paper PDF (Required)</Label>
              <div 
                className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${questionPaperFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleFileDrop(e, "paper")}
              >
                {questionPaperFile ? (
                  <div className="flex flex-col items-center gap-2 text-primary relative z-10 pointer-events-none">
                    <CheckCircle className="w-10 h-10" />
                    <span className="font-medium">{questionPaperFile.name}</span>
                    <span className="text-xs opacity-70">{(questionPaperFile.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 text-muted-foreground relative z-10 pointer-events-none">
                    <UploadCloud className="w-10 h-10 mb-2" />
                    <p className="font-medium">Drag & drop your PDF here</p>
                    <p className="text-sm">or click to browse</p>
                  </div>
                )}
                <input 
                  type="file" 
                  accept="application/pdf" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
                  onChange={(e) => handleFileChange(e, "paper")}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 border border-border p-4 rounded-lg">
              <Switch id="has-key" checked={hasAnswerKey} onCheckedChange={setHasAnswerKey} />
              <Label htmlFor="has-key" className="cursor-pointer">I have an Answer Key PDF</Label>
            </div>

            {hasAnswerKey && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label>Answer Key PDF</Label>
                <div 
                  className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${answerKeyFile ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleFileDrop(e, "key")}
                >
                  {answerKeyFile ? (
                    <div className="flex flex-col items-center gap-2 text-primary relative z-10 pointer-events-none">
                      <CheckCircle className="w-10 h-10" />
                      <span className="font-medium">{answerKeyFile.name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-muted-foreground relative z-10 pointer-events-none">
                      <UploadCloud className="w-10 h-10 mb-2" />
                      <p className="font-medium">Drag & drop your Answer Key here</p>
                    </div>
                  )}
                  <input 
                    type="file" 
                    accept="application/pdf" 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" 
                    onChange={(e) => handleFileChange(e, "key")}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep(2)} disabled={!questionPaperFile}>
                Next Step
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="animate-in fade-in slide-in-from-right-4 duration-500">
          <CardHeader>
            <CardTitle>Configure Test Settings</CardTitle>
            <CardDescription>Set the rules and marking scheme for your test.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="title">Test Title</Label>
                <Input id="title" placeholder="e.g. JEE Mains 2024 Full Mock" value={title} onChange={e => setTitle(e.target.value)} required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="total-q">Total Questions</Label>
                <Input id="total-q" type="number" placeholder="e.g. 90" value={totalQuestions} onChange={e => setTotalQuestions(e.target.value)} required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (Minutes)</Label>
                <Input id="duration" type="number" placeholder="e.g. 180" value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mark-c">Marks for Correct Answer</Label>
                <Input id="mark-c" type="number" step="0.5" value={markingCorrect} onChange={e => setMarkingCorrect(e.target.value)} required />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="mark-w">Marks for Wrong Answer (Negative)</Label>
                <Input id="mark-w" type="number" step="0.5" value={markingWrong} onChange={e => setMarkingWrong(e.target.value)} required />
              </div>
            </div>

            <div className="border border-border rounded-lg p-4 space-y-4">
              <div className="flex items-center space-x-2">
                <Switch id="use-sections" checked={useSectionalTimers} onCheckedChange={setUseSectionalTimers} />
                <Label htmlFor="use-sections" className="cursor-pointer">Enable Sectional Timers</Label>
              </div>

              {useSectionalTimers && (
                <div className="space-y-3 pt-2">
                  {sections.map((section, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <Input 
                        value={section.name} 
                        onChange={(e) => {
                          const newSec = [...sections]
                          newSec[idx].name = e.target.value
                          setSections(newSec)
                        }} 
                        placeholder="Section Name" 
                      />
                      <Input 
                        type="number" 
                        value={section.minutes} 
                        onChange={(e) => {
                          const newSec = [...sections]
                          newSec[idx].minutes = Number(e.target.value)
                          setSections(newSec)
                        }} 
                        placeholder="Minutes" 
                        className="w-32" 
                      />
                      <Button variant="ghost" size="icon" onClick={() => {
                        setSections(sections.filter((_, i) => i !== idx))
                      }} disabled={sections.length === 1}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setSections([...sections, { name: `Section ${sections.length + 1}`, minutes: 30 }])}>
                    <Plus className="w-4 h-4 mr-2" /> Add Section
                  </Button>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleProcess} disabled={!title || !totalQuestions || !durationMinutes}>
                Save & Process
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="animate-in fade-in zoom-in-95 duration-500 border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
            <Loader2 className="w-16 h-16 text-primary animate-spin mb-6" />
            <h2 className="text-2xl font-bold mb-2">Finalizing your test...</h2>
            <p className="text-muted-foreground mb-8 max-w-md">
              We are extracting questions from your PDF and mapping answers using AI. This usually takes 15-30 seconds depending on the paper size.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm text-sm text-left">
              <div className="flex items-center gap-2 text-primary">
                <CheckCircle className="w-4 h-4" /> Uploading documents... Done
              </div>
              <div className="flex items-center gap-2 text-primary">
                <Loader2 className="w-4 h-4 animate-spin" /> Extracting questions from PDF...
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <CircleIcon className="w-4 h-4" /> Mapping answers...
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function CircleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}
