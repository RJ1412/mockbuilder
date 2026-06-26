require('dotenv').config({ path: '.env.local' })
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')
const { PrismaClient } = require('@prisma/client')
const { v4: uuidv4 } = require('uuid')
require('ts-node').register()
const { customParsePDF } = require('./lib/custom-pdf-parser.ts')
require('ts-node').register()

const prisma = new PrismaClient()

async function run() {
  try {
    console.log("1. Starting test pipeline...")
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseKey) {
       throw new Error("Missing Supabase env vars in Node context. Please run with env vars.")
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    // Get a user
    const user = await prisma.user.findFirst()
    if (!user) throw new Error("No user found in DB")
    
    console.log("2. Found user:", user.email)

    const pdfBuffer = fs.readFileSync('C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf')
    
    const qpPath = `${user.supabaseId}/test_${uuidv4()}.pdf`
    
    console.log("3. Uploading to Supabase Storage...")
    const { data: qpData, error: qpError } = await supabaseAdmin.storage
      .from('question-papers')
      .upload(qpPath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false
      })

    if (qpError) throw new Error("Upload error: " + qpError.message)
    
    console.log("4. Upload successful:", qpPath)

    console.log("5. Downloading from Supabase Storage...")
    const { data: qpBlob, error: downloadError } = await supabaseAdmin.storage.from('question-papers').download(qpPath)
    if (downloadError) throw new Error("Download error: " + downloadError.message)
    
    const downloadedBuffer = Buffer.from(await qpBlob.arrayBuffer())
    console.log("6. Download successful, size:", downloadedBuffer.length)

    console.log("7. Parsing PDF...")
    const parsedQuestions = await customParsePDF(downloadedBuffer)
    console.log("8. Parsing successful! Extracted", parsedQuestions.length, "questions.")

    console.log("PIPELINE TEST PASSED SUCCESSFULLY!")
  } catch (error) {
    console.error("PIPELINE FAILED:", error)
  } finally {
    await prisma.$disconnect()
  }
}

run()
