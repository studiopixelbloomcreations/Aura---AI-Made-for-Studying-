const functions = require('firebase-functions/v1');
const {defineSecret} = require('firebase-functions/params');
const axios = require('axios');

// CORS middleware
const cors = require('cors')({origin: true});

// Secrets (set in Firebase Secret Manager via CLI)
const GROQ_API_KEY = defineSecret('GROQ_API_KEY');
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const ELEVENLABS_API_KEY = defineSecret('ELEVENLABS_API_KEY');

// Health check endpoint
exports.health = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });
});

// Main AI chat endpoint
exports.ask = functions.runWith({secrets: [GROQ_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY]}).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { subject, language, student_question, title, email } = req.body;

      // Call Groq API
      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are 'Aevra AI' - a real, warm Grade 9 teacher in Sri Lanka. Your teaching must be strictly aligned to the official 2024 Sri Lankan Grade 9 print textbooks. Speak in ${language}.`
          },
          {
            role: 'user',
            content: `Subject: ${subject}\nStudent question: ${student_question}`
          }
        ],
        temperature: 0.45
      }, {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY.value()}`,
          'Content-Type': 'application/json'
        }
      });

      const answer = response.data.choices[0].message.content;
      res.json({ answer, off_syllabus: false });

    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: 'AI request failed' });
    }
  });
});

// Title generation endpoint
exports.generate_title = functions.runWith({secrets: [GROQ_API_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY]}).https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { question } = req.body;

      const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        messages: [{
          role: 'user',
          content: `Generate a short, clear topic title (2-5 words) for this Grade 9 student question: "${question}". Return ONLY the title, no punctuation or quotes.`
        }],
        temperature: 0.5
      }, {
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY.value()}`,
          'Content-Type': 'application/json'
        }
      });

      const title = response.data.choices[0].message.content.trim();
      res.json({ title });

    } catch (error) {
      console.error('Error:', error);
      res.json({ title: 'General Help' });
    }
  });
});
