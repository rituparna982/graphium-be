const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// Mock data for development when SERPAPI_KEY is missing
const MOCK_RESULTS = {
  search: {
    organic_results: [
      {
        title: "Neural Networks for Quantum Chemistry",
        link: "https://nature.com/articles/s41567-025-xxxx",
        snippet: "Simulating molecular dynamics on Noisy Intermediate-Scale Quantum (NISQ) hardware...",
        publication_info: { summary: "Nature Physics, 2025" }
      },
      {
        title: "Hybrid Quantum-Classical Algorithms",
        link: "https://science.org/doi/10.1126/science.abc1234",
        snippet: "A review of variational eigensolvers and their applications in chemistry.",
        publication_info: { summary: "Science, 2024" }
      }
    ]
  },
  author: {
    author: {
      name: "Dr. Sarah Chen",
      affiliations: "MIT, Quantum Chemistry Lab",
      stats: { h_index: 34, citations: 4192, interest: 85 }
    },
    publications: [
      { title: "Quantum Variational Solvers", journal: "Nature", year: 2025, total_citations: 248 },
      { title: "Topological Phase Transitions", journal: "Physical Review B", year: 2023, total_citations: 156 }
    ]
  }
};

const BASE_URL = 'https://serpapi.com/search.json';

/**
 * @route   GET /api/scholar/search
 */
router.get('/search', authMiddleware, async (req, res, next) => {
  const { q } = req.query;
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    console.warn('SERPAPI_KEY missing - returning realistic mock search results');
    // More realistic academic journals and publishers
    const journals = ["Nature", "Science", "IEEE Access", "Elsevier: The Lancet", "Cell", "Journal of AI Research", "Physical Review Letters"];
    const publishers = ["Springer", "Wiley", "Taylor & Francis", "Oxford University Press", "MIT Press"];
    
    const dynamicResults = {
      is_mock: true,
      organic_results: [
        {
          title: `${q.charAt(0).toUpperCase() + q.slice(1)}: A Comprehensive Review of Current Trends`,
          link: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`,
          snippet: `This paper explores the fundamental principles of ${q}, focusing on recent breakthroughs in multi-scale modeling and its integration with specialized frameworks. We provide a detailed analysis of ${q} performance across various benchmark environments...`,
          publication_info: { summary: `${journals[Math.floor(Math.random() * journals.length)]}, 2025` }
        },
        {
          title: `Innovative Approaches to ${q} Optimization in Large-Scale Systems`,
          link: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`,
          snippet: `Research conducted at the Global Technology Institute shows that ${q} can be significantly improved by implementing adaptive algorithms. Our results indicate a 15% increase in efficiency when ${q} is applied to...`,
          publication_info: { summary: `${journals[Math.floor(Math.random() * journals.length)]}, 2024` }
        },
        {
          title: `Emerging Paradoxes in ${q} Theory and Practice`,
          link: `https://scholar.google.com/scholar?q=${encodeURIComponent(q)}`,
          snippet: `A critical examination of the theoretical foundations of ${q}. We identify key barriers to entry and propose a roadmap for the next decade of ${q} research, emphasizing collaborative frameworks between ${publishers[Math.floor(Math.random() * publishers.length)]} and academic labs...`,
          publication_info: { summary: `${publishers[Math.floor(Math.random() * publishers.length)]} Publishing, 2023` }
        }
      ]
    };
    return res.json(dynamicResults);
  }

  try {
    const url = new URL(BASE_URL);
    url.searchParams.append('engine', 'google_scholar');
    url.searchParams.append('q', q);
    url.searchParams.append('api_key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/scholar/author/:id
 */
router.get('/author/:id', authMiddleware, async (req, res, next) => {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    console.warn('SERPAPI_KEY missing - returning dynamic mock author results');
    const id = req.params.id || "Unknown";
    return res.json({
      author: {
        name: id.length > 5 ? id : "Dr. Alex Researcher",
        affiliations: "Global Research Institute",
        thumbnail: `https://ui-avatars.com/api/?name=${id}&background=random`,
        stats: { h_index: 42, citations: 8520, interest: 92 }
      },
      publications: [
        { title: "Advanced Methods in Modern Science", journal: "Nature", year: 2025, total_citations: 450 },
        { title: "Technical Review of Emergent Technologies", journal: "Science", year: 2024, total_citations: 320 }
      ]
    });
  }

  try {
    const url = new URL(BASE_URL);
    url.searchParams.append('engine', 'google_scholar_author');
    url.searchParams.append('author_id', req.params.id);
    url.searchParams.append('api_key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/scholar/cite/:id
 */
router.get('/cite/:id', authMiddleware, async (req, res, next) => {
  const apiKey = process.env.SERPAPI_KEY;

  if (!apiKey) {
    return res.json({ citations: [{ title: 'BibTeX', snippet: '@article{chen2025, ...}' }] });
  }

  try {
    const url = new URL(BASE_URL);
    url.searchParams.append('engine', 'google_scholar_cite');
    url.searchParams.append('q', req.params.id);
    url.searchParams.append('api_key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
