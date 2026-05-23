import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { MemoryGraph } from "./memory-graph";
import {
  BookOpen,
  Calendar,
  Sparkles,
  BookMarked,
  Brain,
  Edit3,
  ListTodo,
  TrendingUp,
  CheckCircle,
  HelpCircle,
} from "lucide-react";

export const StudyCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "notes" | "plans" | "flashcards">("dashboard");
  const { readinessScore, weeklyStudyHours, syllabusCompletion } = useAppStore();

  // Flashcards state
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flashcards] = useState([
    { question: "What is the formula for quadratic equations?", answer: "x = [-b ± √(b² - 4ac)] / 2a", category: "Math" },
    { question: "Define photosynthesis.", answer: "The process by which plants use sunlight, water, and carbon dioxide to produce oxygen and energy in the form of sugar.", category: "Science" },
    { question: "Who was the last king of Sri Lanka?", answer: "Sri Vikrama Rajasinha of Kandy", category: "History" },
    { question: "What is active voice vs passive voice?", answer: "Active voice: Subject performs action (e.g. 'Aura taught me'). Passive voice: Subject receives action (e.g. 'I was taught by Aura').", category: "English" },
  ]);

  // Notes state
  const [notes, setNotes] = useState([
    { title: "Algebra Fundamentals", content: "Algebra is about finding the unknown or putting real-life variables into equations. Grade 9 covers linear equations, graphing coordinate grids, and simple quadratics.", date: "May 18, 2026" },
    { title: "Newtonian Physics & Force Diagrams", content: "Forces are vector quantities (magnitude and direction). Net force = mass * acceleration. Normal force acts perpendicular to the surface contact plane.", date: "May 16, 2026" }
  ]);
  const [selectedNote, setSelectedNote] = useState<number>(0);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editedNoteContent, setEditedNoteContent] = useState("");

  // Study plans state
  const [studyPlanDays, setStudyPlanDays] = useState([
    { day: "Monday", task: "Solve 5 Algebra quadratic homework questions with Aura", completed: true },
    { day: "Tuesday", task: "Review Newton's Laws & Draw force diagrams for grade 9 syllabus", completed: true },
    { day: "Wednesday", task: "Kandyan kingdom treaties essay drafting & peer swarm review", completed: false },
    { day: "Thursday", task: "Active/Passive voice grammar worksheets inside Aura voice room", completed: false },
    { day: "Friday", task: "Solve Term 1 term-paper mockup exam inside Exam mode", completed: false },
  ]);

  const handleTogglePlan = (index: number) => {
    const updated = [...studyPlanDays];
    if (updated[index]) {
      updated[index].completed = !updated[index].completed;
      setStudyPlanDays(updated);
    }
  };

  const handleNextCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentCardIndex((prev) => (prev + 1) % flashcards.length);
    }, 150);
  };

  const handlePrevCard = () => {
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentCardIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
    }, 150);
  };

  return (
    <div className="h-full w-full flex flex-col items-stretch bg-white dark:bg-[#0e0e0f] text-foreground dark:text-white overflow-hidden select-none">
      
      {/* 1. Header Toolbar */}
      <div className="h-[52px] border-b border-black/5 dark:border-white/5 flex items-center justify-between px-6 shrink-0 bg-[#f0f4f9] dark:bg-[#0f0f10]">
        <div className="flex items-center gap-2">
          <BookOpen className="size-4.5 text-blue-500" />
          <h1 className="text-sm font-bold tracking-wide uppercase">Aura Study Workspace</h1>
        </div>

        {/* Local Tab selectors */}
        <div className="flex gap-1.5">
          {([
            { id: "dashboard", label: "Dashboard", icon: BookMarked },
            { id: "notes", label: "Notes Hub", icon: Edit3 },
            { id: "plans", label: "Schedules", icon: Calendar },
            { id: "flashcards", label: "Flashcards", icon: Brain },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`h-8 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-bold transition-all ${
                activeTab === id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Main Tab Viewports */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white dark:bg-[#0e0e0f]">
        
        {/* TAB: Dashboard */}
        {activeTab === "dashboard" && (
          <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
            {/* Top Cards: Learning Analytics (Replaces Gamification) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              
              {/* Card 1: Overall Syllabus Readiness */}
              <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] border border-black/5 dark:border-white/5 rounded-3xl p-5 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Syllabus Readiness</span>
                    <h3 className="text-3xl font-extrabold tracking-tight text-blue-600 dark:text-blue-400">{readinessScore}%</h3>
                  </div>
                  <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-950/45 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <TrendingUp className="size-5" />
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-3 leading-relaxed">
                  Calculated dynamically based on subject mastery, term assessments, and lesson retentions.
                </p>
                {/* Visual meter bar */}
                <div className="w-full h-1 bg-black/10 dark:bg-white/5 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style={{ width: `${readinessScore}%` }} />
                </div>
              </div>

              {/* Card 2: Syllabus Completion Tracker */}
              <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] border border-black/5 dark:border-white/5 rounded-3xl p-5 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Syllabus Completion</span>
                    <h3 className="text-3xl font-extrabold tracking-tight text-purple-600 dark:text-purple-400">{syllabusCompletion}%</h3>
                  </div>
                  <div className="size-10 rounded-full bg-purple-100 dark:bg-purple-950/45 flex items-center justify-center text-purple-600 dark:text-purple-400">
                    <BookOpen className="size-5" />
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-3 leading-relaxed">
                  Tracks exact units studied, notes summarized, and text-book chapters solved with Aura.
                </p>
                {/* Visual meter bar */}
                <div className="w-full h-1 bg-black/10 dark:bg-white/5 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: `${syllabusCompletion}%` }} />
                </div>
              </div>

              {/* Card 3: Weekly Active Study Hours */}
              <div className="bg-[#f0f4f9] dark:bg-[#1e1f20] border border-black/5 dark:border-white/5 rounded-3xl p-5 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Active Learning Hours</span>
                    <h3 className="text-3xl font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400">{weeklyStudyHours}h</h3>
                  </div>
                  <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-950/45 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <Calendar className="size-5" />
                  </div>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-3 leading-relaxed">
                  Time spent in active study notes curation, quiz evaluation, and personalized live voice rooms.
                </p>
                {/* Visual progress mock */}
                <div className="w-full h-1 bg-black/10 dark:bg-white/5 rounded-full mt-4 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" style={{ width: "70%" }} />
                </div>
              </div>

            </div>

            {/* Cognitive Node Connections Canvas Graph */}
            <div className="space-y-3.5">
              <div className="flex items-center gap-1">
                <Brain className="size-4.5 text-blue-500" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">Neural Subject Mastery Canvas</h2>
              </div>
              <MemoryGraph />
            </div>
          </div>
        )}

        {/* TAB: Notes Hub */}
        {activeTab === "notes" && (
          <div className="max-w-5xl mx-auto h-[480px] bg-[#f0f4f9] dark:bg-[#1e1f20] border border-black/5 dark:border-white/5 rounded-[28px] overflow-hidden flex animate-fade-in shadow-sm">
            
            {/* Sidebar list */}
            <div className="w-64 border-r border-black/5 dark:border-white/5 flex flex-col p-4 justify-between shrink-0 bg-white/40 dark:bg-black/15">
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block px-2.5 pb-2">AI Generated Notes</span>
                {notes.map((note, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedNote(i);
                      setIsEditingNote(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl transition-all block ${
                      selectedNote === i
                        ? "bg-blue-600/10 dark:bg-blue-950/20 text-blue-500 border border-blue-500/25"
                        : "hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <h4 className="text-xs font-bold truncate">{note.title}</h4>
                    <span className="text-[9.5px] font-bold opacity-60 block mt-1">{note.date}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  const title = prompt("Enter note title:");
                  if (title) {
                    setNotes((prev) => [
                      ...prev,
                      { title, content: "Start writing or ask Aura to generate notes from files...", date: "Just now" }
                    ]);
                    setSelectedNote(notes.length);
                    setIsEditingNote(true);
                  }
                }}
                className="w-full text-center py-2.5 rounded-xl border border-dashed border-muted-foreground text-xs font-bold hover:bg-black/5 dark:hover:bg-white/5 transition-all text-foreground dark:text-white"
              >
                + Add Custom Notes
              </button>
            </div>

            {/* Note details canvas */}
            <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto">
              {notes[selectedNote] ? (
                <div className="space-y-4 h-full flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center border-b border-black/5 dark:border-white/5 pb-2">
                      <h3 className="font-bold text-[16px]">{notes[selectedNote]!.title}</h3>
                      <button
                        onClick={() => {
                          if (isEditingNote) {
                            const updated = [...notes];
                            updated[selectedNote]!.content = editedNoteContent;
                            setNotes(updated);
                            setIsEditingNote(false);
                          } else {
                            setEditedNoteContent(notes[selectedNote]!.content);
                            setIsEditingNote(true);
                          }
                        }}
                        className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-md shadow-blue-500/15"
                      >
                        <Edit3 className="size-3.5" />
                        <span>{isEditingNote ? "Save Note" : "Edit Note"}</span>
                      </button>
                    </div>

                    {isEditingNote ? (
                      <textarea
                        value={editedNoteContent}
                        onChange={(e) => setEditedNoteContent(e.target.value)}
                        className="w-full h-[280px] bg-white dark:bg-[#0e0e0f] rounded-xl border border-[#dadce0]/50 dark:border-[#2d2f31]/50 p-4 outline-none text-xs font-medium text-foreground leading-relaxed resize-none"
                      />
                    ) : (
                      <p className="text-xs font-medium text-foreground/80 dark:text-white/80 leading-relaxed max-h-[300px] overflow-y-auto pr-1">
                        {notes[selectedNote]!.content}
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100/50 dark:border-blue-900/20 rounded-xl p-3.5 flex items-center gap-3">
                    <Sparkles className="size-4.5 text-blue-500 animate-pulse shrink-0" />
                    <p className="text-[11.5px] font-semibold text-blue-600 dark:text-blue-400">
                      Need more depth? Ask Aura to "Generate lesson worksheets" or "Quiz me on this note" inside Chat canvas.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Select a study note to review.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: Schedules / Study plans */}
        {activeTab === "plans" && (
          <div className="max-w-3xl mx-auto space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <ListTodo className="size-4.5 text-blue-500" />
                <h3 className="font-bold text-[15px]">Curriculum Study Schedule</h3>
              </div>
              <span className="text-[11.5px] font-bold text-muted-foreground uppercase">Adaptive Grade 9 Planner</span>
            </div>

            <div className="space-y-2.5">
              {studyPlanDays.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleTogglePlan(idx)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between hover:scale-[1.005] select-none ${
                    item.completed
                      ? "bg-emerald-500/5 dark:bg-emerald-500/5 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                      : "bg-[#f0f4f9] dark:bg-[#1e1f20] border-black/5 dark:border-white/5"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="text-xs font-extrabold uppercase w-20 shrink-0 opacity-80">{item.day}</span>
                    <p className="text-xs font-semibold truncate leading-relaxed text-foreground/80 dark:text-white/80">
                      {item.task}
                    </p>
                  </div>
                  <div className="shrink-0 pl-3">
                    <CheckCircle className={`size-5 transition-all ${item.completed ? "text-emerald-500 fill-emerald-500/10" : "text-muted-foreground/40"}`} />
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => {
                alert("Aura cognitive agent is reviewing subject accuracy to regenerate study plans...");
              }}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-blue-500/25 active:scale-95 flex items-center justify-center gap-1.5"
            >
              <Sparkles className="size-4 animate-spin-slow" />
              <span>Regenerate Planner from Weak Areas</span>
            </button>
          </div>
        )}

        {/* TAB: Flashcards */}
        {activeTab === "flashcards" && (
          <div className="max-w-xl mx-auto space-y-6 animate-fade-in flex flex-col items-center">
            
            {/* Interactive Flashcard with flip */}
            <div
              onClick={() => setIsFlipped(!isFlipped)}
              className="w-full h-[220px] cursor-pointer relative group perspective"
            >
              <div
                className={`w-full h-full duration-500 preserve-3d relative rounded-3xl border shadow-xl flex flex-col justify-between p-6 ${
                  isFlipped
                    ? "bg-gradient-to-br from-[#1a2d4c] to-[#0f1b2e] border-blue-500/30 text-white transform rotate-y-180"
                    : "bg-white dark:bg-[#1e1f20] border-black/5 dark:border-white/5"
                }`}
              >
                {/* Front Side */}
                <div className={`absolute inset-0 p-6 flex flex-col justify-between backface-hidden ${isFlipped ? "opacity-0" : "opacity-100"}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">
                      {flashcards[currentCardIndex]!.category} Flashcard
                    </span>
                    <HelpCircle className="size-4 text-muted-foreground opacity-60" />
                  </div>
                  <h3 className="text-sm font-bold text-center leading-relaxed text-foreground dark:text-white px-2">
                    {flashcards[currentCardIndex]!.question}
                  </h3>
                  <div className="text-center text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                    Click card to reveal answer
                  </div>
                </div>

                {/* Back Side */}
                <div className={`absolute inset-0 p-6 flex flex-col justify-between backface-hidden transform rotate-y-180 ${isFlipped ? "opacity-100" : "opacity-0"}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                      Correct Answer
                    </span>
                    <CheckCircle className="size-4 text-emerald-500 opacity-60" />
                  </div>
                  <h3 className="text-sm font-semibold text-center leading-relaxed text-white px-2">
                    {flashcards[currentCardIndex]!.answer}
                  </h3>
                  <div className="text-center text-[10px] font-bold text-white/40 uppercase tracking-wider">
                    Click card to view question
                  </div>
                </div>

              </div>
            </div>

            {/* Navigation & self evaluation */}
            <div className="w-full flex items-center justify-between gap-4">
              <button
                onClick={handlePrevCard}
                className="h-9 px-4 rounded-xl border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold transition-all active:scale-95"
              >
                Prev
              </button>

              <span className="text-xs font-bold text-muted-foreground">
                Card {currentCardIndex + 1} of {flashcards.length}
              </span>

              <button
                onClick={handleNextCard}
                className="h-9 px-4 rounded-xl border border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-bold transition-all active:scale-95"
              >
                Next
              </button>
            </div>

            {/* Self evaluation tracker */}
            {isFlipped && (
              <div className="w-full border border-black/5 dark:border-white/5 bg-[#f0f4f9] dark:bg-[#1e1f20] rounded-2xl p-4.5 flex flex-col gap-2.5 animate-scale-up">
                <span className="text-[11px] font-bold text-muted-foreground uppercase text-center block">Rate your understanding</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      alert("Understanding recorded. Subject readiness calibrated.");
                      handleNextCard();
                    }}
                    className="flex-1 py-2 bg-red-600/10 hover:bg-red-600 border border-red-500/20 text-red-500 hover:text-white rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  >
                    Struggled
                  </button>
                  <button
                    onClick={() => {
                      alert("Understanding recorded. Subject readiness calibrated.");
                      handleNextCard();
                    }}
                    className="flex-1 py-2 bg-blue-600/10 hover:bg-blue-600 border border-blue-500/20 text-blue-500 hover:text-white rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  >
                    Getting There
                  </button>
                  <button
                    onClick={() => {
                      alert("Mastery confirmed. Subject readiness calibrated.");
                      handleNextCard();
                    }}
                    className="flex-1 py-2 bg-emerald-600/10 hover:bg-emerald-600 border border-emerald-500/20 text-emerald-500 hover:text-white rounded-xl text-[11px] font-bold transition-all active:scale-95"
                  >
                    Nailed It!
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
