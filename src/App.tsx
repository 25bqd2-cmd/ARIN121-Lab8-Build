import React, { useState } from 'react';
import {
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Send,
  FileText,
  ChevronRight
} from 'lucide-react';
import {
  generateQuiz,
  assessQuiz,
  QuizQuestion,
  AssessmentResult
} from './services/gemini';

const SAMPLE_NOTES = `Cellular Respiration and ATP Production

Cellular respiration is the biochemical process by which eukaryotic cells break down glucose to generate adenosine triphosphate (ATP). The overall process comprises four sequential stages:

1. Glycolysis: Takes place in the cytoplasm. One molecule of glucose (6 carbons) is converted into two molecules of pyruvate (3 carbons each). This anaerobic stage yields a net gain of 2 ATP and 2 NADH molecules.
2. Pyruvate Oxidation: Occurs in the mitochondrial matrix. Each pyruvate is converted into Acetyl-CoA, releasing carbon dioxide (CO2) and producing one NADH per pyruvate (2 NADH per glucose).
3. Citric Acid Cycle (Krebs Cycle): Occurs in the mitochondrial matrix. Acetyl-CoA combines with oxaloacetate to form citrate. For each turn (two turns per glucose), the cycle produces 2 CO2, 1 ATP (or GTP), 3 NADH, and 1 FADH2.
4. Oxidative Phosphorylation: Takes place along the inner mitochondrial membrane (cristae). Electron transport chain (ETC) complexes transfer electrons from NADH and FADH2 to molecular oxygen, which acts as the final electron acceptor to form water (H2O). Chemiosmosis driven by ATP synthase uses the proton gradient across the inner membrane to produce approximately 26 to 28 ATP molecules.

In total, aerobic cellular respiration yields approximately 30 to 32 ATP molecules per oxidized glucose molecule. When oxygen is absent, cells rely on fermentation to regenerate NAD+ from NADH.`;

