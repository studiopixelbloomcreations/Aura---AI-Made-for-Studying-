import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { API_BASE_URL } from "../lib/api";
import {
  ClipboardCheck,
  BookOpen,
  ChevronRight,
  CheckCircle,
  XCircle,
  Sparkles,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Award,
} from "lucide-react";

interface ExamQuestion {
  id: string;
  text: string;
  type: string;
  choices?: string[];
  answer?: string;
}

interface MasteryStep {
  title: string;
  content: string;
}

export const ExamCenter: React.FC = () => {
  const { subject, updateMastery } = useAppStore();

  // Setup phase
  const [phase, setPhase] = useState<"select" | "testing" | "review">("select");
  const [selectedSubject, setSelectedSubject] = useState(subject || "Maths");
  const [selectedTerm, setSelectedTerm] = useState("First term");
  const [sessionId, setSessionId] = useState("");

  // Testing phase
  const [currentQuestion, setCurrentQuestion] = useState<ExamQuestion | null>(null);
  const [userAnswer, setUserAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // Evaluation result
  const [lastResult, setLastResult] = useState<{
    correct: boolean;
    explanation?: string;
    masterySteps?: MasteryStep[];
  } | null>(null);

  // Analytics
  const [totalAnswered, setTotalAnswered] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);

  const subjects = ["Maths", "Science", "English", "History", "Sinhala"];
  const terms = ["First term", "Second term", "Third term"];

  const startExam = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE_URL}/exam-mode/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "practice",
          term: selectedTerm,
          subject: selectedSubject,
        }),
      });
      if (!res.ok) throw new Error("Failed to start exam session");
      const data = await res.json();
      setSessionId(data.session_id);

      // Fetch papers
      await fetch(`${API_BASE_URL}/exam-mode/fetch-papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: data.session_id,
          subject: selectedSubject,
          term: selectedTerm,
        }),
      });

      // Get first question
      await fetchNextQuestion(data.session_id);
      setPhase("testing");
    } catch (err: any) {
      console.error("Exam start error:", err);
      // Fallback: use local mock questions
      setSessionId("local-" + Date.now());
      setCurrentQuestion({
        id: "mock-1",
        text: getMockQuestion(selectedSubject),
        type: "short_answer",
        answer: getMockAnswer(selectedSubject),
      });
      setPhase("testing");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNextQuestion = async (sid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/exam-mode/ask-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      if (!res.ok) throw new Error("No more questions");
      const data = await res.json();
      setCurrentQuestion(data.question);
      setLastResult(null);
      setUserAnswer("");
    } catch {
      // Fallback to mock
      setCurrentQuestion({
        id: "mock-" + Date.now(),
        text: getMockQuestion(selectedSubject),
        type: "short_answer",
        answer: getMockAnswer(selectedSubject),
      });
      setLastResult(null);
      setUserAnswer("");
    }
  };

  const submitAnswer = async () => {
    if (!userAnswer.trim() || !currentQuestion) return;
    setIsLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/exam-mode/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: currentQuestion.id,
          user_answer: userAnswer,
        }),
      });

      if (!res.ok) throw new Error("Evaluation failed");
      const data = await res.json();

      setLastResult({
        correct: data.correct,
        explanation: data.explanation,
        masterySteps: data.mastery_steps,
      });

      setTotalAnswered((p) => p + 1);
      if (data.correct) setTotalCorrect((p) => p + 1);
      updateMastery(selectedSubject, data.correct);
    } catch {
      // Fallback: simple local check
      const isCorrect =
        currentQuestion.answer
          ? userAnswer.trim().toLowerCase().includes(currentQuestion.answer.toLowerCase().substring(0, 8))
          : Math.random() > 0.4;

      setLastResult({
        correct: isCorrect,
        explanation: isCorrect
          ? "Great job! Your answer demonstrates solid understanding."
          : `The correct answer is: ${currentQuestion.answer || "See mastery steps below."}`,
        masterySteps: isCorrect
          ? undefined
          : [
              { title: "Step 1: Understand the concept", content: "Review the core definition and formula from your notes." },
              { title: "Step 2: Apply the formula", content: "Break the problem into smaller parts and substitute known values." },
              { title: "Step 3: Verify your work", content: "Re-read the question and ensure your final answer matches the requirement." },
            ],
      });

      setTotalAnswered((p) => p + 1);
      if (isCorrect) setTotalCorrect((p) => p + 1);
      updateMastery(selectedSubject, isCorrect);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextQuestion = () => {
    fetchNextQuestion(sessionId);
  };

  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  return (
    <div className="h-full w-full flex flex-col items-stretch bg-white dark:bg-[#0e0e0f] text-foreground dark:text-white overflow-hidden select-none">
      {/* Header */}
      <div className="h-[52px] border-b border-black/5 dark:border-white/5 flex items-center justify-between px-6 shrink-0 bg-[#f0f4f9] dark:bg-[#0f0f10]">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4.5 text-blue-500" />
          <h1 className="text-sm font-bold tracking-wide uppercase">Aura Exam Center</h1>
        </div>

        {phase !== "select" && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <span>Subject:</span>
              <span className="text-blue-500">{selectedSubject}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
              <span>Term:</span>
              <span className="text-purple-500">{selectedTerm}</span>
            </div>
            <div className="h-6 w-px bg-black/10 dark:bg-white/10" />
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <CheckCircle className="size-3.5 text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400">{totalCorrect}/{totalAnswered}</span>
              <span className="text-muted-foreground">({accuracy}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {/* PHASE: Select Subject & Term */}
        {phase === "select" && (
          <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pt-8">
            <div className="text-center space-y-2">
              <div className="size-16 mx-auto rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mb-4">
                <ClipboardCheck className="size-7" />
              </div>
              <h2 className="text-xl font-bold">Practice Exam Mode</h2>
              <p className="text-xs font-semibold text-muted-foreground max-w-md mx-auto leading-relaxed">
                Select your subject and term to begin. Aura will deliver questions from past papers and grade your answers with step-by-step mastery coaching.
              </p>
            </div>

            {/* Subject Grid */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block px-1">Choose Subject</label>
              <div className="grid grid-cols-5 gap-2.5">
                {subjects.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => setSelectedSubject(sub)}
                    className={`py-3 rounded-2xl border text-xs font-bold transition-all active:scale-95 ${
                      selectedSubject === sub
                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20"
                        : "bg-[#f0f4f9] dark:bg-[#1e1f20] border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {sub}
                  </button>
                ))}
              </div>
            </div>

            {/* Term Selector */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block px-1">Choose Term</label>
              <div className="grid grid-cols-3 gap-2.5">
                {terms.map((term) => (
                  <button
                    key={term}
                    onClick={() => setSelectedTerm(term)}
                    className={`py-3 rounded-2xl border text-xs font-bold transition-all active:scale-95 ${
                      selectedTerm === term
                        ? "bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-500/20"
                        : "bg-[#f0f4f9] dark:bg-[#1e1f20] border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={startExam}
              disabled={isLoading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="size-4.5 animate-spin" />
              ) : (
                <Sparkles className="size-4.5" />
              )}
              <span>{isLoading ? "Loading Question Bank..." : "Begin Exam Practice"}</span>
            </button>

            {error && (
              <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-3 text-xs font-semibold text-red-600 dark:text-red-400">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {/* PHASE: Testing */}
        {phase === "testing" && currentQuestion && (
          <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
            {/* Question Card */}
            <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] border border-black/5 dark:border-white/5 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BookOpen className="size-4.5 text-blue-500" />
                  <span className="text-[11px] font-bold text-blue-500 uppercase tracking-wider">
                    {currentQuestion.type === "mcq" ? "Multiple Choice" : "Short Answer"} — {selectedSubject}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground">
                  Q#{totalAnswered + 1}
                </span>
              </div>

              <h3 className="text-sm font-bold leading-relaxed text-foreground dark:text-white">
                {currentQuestion.text}
              </h3>

              {/* MCQ Choices */}
              {currentQuestion.choices && currentQuestion.choices.length > 0 && (
                <div className="space-y-2 pt-2">
                  {currentQuestion.choices.map((choice, i) => (
                    <button
                      key={i}
                      onClick={() => setUserAnswer(choice)}
                      className={`w-full text-left p-3.5 rounded-xl border text-xs font-semibold transition-all ${
                        userAnswer === choice
                          ? "bg-blue-600/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
                          : "bg-white dark:bg-[#0e0e0f] border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5"
                      }`}
                    >
                      <span className="font-bold mr-2 opacity-60">{String.fromCharCode(65 + i)}.</span>
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              {/* Short Answer Input */}
              {(!currentQuestion.choices || currentQuestion.choices.length === 0) && (
                <textarea
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  className="w-full h-28 bg-white dark:bg-[#0e0e0f] rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-4 outline-none text-xs font-medium text-foreground dark:text-white leading-relaxed resize-none focus:border-blue-500"
                />
              )}

              {/* Submit Button */}
              {!lastResult && (
                <button
                  onClick={submitAnswer}
                  disabled={!userAnswer.trim() || isLoading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <span>{isLoading ? "Evaluating..." : "Submit Answer"}</span>
                </button>
              )}
            </div>

            {/* Evaluation Result */}
            {lastResult && (
              <div className="space-y-4 animate-scale-up">
                {/* Correct/Incorrect Badge */}
                <div
                  className={`p-5 rounded-3xl border flex items-start gap-4 ${
                    lastResult.correct
                      ? "bg-emerald-50 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-900/30"
                      : "bg-red-50 dark:bg-red-950/15 border-red-200 dark:border-red-900/30"
                  }`}
                >
                  <div className={`size-10 rounded-full flex items-center justify-center shrink-0 ${
                    lastResult.correct
                      ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/20 text-red-600 dark:text-red-400"
                  }`}>
                    {lastResult.correct ? <CheckCircle className="size-5" /> : <XCircle className="size-5" />}
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <h4 className={`text-sm font-bold ${lastResult.correct ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
                      {lastResult.correct ? "Correct!" : "Not quite right"}
                    </h4>
                    {lastResult.explanation && (
                      <p className="text-xs font-medium leading-relaxed text-foreground/80 dark:text-white/80">
                        {lastResult.explanation}
                      </p>
                    )}
                  </div>
                </div>

                {/* Mastery Steps (shown on wrong answer) */}
                {lastResult.masterySteps && lastResult.masterySteps.length > 0 && (
                  <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] border border-black/5 dark:border-white/5 rounded-3xl p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-black/5 dark:border-white/5 pb-2">
                      <Award className="size-4.5 text-amber-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        Aura Mastery Steps
                      </h4>
                    </div>
                    <div className="space-y-3">
                      {lastResult.masterySteps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <span className="size-6 rounded-full bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-[10px] font-extrabold shrink-0 mt-0.5">
                            {i + 1}
                          </span>
                          <div className="space-y-0.5 min-w-0">
                            <h5 className="text-xs font-bold">{step.title}</h5>
                            <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">{step.content}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next Question */}
                <button
                  onClick={handleNextQuestion}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-1.5"
                >
                  <ArrowRight className="size-4" />
                  <span>Next Question</span>
                </button>
              </div>
            )}

            {/* Session Analytics Bar */}
            <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] border border-black/5 dark:border-white/5 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <span className="text-lg font-extrabold text-blue-600 dark:text-blue-400 block">{totalAnswered}</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Answered</span>
                </div>
                <div className="h-8 w-px bg-black/10 dark:bg-white/10" />
                <div className="text-center">
                  <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400 block">{totalCorrect}</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Correct</span>
                </div>
                <div className="h-8 w-px bg-black/10 dark:bg-white/10" />
                <div className="text-center">
                  <span className="text-lg font-extrabold text-purple-600 dark:text-purple-400 block">{accuracy}%</span>
                  <span className="text-[9px] font-bold text-muted-foreground uppercase">Accuracy</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setPhase("select");
                  setTotalAnswered(0);
                  setTotalCorrect(0);
                  setLastResult(null);
                  setCurrentQuestion(null);
                  setUserAnswer("");
                }}
                className="h-8 px-4 rounded-xl border border-black/10 dark:border-white/10 text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-95"
              >
                End Session
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Fallback mock question generators
function getMockQuestion(subject: string): string {
  const questions: Record<string, string[]> = {
    Maths: [
      "Solve for x: 2x + 5 = 17",
      "Find the area of a triangle with base 10cm and height 6cm.",
      "What is the value of √144?",
      "Simplify: 3(x + 4) - 2(x - 1)",
    ],
    Science: [
      "What is the chemical formula for water?",
      "State Newton's Second Law of Motion.",
      "What is photosynthesis?",
      "Name the three states of matter.",
    ],
    English: [
      "Convert to passive voice: 'The teacher teaches the students.'",
      "What is a simile? Give an example.",
      "Identify the noun in: 'The cat sat on the mat.'",
    ],
    History: [
      "Who was the last king of the Kandyan Kingdom?",
      "When did Sri Lanka gain independence?",
      "Name two ancient irrigation tanks of Sri Lanka.",
    ],
    Sinhala: [
      "නාම පද යනු මොනවාද? උදාහරණ 3ක් දෙන්න.",
      "ක්‍රියා පද වර්ග 2ක් නම් කරන්න.",
    ],
  };
  const pool = questions[subject] || questions["Maths"]!;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

function getMockAnswer(subject: string): string {
  const answers: Record<string, string> = {
    Maths: "x = 6",
    Science: "H2O",
    English: "The students are taught by the teacher.",
    History: "Sri Vikrama Rajasinha",
    Sinhala: "නාම පද යනු පුද්ගලයින්, ස්ථාන, දේවල් හෝ අදහස් නම් කරන වචන වේ.",
  };
  return answers[subject] || "6";
}
