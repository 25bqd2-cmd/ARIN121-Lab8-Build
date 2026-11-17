import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

const PLAYGROUND_SYSTEM_INSTRUCTIONS = `## Identity
You are a practice quiz assistant for university students.

## Source Constraints
Base questions, correct answers, and explanations on the study material supplied by the user. If no material is supplied, ask for it before generating a quiz.

## Quiz Generation and Presentation
Create exactly three multiple-choice questions from the supplied material. Number them 1, 2, and 3, and give each four options labelled A, B, C, and D. Check that each question has exactly one correct option supported by the material. Show all three questions together without answers, hints, or explanations. Ask the student to reply with question numbers and option labels, for example 1B, 2D, 3A. Then wait for the student's answers before assessing the quiz or revealing any solutions.

## Assessment and Feedback
Check the submitted answers against the same quiz and the supplied material. If an answer is missing or its question number is unclear, ask the student to clarify before scoring or revealing solutions. Once all three answers are clear, report a score out of three and mark each answer correct or incorrect. For each mistake, give the correct option and briefly explain why it is correct using the material. Do not generate another quiz unless the student asks for one.`;

interface QuizOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

interface StoredQuestion {
  number: number;
  question: string;
  options: QuizOption[];
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

interface StoredQuiz {
  quizId: string;
  studyNotes: string;
  questions: StoredQuestion[];
  createdAt: number;
}

// In-memory server store for active quizzes so answers and explanations stay hidden until submission
const quizStore = new Map<string, StoredQuiz>();

// Prune quizzes older than 2 hours
setInterval(() => {
  const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, quiz] of quizStore.entries()) {
    if (quiz.createdAt < twoHoursAgo) {
      quizStore.delete(id);
    }
  }
}, 30 * 60 * 1000);

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  return new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Helper to call Gemini with timeout and model fallback
async function generateQuizContent(ai: GoogleGenAI, prompt: string) {
  const schemaConfig = {
    systemInstruction: PLAYGROUND_SYSTEM_INSTRUCTIONS,
    responseMimeType: 'application/json',
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        questions: {
          type: Type.ARRAY,
          description: 'Array of exactly 3 questions',
          items: {
            type: Type.OBJECT,
            properties: {
              number: {
                type: Type.INTEGER,
                description: 'Question number (1, 2, or 3)',
              },
              question: {
                type: Type.STRING,
                description: 'The question text',
              },
              options: {
                type: Type.ARRAY,
                description: 'Four options labeled A, B, C, and D',
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: {
                      type: Type.STRING,
                      description: 'A, B, C, or D',
                    },
                    text: {
                      type: Type.STRING,
                      description: 'The option description',
                    },
                  },
                  required: ['label', 'text'],
                },
              },
              correctOption: {
                type: Type.STRING,
                description: 'The single correct option: A, B, C, or D',
              },
              explanation: {
                type: Type.STRING,
                description: 'Brief explanation of why it is correct using the material',
              },
            },
            required: ['number', 'question', 'options', 'correctOption', 'explanation'],
          },
        },
      },
      required: ['questions'],
    },
  };

  const requestWithModel = (model: string) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: schemaConfig,
    });

  const withDeadline = async <T>(promise: Promise<T>, ms = 60000): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Model request timed out after ${ms / 1000}s.`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    return await withDeadline(requestWithModel('gemini-3.8-flash'));
  } catch (err: any) {
    console.warn('gemini-3.8-flash attempt failed, falling back to gemini-3.1-flash-lite:', err?.message);
    return await withDeadline(requestWithModel('gemini-3.1-flash-lite'));
  }
}

// POST /api/generate-quiz
app.post('/api/generate-quiz', async (req, res) => {
  try {
    const { notes } = req.body;

    if (!notes || typeof notes !== 'string' || notes.trim().length === 0) {
      return res.status(400).json({
        error: 'Base questions, correct answers, and explanations on the study material supplied. Please supply study material before generating a quiz.',
      });
    }

    const trimmedNotes = notes.trim();
    if (trimmedNotes.length < 25) {
      return res.status(400).json({
        error: 'The supplied study material is too brief. Please paste more detailed notes to generate meaningful questions.',
      });
    }

    const ai = getGeminiClient();

    const prompt = `Here is the study material provided by the student:
