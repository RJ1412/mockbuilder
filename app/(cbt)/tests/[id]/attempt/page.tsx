import { createClient } from "@/lib/supabase/server"
import prisma from "@/lib/prisma"
import { notFound, redirect } from "next/navigation"
import { CBTInterface } from "@/components/test/CBTInterface"

export default async function CBTPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } })

  const test = await prisma.test.findUnique({
    where: { id: params.id, userId: dbUser?.id },
    include: {
      questions: {
        orderBy: { questionNo: 'asc' }
      }
    }
  })

  if (!test) notFound()

  // Remove correctAnswer and explanation
  const safeQuestions = test.questions.map(q => {
    const { correctAnswer, explanation, ...safeQ } = q
    return safeQ
  })

  return <CBTInterface test={{ ...test, questions: safeQuestions }} />
}
