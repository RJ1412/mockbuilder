import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Clock, FileText, Settings2, AlertTriangle, ArrowLeft } from "lucide-react"
import { ProcessingStatus } from "@/components/test/ProcessingStatus"

export default async function TestPreviewPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } })
  
  const test = await prisma.test.findUnique({
    where: { id: params.id, userId: dbUser?.id }
  })

  if (!test) notFound()

  if (test.status === "PROCESSING") {
    // We assume it's READY by the time user gets here, but just in case
    return <ProcessingStatus testId={test.id} />
  }

  const sections = test.sectionTimers as any[] | null

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Button variant="ghost" className="mb-6" asChild>
        <Link href="/dashboard"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard</Link>
      </Button>

      <Card className="shadow-lg border-primary/20">
        <CardHeader className="bg-primary/5 pb-8 border-b">
          <CardTitle className="text-2xl">{test.title}</CardTitle>
          <CardDescription>Review the details before starting</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Questions</p>
                <p className="font-semibold">{test.totalQuestions}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Duration</p>
                <p className="font-semibold">{test.durationMinutes} mins</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg">
                <Settings2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Marking Scheme</p>
                <p className="font-semibold">+{test.markingCorrect} / {test.markingWrong}</p>
              </div>
            </div>
          </div>

          {sections && sections.length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/50">
              <h4 className="font-medium mb-3 text-sm uppercase text-muted-foreground tracking-wider">Sections</h4>
              <div className="space-y-2">
                {sections.map((sec, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span>{sec.name}</span>
                    <span className="font-medium">{sec.minutes} mins</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4 flex gap-3 text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold mb-1">Important Instructions</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Once started, the timer cannot be paused.</li>
                <li>Ensure you have a stable internet connection.</li>
                <li>Do not switch tabs. Tab switches are recorded.</li>
              </ul>
            </div>
          </div>

        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
          <Button variant="outline" className="w-full sm:w-auto" asChild>
            <a href={test.questionPaperUrl} target="_blank" rel="noreferrer">
              Preview PDF
            </a>
          </Button>
          <Button size="lg" className="w-full sm:flex-1" asChild>
            <Link href={`/tests/${test.id}/attempt`}>
              Start Test Now
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
