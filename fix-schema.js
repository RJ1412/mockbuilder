require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log('Connecting to database over port 6543 to fix schema...');
  
  const columnsToAdd = [
    { table: 'Question', query: 'ALTER TABLE "Question" ADD COLUMN "imageUrl" TEXT;' },
    { table: 'Question', query: 'ALTER TABLE "Question" ADD COLUMN "explanation" TEXT;' },
    { table: 'Question', query: 'ALTER TABLE "Question" ADD COLUMN "topic" TEXT;' },
    { table: 'Test', query: 'ALTER TABLE "Test" ADD COLUMN "hasAnswerKey" BOOLEAN NOT NULL DEFAULT false;' },
    { table: 'Test', query: 'ALTER TABLE "Test" ADD COLUMN "sectionTimers" JSONB;' },
    { table: 'TestAttempt', query: 'ALTER TABLE "TestAttempt" ADD COLUMN "tabSwitchCount" INTEGER NOT NULL DEFAULT 0;' },
    { table: 'TestAttempt', query: 'ALTER TABLE "TestAttempt" ADD COLUMN "aiSuggestions" TEXT;' },
  ];

  for (const col of columnsToAdd) {
    try {
      console.log(`Executing: ${col.query}`);
      await prisma.$executeRawUnsafe(col.query);
      console.log(`Success!`);
    } catch (e) {
      console.log(`Skipped (probably already exists): ${e.message}`);
    }
  }

  console.log('Finished fixing schema!');
  await prisma.$disconnect();
}

run();
