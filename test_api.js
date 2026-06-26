const fs = require('fs');

async function testApi() {
  try {
    const filePath = 'C:/Users/rahul/OneDrive/Documents/Question_Report_130.pdf';
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', blob, 'Question_Report_130.pdf');

    console.log("Sending request to http://localhost:3000/api/process-test ...");
    
    const response = await fetch('http://localhost:3000/api/process-test', {
      method: 'POST',
      body: formData,
    });
    
    const text = await response.text();
    console.log("Status:", response.status);
    console.log("Response:", text.substring(0, 500) + (text.length > 500 ? "..." : ""));
  } catch (err) {
    console.error("Error:", err);
  }
}

testApi();