export default function App() {
  const [studyNotes, setStudyNotes] = useState<string>('');
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [clientQuestions, setClientQuestions] = useState<QuizQuestion[]>([]);
  const [userAnswers, setUserAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D'>>({});
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isAssessing, setIsAssessing] = useState<boolean>(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [unansweredList, setUnansweredList] = useState<number[]>([]);
  const [assessmentResult, setAssessmentResult] = useState<AssessmentResult | null>(null);

  // Handle generating the quiz
  const handleGenerateQuiz = async () => {
    setGeneralError(null);
    setValidationWarning(null);
    setUnansweredList([]);

    if (!studyNotes.trim()) {
      setGeneralError('Base questions, correct answers, and explanations on the study material. Please supply study material before generating a quiz.');
      return;
    }

    if (studyNotes.trim().length < 25) {
      setGeneralError('Please supply a bit more study notes so the AI can craft 3 meaningful questions.');
      return;
    }

    setIsGenerating(true);
    setAssessmentResult(null);
    setUserAnswers({});
    setClientQuestions([]);
    setActiveQuizId(null);

    try {
      const data = await generateQuiz(studyNotes);
      setActiveQuizId(data.quizId);
      setClientQuestions(data.questions);

      // Smooth scroll to quiz section
      setTimeout(() => {
        document.getElementById('quiz-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error('Quiz generation error:', err);
      setGeneralError(
        err.message || 'Failed to generate quiz. Please check that study material is provided.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle student selecting an answer option (A, B, C, D)
  const handleSelectOption = (questionNumber: number, option: 'A' | 'B' | 'C' | 'D') => {
    // If results already submitted, prevent changing answers on finished quiz
    if (assessmentResult) {
      return;
    }

    setUserAnswers(prev => ({
      ...prev,
      [questionNumber]: option,
    }));

    // If this question was previously flagged as unanswered, clear it from the warning list
    if (unansweredList.includes(questionNumber)) {
      const updated = unansweredList.filter(n => n !== questionNumber);
      setUnansweredList(updated);
      if (updated.length === 0) {
        setValidationWarning(null);
      } else {
        setValidationWarning(
          `Please complete Question ${updated.join(', ')} before submitting your answers.`
        );
      }
    }
  };

  // Handle submitting answers
  const handleSubmitAnswers = async () => {
    setValidationWarning(null);
    setGeneralError(null);

    // Verify all 3 questions are answered before scoring or revealing any solutions
    const missing: number[] = [];
    [1, 2, 3].forEach(num => {
      if (!userAnswers[num]) {
        missing.push(num);
      }
    });

    if (missing.length > 0) {
      setUnansweredList(missing);
      setValidationWarning(
        `If an answer is missing, please complete it before scoring or revealing solutions. Question ${missing.join(', ')} ${
          missing.length > 1 ? 'are' : 'is'
        } unanswered.`
      );

      // Scroll to the first unanswered question
      const targetElem = document.getElementById(`question-card-${missing[0]}`);
      if (targetElem) {
        targetElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setIsAssessing(true);

    try {
      const result = await assessQuiz({
        quizId: activeQuizId,
        userAnswers,
        clientQuestions,
        studyNotes,
      });

      setAssessmentResult(result);

      setTimeout(() => {
        document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error('Assessment error:', err);
      setGeneralError(err.message || 'An error occurred during answer assessment.');
    } finally {
      setIsAssessing(false);
    }
  };

  // Retake current quiz without generating a new one
  const handleRetakeQuiz = () => {
    setUserAnswers({});
    setAssessmentResult(null);
    setValidationWarning(null);
    setUnansweredList([]);
    window.scrollTo({ top: 320, behavior: 'smooth' });
  };

  // Explicitly generate a new quiz
  const handleStartFresh = () => {
    setClientQuestions([]);
    setActiveQuizId(null);
    setUserAnswers({});
    setAssessmentResult(null);
    setValidationWarning(null);
    setUnansweredList([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const answeredCount = Object.keys(userAnswers).filter(k => [1, 2, 3].includes(Number(k))).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-tight">
                Interactive Quiz Generator
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Practice quiz assistant for university students
              </p>
            </div>
          </div>

          {clientQuestions.length > 0 && (
            <div className="flex items-center text-xs font-semibold px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
              <span>{answeredCount} of 3 Answered</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Instructions Summary */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs">
          <div className="flex items-start space-x-4">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl mt-0.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <h2 className="text-base font-semibold text-slate-900">
                Self-Test From Your Lecture Notes
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Paste your course notes or readings in the text box below and click <strong className="font-semibold text-slate-800">Generate Quiz</strong>.
                Three multiple-choice questions (1, 2, and 3) will be created with four options (A, B, C, D) supported exclusively by your material.
                Correct answers and explanations remain hidden until all three questions are answered.
              </p>
            </div>
          </div>
        </section>

        {/* Study Notes Text Box Section */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label htmlFor="study-notes" className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-indigo-600" />
              <span>Study Notes & Source Material</span>
            </label>
            <div className="flex items-center space-x-3 text-xs">
              <button
                type="button"
                onClick={() => setStudyNotes(SAMPLE_NOTES)}
                className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 transition-colors cursor-pointer"
              >
                Insert Sample Notes (Biology)
              </button>
              {studyNotes && (
                <button
                  type="button"
                  onClick={() => setStudyNotes('')}
                  className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  Clear Notes
                </button>
              )}
            </div>
          </div>

          <div className="relative">
            <textarea
              id="study-notes"
              rows={8}
              value={studyNotes}
              onChange={e => setStudyNotes(e.target.value)}
              placeholder="Paste your university notes, course slides, or readings here (e.g. definitions, mechanisms, historical events, mathematical formulas, or scientific principles)..."
              disabled={isGenerating}
              className="w-full p-4 rounded-xl border border-slate-300 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 outline-none text-sm text-slate-800 placeholder-slate-400 leading-relaxed resize-y transition-all disabled:bg-slate-100 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between items-center text-xs text-slate-400 mt-2 px-1">
              <span>{studyNotes.trim() ? `${studyNotes.trim().split(/\s+/).length} words` : 'No material pasted'}</span>
              <span>Constrained strictly to provided notes</span>
            </div>
          </div>

          {generalError && (
            <div className="flex items-start space-x-3 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-600" />
              <p className="flex-1 font-medium">{generalError}</p>
            </div>
          )}

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleGenerateQuiz}
              disabled={isGenerating || !studyNotes.trim()}
              className="inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating 3 Questions...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Quiz</span>
                </>
              )}
            </button>

            {clientQuestions.length > 0 && (
              <span className="text-xs text-slate-500 font-medium">
                Quiz active. New quizzes are generated only when you click the button.
              </span>
            )}
          </div>
        </section>

        {/* Quiz Presentation Section */}
        {clientQuestions.length > 0 && (
          <section id="quiz-section" className="space-y-6 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Practice Quiz (3 Questions)</h2>
                <p className="text-xs text-slate-500">
                  Select option A, B, C, or D. Your selections will remain visible while you work.
                </p>
              </div>
              <div className="flex items-center space-x-2 text-xs font-semibold">
                <span className="text-slate-600">Completion:</span>
                <span
                  className={`px-2.5 py-1 rounded-full ${
                    answeredCount === 3
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {answeredCount} / 3 Completed
                </span>
              </div>
            </div>

            {/* Incomplete Warning Message if submitted prematurely */}
            {validationWarning && (
              <div className="flex items-start space-x-3 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-sm shadow-xs">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-amber-950">Incomplete Quiz Submission</p>
                  <p className="text-amber-800 text-xs mt-0.5">{validationWarning}</p>
                </div>
              </div>
            )}

            {/* Display All 3 Questions */}
            <div className="space-y-6">
              {clientQuestions.map((q) => {
                const currentAnswer = userAnswers[q.number];
                const isMissing = unansweredList.includes(q.number);
                const assessment = assessmentResult?.assessments.find(a => a.number === q.number);

                return (
                  <div
                    key={q.number}
                    id={`question-card-${q.number}`}
                    className={`bg-white rounded-2xl p-6 border transition-all duration-200 ${
                      isMissing
                        ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm'
                        : assessment
                        ? assessment.isCorrect
                          ? 'border-emerald-300 bg-emerald-50/20 shadow-xs'
                          : 'border-rose-300 bg-rose-50/20 shadow-xs'
                        : 'border-slate-200/90 shadow-xs'
                    }`}
                  >
                    {/* Question Header */}
                    <div className="flex items-start space-x-3 mb-4">
                      <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-100 text-slate-800 font-bold text-sm flex items-center justify-center border border-slate-200">
                        {q.number}
                      </span>
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-slate-900 leading-snug">
                          {q.question}
                        </h3>
                      </div>

                      {/* Post-submission badge */}
                      {assessment && (
                        <div className="flex-shrink-0">
                          {assessment.isCorrect ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Correct</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Incorrect</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Radio Options A, B, C, D */}
                    <div className="space-y-2.5 pl-0 sm:pl-11">
                      {q.options.map((opt) => {
                        const isSelected = currentAnswer === opt.label;
                        const isCorrectOption = assessment?.correctOption === opt.label;
                        const isUserMistake = assessment && !assessment.isCorrect && isSelected;

                        let optionStyle = 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60';
                        if (isSelected && !assessment) {
                          optionStyle = 'border-indigo-600 bg-indigo-50/70 text-indigo-950 ring-2 ring-indigo-200 font-medium';
                        } else if (assessment) {
                          if (isCorrectOption) {
                            optionStyle = 'border-emerald-500 bg-emerald-50/90 text-emerald-950 font-medium ring-2 ring-emerald-200';
                          } else if (isUserMistake) {
                            optionStyle = 'border-rose-400 bg-rose-50 text-rose-950 font-medium';
                          } else {
                            optionStyle = 'border-slate-200 opacity-60 bg-slate-50';
                          }
                        }

                        return (
                          <label
                            key={opt.label}
                            className={`flex items-start space-x-3.5 p-3.5 rounded-xl border transition-all cursor-pointer select-none ${optionStyle}`}
                          >
                            <input
                              type="radio"
                              name={`question-${q.number}`}
                              value={opt.label}
                              checked={isSelected}
                              onChange={() => handleSelectOption(q.number, opt.label)}
                              disabled={Boolean(assessmentResult)}
                              className="mt-0.5 h-4 w-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:cursor-default"
                            />
                            <div className="flex-1 flex items-start space-x-2">
                              <span className="font-bold text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                                {opt.label}
                              </span>
                              <span className="text-sm leading-relaxed text-slate-800">
                                {opt.text}
                              </span>
                            </div>

                            {/* Option badges post-submission */}
                            {assessment && isCorrectOption && (
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                                Correct Option
                              </span>
                            )}
                            {assessment && isUserMistake && (
                              <span className="text-xs font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                                Your Selection
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>

                    {/* Explanations & feedback (Hidden until student submits all answers) */}
                    {assessment && (
                      <div className="mt-4 sm:ml-11 pt-4 border-t border-slate-100 space-y-2">
                        <div
                          className={`p-4 rounded-xl text-xs sm:text-sm leading-relaxed ${
                            assessment.isCorrect
                              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                              : 'bg-rose-50 text-rose-950 border border-rose-200'
                          }`}
                        >
                          <div className="flex items-center space-x-2 font-bold mb-1">
                            {assessment.isCorrect ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Correct!</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-4 h-4 text-rose-600" />
                                <span>
                                  Incorrect: You answered ({assessment.userOption}). The correct option is ({assessment.correctOption}).
                                </span>
                              </>
                            )}
                          </div>
                          <p className="mt-1 text-slate-700">
                            <span className="font-semibold text-slate-800">Explanation: </span>
                            {assessment.explanation}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Submit Answers Button Section */}
            {!assessmentResult ? (
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Ready to Submit?</h4>
                  <p className="text-xs text-slate-500">
                    Submit all 3 answers to calculate your score and reveal correct options and explanations.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSubmitAnswers}
                  disabled={isAssessing}
                  className="inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isAssessing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Checking Answers...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>Submit Answers</span>
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </section>
        )}

        {/* Assessment Results Section (Shown only after submission) */}
        {assessmentResult && (
          <section id="results-section" className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
              <div className="flex items-center space-x-4">
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-2xl ${
                    assessmentResult.score === 3
                      ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-300'
                      : assessmentResult.score === 2
                      ? 'bg-indigo-100 text-indigo-800 border-2 border-indigo-300'
                      : 'bg-amber-100 text-amber-900 border-2 border-amber-300'
                  }`}
                >
                  {assessmentResult.score}/3
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-lg font-bold text-slate-900">Assessment & Feedback</h3>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                      Score: {assessmentResult.score} out of 3
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1 leading-snug">
                    {assessmentResult.summaryFeedback}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Another quiz is NEVER generated automatically */}
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleRetakeQuiz}
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
                <button
                  type="button"
                  onClick={handleStartFresh}
                  className="inline-flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>New Quiz With Other Notes</span>
                </button>
              </div>
            </div>

            {/* Question by question assessment cards */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Detailed Feedback per Question
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {assessmentResult.assessments.map(item => (
                  <div
                    key={item.number}
                    className={`p-3.5 rounded-xl border ${
                      item.isCorrect
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : 'border-rose-200 bg-rose-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-xs text-slate-700">Question {item.number}</span>
                      {item.isCorrect ? (
                        <span className="inline-flex items-center text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-bold text-rose-700">
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          Incorrect
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600">
                      Your answer: <span className="font-bold text-slate-800">{item.userOption}</span>
                    </p>
                    {!item.isCorrect ? (
                      <p className="text-xs text-emerald-800 mt-0.5">
                        Correct: <span className="font-bold">{item.correctOption}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-emerald-700 mt-0.5 font-medium">
                        Supported by material
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <p>Interactive Quiz Generator • Built for university students to test comprehension of course material.</p>
        <p className="mt-1 text-slate-400">Powered by Gemini with strict source-constrained generation and evaluation</p>
      </footer>
    </div>
  );
}
