export interface QuestionOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
}

export interface QuizQuestion {
  number: number;
  question: string;
  options: QuestionOption[];
}

export interface AssessmentItem {
  number: number;
  userOption: string;
  isCorrect: boolean;
  correctOption: string;
  explanation: string;
}

export interface AssessmentResult {
  score: number;
  summaryFeedback: string;
  assessments: AssessmentItem[];
}

export interface GenerateQuizResponse {
  quizId: string;
  questions: QuizQuestion[];
  message?: string;
}

/**
 * Requests the server to generate 3 MCQs from notes using Gemini API.
 * The client never receives correct answers or explanations until submission.
 */
export async function generateQuiz(notes: string): Promise<GenerateQuizResponse> {
  const response = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate quiz. Please try again.');
  }

  return data;
}

/**
 * Requests the server to assess the student's submitted answers.
 * Returns score out of 3, marks each answer, and reveals explanations.
 */
export async function assessQuiz(params: {
  quizId: string | null;
  userAnswers: Record<number, 'A' | 'B' | 'C' | 'D'>;
  clientQuestions: QuizQuestion[];
  studyNotes: string;
}): Promise<AssessmentResult> {
  const response = await fetch('/api/assess-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to assess answers.');
  }

  return data;
}
