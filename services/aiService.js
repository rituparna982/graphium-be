const axios = require('axios');
require('dotenv').config();

const BOHRIUM_API_URL = 'https://api.dp.tech/navigator/v1/chat/completions';
const BOHRIUM_API_KEY = process.env.BOHRIUM_API_KEY;

/**
 * Summarizes a research paper or article using Bohrium AI.
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

    const payload = {
      model: "gpt-3.5-turbo", // Default model for compat or specific Bohrium model if known
      messages: [
        {
          role: "system",
          content: "You are Ai, an advanced research assistant. Provide a concise, professional, and clear 3-4 sentence summary of the provided research content. Use professional academic language."
        },
        {
          role: "user",
          content: `Please summarize this: ${context}`
        }
      ],
      temperature: 0.3
    };

    const response = await axios.post(BOHRIUM_API_URL, payload, {
      headers: {
        'Authorization': BOHRIUM_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('[AI SERVICE] Summarization error:', err.response?.data || err.message);
    throw new Error('Ai was unable to summarize this post at the moment.');
  }
}

/**
 * Summarizes a PDF document (Placeholder for now since Bohrium might require a different endpoint for files).
 * Will fall back to summarizing extracted text if available.
 */
async function summarizePDF(text) {
    return summarizePost({ content: text, category: 'general' });
}

/**
 * Engages in a research conversation with the user using Bohrium AI.
 * @param {string} userMessage - The user's query.
 * @returns {Promise<string>} - The AI's conversational response.
 */
async function chatWithAi(userMessage) {
  try {
    const payload = {
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are Ai, an advanced research assistant. Your goal is to help researchers find insights, brainstorm ideas, answer doubts, and understand complex scientific concepts. Always provide high-quality, scientifically grounded answers. Keep your tone encouraging, professional, and knowledgeable."
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      temperature: 0.7
    };

    const response = await axios.post(BOHRIUM_API_URL, payload, {
      headers: {
        'Authorization': BOHRIUM_API_KEY,
        'Content-Type': 'application/json'
      }
    });

    return response.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('[AI SERVICE] Chat error:', err.response?.data || err.message);
    throw new Error('Ai is currently deep in research. Please try again in a moment.');
  }
}

module.exports = { summarizePost, summarizePDF, chatWithAi };
