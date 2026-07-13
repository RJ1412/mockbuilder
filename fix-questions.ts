import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log("Fixing question numbers...")
  const tests = await prisma.test.findMany({
    include: { questions: { orderBy: { id: 'asc' } } }
  })

  let fixed = 0
  for (const test of tests) {
    let qNum = 1
    for (const q of test.questions) {
      if (q.questionNo !== qNum) {
        await prisma.question.update({
          where: { id: q.id },
          data: { questionNo: qNum }
        })
        fixed++
      }
      qNum++
    }
  }
  console.log(`Fixed ${fixed} questions.`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