---
${trimmedNotes}
---

Generate exactly three multiple-choice questions (1, 2, and 3) based strictly on the above study material.
Each question must have four distinct options labeled A, B, C, and D, with exactly one correct option supported by the material.
Return the answer key and explanations as private application data, not as a student-facing message. The interface will hide them until the student submits all answers. For each question, determine the single correct option label ('A', 'B', 'C', or 'D') and provide a brief explanation citing the material why it is correct.`;

    const response = await generateQuizContent(ai, prompt);

    const rawText = response.text;
    if (!rawText) {
      throw new Error('Received an empty response from Gemini.');
    }

    const parsed = JSON.parse(rawText);
    const rawList = parsed.questions;

    if (!Array.isArray(rawList) || rawList.length !== 3) {
      throw new Error('The AI model did not generate exactly 3 questions. Please try again.');
    }

    const validLabels: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

    // Strict validation and standardization
    const validatedQuestions: StoredQuestion[] = rawList.map((q: any, idx: number) => {
      const opts = Array.isArray(q.options) ? q.options : [];
      const labels = opts.map((o: any) => (typeof o?.label === 'string' ? o.label.toUpperCase() : ''));
      const rawCorrect = typeof q.correctOption === 'string' ? q.correctOption.toUpperCase() : '';

      if (
        typeof q.question !== 'string' ||
        !q.question.trim() ||
        typeof q.explanation !== 'string' ||
        !q.explanation.trim() ||
        opts.length !== 4 ||
        new Set(labels).size !== 4 ||
        !validLabels.every(l => labels.includes(l)) ||
        !opts.every((o: any) => typeof o.text === 'string' && o.text.trim()) ||
        !validLabels.includes(rawCorrect as 'A' | 'B' | 'C' | 'D')
      ) {
        // Attempt clean fallback normalization if minor mismatch
        const normalizedOpts: QuizOption[] = validLabels.map((l, i) => {
          const match = opts.find((o: any) => o?.label?.toUpperCase() === l) || opts[i];
          return {
            label: l,
            text: match && typeof match.text === 'string' ? match.text.trim() : `Option ${l}`,
          };
        });

        const safeCorrect = validLabels.includes(rawCorrect as any) ? (rawCorrect as 'A' | 'B' | 'C' | 'D') : 'A';

        return {
          number: idx + 1,
          question: q.question || `Question ${idx + 1}`,
          options: normalizedOpts,
          correctOption: safeCorrect,
          explanation: q.explanation || 'Verified strictly from the supplied study notes.',
        };
      }

      return {
        number: idx + 1,
        question: q.question.trim(),
        options: validLabels.map(label => ({
          label,
          text: opts[labels.indexOf(label)].text.trim(),
        })),
        correctOption: rawCorrect as 'A' | 'B' | 'C' | 'D',
        explanation: q.explanation.trim(),
      };
    });

    const quizId = crypto.randomUUID();
    quizStore.set(quizId, {
      quizId,
      studyNotes: trimmedNotes,
      questions: validatedQuestions,
      createdAt: Date.now(),
    });

    // Return ONLY questions and options to the client.
    // Correct answers and explanations are kept hidden on the server until the student submits!
    const clientQuestions = validatedQuestions.map(q => ({
      number: q.number,
      question: q.question,
      options: q.options,
    }));

    return res.json({
      quizId,
      questions: clientQuestions,
      message: 'Quiz generated. Select your answers for questions 1, 2, and 3, then submit.',
    });
  } catch (err: any) {
    console.error('Error generating quiz:', err);
    return res.status(500).json({
      error: err.message || 'Failed to generate quiz. Please check your study material and try again.',
    });
  }
});

// POST /api/assess-quiz
app.post('/api/assess-quiz', async (req, res) => {
  try {
    const { quizId, userAnswers, clientQuestions, studyNotes } = req.body;

    if (!userAnswers || typeof userAnswers !== 'object') {
      return res.status(400).json({
        error: 'Please provide answers before submitting.',
      });
    }

    // Verify all 3 questions are answered
    const missing: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const ans = userAnswers[i] || userAnswers[String(i)];
      if (!ans || !['A', 'B', 'C', 'D'].includes(String(ans).toUpperCase())) {
        missing.push(i);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        error: `If an answer is missing, please complete it before scoring or revealing solutions. Question ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} unanswered.`,
        missingQuestions: missing,
      });
    }

    let storedQuiz = quizId ? quizStore.get(quizId) : undefined;

    // Fallback if quiz is not in memory (e.g. server restart) using Gemini to assess
    if (!storedQuiz && clientQuestions && studyNotes) {
      const ai = getGeminiClient();
      const assessmentPrompt = `Here is the study material:
