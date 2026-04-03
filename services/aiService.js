const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Summarizes a research paper or article.
 * @param {Object} post - The post object containing paper/article details.
 * @returns {Promise<string>} - The generated summary.
 */
async function summarizePost(post) {
  try {
    let context = "";
    
    if (post.category === 'paper' && post.paper) {
      context = `Title: ${post.paper.title}\nJournal: ${post.paper.journal}\nAbstract: ${post.paper.abstract || post.content}`;
    } else if (post.category === 'article' && post.article) {
      context = `Title: ${post.article.title}\nContent: ${post.content}`;
    } else {
      context = post.content;
    }

    const prompt = `You are an expert research assistant. Please provide a concise, professional, and clear 3-4 sentence summary of the following research content. Focus on the core objective and the most important findings. Use professional academic language.
    
    CONTENT:
    ${context}
    
    SUMMARY:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (err) {
    console.error('[AI SERVICE] Summarization error:', err.message);
    throw new Error('AI was unable to summarize this post at the moment.');
  }
}

/**
 * Summarizes a PDF document directly.
 * @param {string} base64Data - The base64 data of the PDF.
 * @returns {Promise<string>} - The generated summary.
 */
async function summarizePDF(base64Data) {
  try {
    // Remove data:application/pdf;base64, prefix if present
    const cleanBase64 = base64Data.split('base64,')[1] || base64Data;

    const prompt = `You are an elite research analyst. Please analyze this research paper (PDF) and provide a professional, highly structured response in strictly VALID JSON format. 
    
    Fields required:
    - title: (string) The full title of the paper
    - journal: (string) The journal name (if available) or "Research Discovery"
    - summary: (string) 4-5 sentence professional abstract focusing on core insights
    - methodology: (string) 2-3 sentences on research methods
    - results: (string) 2-3 sentences on key findings
    
    ONLY return the JSON object, do not include any other text.`;

    const result = await model.generateContent([
      {
        inlineData: {
          data: cleanBase64,
          mimeType: "application/pdf"
        }
      },
      prompt,
    ]);

    const response = await result.response;
    let text = response.text().trim();
    // Clean potential markdown code blocks if AI includes them
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      console.error('[AI SERVICE] JSON Parse Error:', parseErr.message, text);
      return { 
        title: "Unknown Research Paper", 
        summary: text, 
        journal: "Research Discovery" 
      };
    }
  } catch (err) {
    console.error('[AI SERVICE] PDF Summarization error:', err.message);
    throw new Error('AI failed to process this PDF. Please ensure it is a valid research document.');
  }
}

/**
 * Engages in a research conversation with the user.
 * @param {string} userMessage - The user's query.
 * @returns {Promise<string>} - The AI's conversational response.
 */
async function chatWithAi(userMessage) {
  try {
    const prompt = `You are Graphium AI, an advanced research assistant. Your goal is to help researchers find insights, brainstorm ideas, and understand complex scientific concepts. 
    Always provide high-quality, scientifically grounded answers. Keep your tone encouraging, professional, and knowledgeable.
    
    USER QUERY: ${userMessage}
    
    RESPONSE:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (err) {
    console.error('[AI SERVICE] Chat error:', err.message);
    throw new Error('Graphium AI is currently deep in research. Please try again in a moment.');
  }
}

module.exports = { summarizePost, summarizePDF, chatWithAi };
