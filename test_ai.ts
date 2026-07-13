import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
    try {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
        });
        const data = await res.json();
        console.log("Available Groq models:", data.data?.map((m: any) => m.id).join(", "));
    } catch(e) {
        console.error("Test failed:", e);
    }
}
test();