---
${studyNotes}
---

Here is the quiz given to the student:
${JSON.stringify(clientQuestions, null, 2)}

The student submitted these answers:
- Question 1: ${userAnswers[1] || userAnswers['1']}
- Question 2: ${userAnswers[2] || userAnswers['2']}
- Question 3: ${userAnswers[3] || userAnswers['3']}

Assess the submitted answers against the same quiz and the supplied material.
Report a score out of three and mark each answer correct or incorrect. For each mistake, give the correct option and briefly explain why it is correct using the material.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: assessmentPrompt,
        config: {
          systemInstruction: PLAYGROUND_SYSTEM_INSTRUCTIONS,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.INTEGER, description: 'Score out of 3' },
              summaryFeedback: { type: Type.STRING, description: 'Overall summary feedback' },
              assessments: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    number: { type: Type.INTEGER },
                    userOption: { type: Type.STRING },
                    isCorrect: { type: Type.BOOLEAN },
                    correctOption: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ['number', 'userOption', 'isCorrect', 'correctOption', 'explanation'],
                },
              },
            },
            required: ['score', 'assessments'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json(parsed);
    }

    if (!storedQuiz) {
      return res.status(404).json({
        error: 'Quiz session expired or not found. Please click Generate Quiz to start a new quiz.',
      });
    }

    // Evaluate answers against stored quiz
    let score = 0;
    const assessments = storedQuiz.questions.map(q => {
      const studentChoice = String(userAnswers[q.number] || userAnswers[String(q.number)]).toUpperCase();
      const isCorrect = studentChoice === q.correctOption;
      if (isCorrect) score++;

      return {
        number: q.number,
        userOption: studentChoice,
        isCorrect,
        correctOption: q.correctOption,
        explanation: q.explanation,
      };
    });

    let summaryFeedback = '';
    if (score === 3) {
      summaryFeedback = 'Outstanding! You answered all three questions correctly based on your study material.';
    } else if (score === 2) {
      summaryFeedback = 'Great job! You got 2 out of 3 correct. Review the explanation below for the question you missed.';
    } else if (score === 1) {
      summaryFeedback = 'Good effort! You got 1 out of 3 correct. Review the explanations below to strengthen your understanding.';
    } else {
      summaryFeedback = 'Keep practicing! Review the material and the explanations below to master these concepts.';
    }

    return res.json({
      score,
      summaryFeedback,
      assessments,
    });
  } catch (err: any) {
    console.error('Error assessing quiz:', err);
    return res.status(500).json({
      error: err.message || 'Failed to assess answers. Please try again.',
    });
  }
});

// Setup Vite middleware in dev or static files in production
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.resolve(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});
