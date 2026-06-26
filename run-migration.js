require('dotenv').config({ path: '.env.local' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    console.log('Connecting to database...');
    
    try {
      console.log('Creating ENUM QuestionType...');
      await prisma.$executeRawUnsafe(`CREATE TYPE "QuestionType" AS ENUM ('MCQ', 'NUMERICAL');`);
      console.log('ENUM created successfully.');
    } catch (e) {
      console.log('ENUM might already exist:', e.message);
    }

    console.log('Adding type column to Question table...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Question" ADD COLUMN "type" "QuestionType" NOT NULL DEFAULT 'MCQ';`);
    console.log('Column added successfully!');

  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
