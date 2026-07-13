'use client';
import { useState, useEffect } from 'react';
import testData from './test_data.json';
import { Check, X, Clock, HelpCircle, ChevronLeft, ChevronRight, Flag } from 'lucide-react';

export default function CBTDemoPage() {
  const { metadata, questions } = testData;
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [statuses, setStatuses] = useState<Record<string, 'unvisited' | 'visited' | 'answered' | 'marked'>>({});
  const [timeLeft, setTimeLeft] = useState(metadata.duration_minutes * 60);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [activeSubject, setActiveSubject] = useState(metadata.subjects[0]);

  const currentQuestion = questions[currentIdx];

  // Initialize status for first question
  useEffect(() => {
    if (!statuses[currentQuestion.question_id] && !isSubmitted) {
      setStatuses(prev => ({ ...prev, [currentQuestion.question_id]: 'visited' }));
    }
  }, [currentIdx, isSubmitted]);

  // Timer
  useEffect(() => {
    if (isSubmitted || timeLeft <= 0) {
      if (timeLeft <= 0 && !isSubmitted) handleSubmit();
      return;
    }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isSubmitted]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleOptionSelect = (label: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.question_id]: label }));
  };

  const navigateTo = (idx: number) => {
    if (idx >= 0 && idx < questions.length) {
      setCurrentIdx(idx);
      setActiveSubject(questions[idx].subject);
    }
  };

  const saveAndNext = () => {
    if (answers[currentQuestion.question_id]) {
      setStatuses(prev => ({ ...prev, [currentQuestion.question_id]: 'answered' }));
    } else {
      setStatuses(prev => ({ ...prev, [currentQuestion.question_id]: 'visited' }));
    }
    navigateTo(currentIdx + 1);
  };

  const markForReview = () => {
    setStatuses(prev => ({ ...prev, [currentQuestion.question_id]: 'marked' }));
    navigateTo(currentIdx + 1);
  };

  const clearResponse = () => {
    const newAnswers = { ...answers };
    delete newAnswers[currentQuestion.question_id];
    setAnswers(newAnswers);
    setStatuses(prev => ({ ...prev, [currentQuestion.question_id]: 'visited' }));
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
  };

  const calculateResults = () => {
    let score = 0;
    let correct = 0;
    let incorrect = 0;
    let unattempted = 0;

    const subjectBreakdown: Record<string, any> = {};
    metadata.subjects.forEach(sub => {
      subjectBreakdown[sub] = { score: 0, correct: 0, incorrect: 0, unattempted: 0 };
    });

    questions.forEach(q => {
      const userAns = answers[q.question_id];
      const sub = q.subject;
      if (!userAns) {
        unattempted++;
        subjectBreakdown[sub].unattempted++;
      } else if (userAns === q.correct_answer) {
        correct++;
        score += q.marks_correct;
        subjectBreakdown[sub].correct++;
        subjectBreakdown[sub].score += q.marks_correct;
      } else {
        incorrect++;
        score += q.marks_incorrect;
        subjectBreakdown[sub].incorrect++;
        subjectBreakdown[sub].score += q.marks_incorrect;
      }
    });

    return { score, correct, incorrect, unattempted, subjectBreakdown };
  };

  if (isSubmitted) {
    const res = calculateResults();
    return (
      <div className="min-h-screen bg-zinc-50 p-8 font-sans">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border p-8">
          <h1 className="text-3xl font-bold mb-6 text-zinc-900">Result Summary</h1>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="text-sm text-blue-600 font-medium">Total Score</div>
              <div className="text-3xl font-bold text-blue-700">{res.score} <span className="text-sm font-normal text-blue-500">/ {metadata.total_marks}</span></div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg border border-green-100">
              <div className="text-sm text-green-600 font-medium">Correct</div>
              <div className="text-3xl font-bold text-green-700">{res.correct}</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg border border-red-100">
              <div className="text-sm text-red-600 font-medium">Incorrect</div>
              <div className="text-3xl font-bold text-red-700">{res.incorrect}</div>
            </div>
            <div className="p-4 bg-zinc-100 rounded-lg border border-zinc-200">
              <div className="text-sm text-zinc-600 font-medium">Unattempted</div>
              <div className="text-3xl font-bold text-zinc-700">{res.unattempted}</div>
            </div>
          </div>

          <h2 className="text-xl font-bold mb-4">Subject-wise Breakdown</h2>
          <div className="grid grid-cols-3 gap-4 mb-8">
            {metadata.subjects.map(sub => (
              <div key={sub} className="p-4 border rounded-lg">
                <div className="font-bold text-lg mb-2">{sub}</div>
                <div className="text-sm text-zinc-600">Score: {res.subjectBreakdown[sub].score}</div>
                <div className="text-sm text-green-600">Correct: {res.subjectBreakdown[sub].correct}</div>
                <div className="text-sm text-red-600">Incorrect: {res.subjectBreakdown[sub].incorrect}</div>
              </div>
            ))}
          </div>

          <h2 className="text-xl font-bold mb-4">Review Questions</h2>
          <div className="space-y-6">
            {questions.map((q, idx) => {
              const uAns = answers[q.question_id];
              const isCorr = uAns === q.correct_answer;
              return (
                <div key={q.question_id} className={`p-4 border rounded-lg ${!uAns ? 'bg-zinc-50' : isCorr ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex gap-2 items-center mb-2">
                    <span className="font-bold">Q{idx + 1}.</span>
                    <span className="text-sm px-2 py-0.5 rounded bg-white border">{q.subject}</span>
                    {uAns ? (isCorr ? <Check className="text-green-600 w-5 h-5" /> : <X className="text-red-600 w-5 h-5" />) : <span className="text-zinc-500 text-sm">Unattempted</span>}
                  </div>
                  <div className="mb-4 whitespace-pre-wrap">{q.question_text}</div>
                  {q.question_images?.map((img, i) => (
                    <img key={i} src={img} alt="Question figure" className="max-w-sm mb-4" />
                  ))}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {q.options.map(opt => (
                      <div key={opt.label} className={`p-2 border rounded flex gap-2 items-center ${opt.label === q.correct_answer ? 'bg-green-100 border-green-300 font-bold' : (opt.label === uAns ? 'bg-red-100 border-red-300' : 'bg-white')}`}>
                        <span className="font-bold w-6 text-center">{opt.label}</span> {opt.text}
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 text-sm font-medium">
                    Your Answer: {uAns || 'None'} | Correct Answer: {q.correct_answer}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 font-sans overflow-hidden">
      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-blue-600 text-white flex items-center justify-between px-6 shadow-sm z-10 shrink-0">
          <h1 className="font-bold text-lg">{metadata.exam_name}</h1>
          <div className="flex items-center gap-4 bg-blue-700 px-4 py-2 rounded-lg font-mono text-xl">
            <Clock className="w-5 h-5" />
            {formatTime(timeLeft)}
          </div>
        </header>

        {/* Subjects Tab */}
        <div className="flex bg-white border-b px-4 shrink-0 overflow-x-auto">
          {metadata.subjects.map(sub => {
            const isActive = activeSubject === sub;
            return (
              <button 
                key={sub}
                className={`px-6 py-3 font-medium text-sm whitespace-nowrap transition-colors border-b-2 ${isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-zinc-600 hover:text-blue-500 hover:bg-blue-50'}`}
                onClick={() => {
                  setActiveSubject(sub);
                  // Find first question of this subject
                  const firstIdx = questions.findIndex(q => q.subject === sub);
                  if (firstIdx !== -1) navigateTo(firstIdx);
                }}
              >
                {sub}
              </button>
            )
          })}
        </div>

        {/* Question Area */}
        <div className="flex-1 overflow-y-auto p-8 relative">
          <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border p-6 min-h-[400px]">
            <div className="flex justify-between items-center mb-6 pb-4 border-b">
              <h2 className="text-xl font-bold">Question {currentIdx + 1}</h2>
              <div className="flex gap-4 text-sm text-zinc-500 font-medium">
                <span className="flex items-center gap-1 text-green-600"><Check className="w-4 h-4" /> +{currentQuestion.marks_correct}</span>
                <span className="flex items-center gap-1 text-red-600"><X className="w-4 h-4" /> {currentQuestion.marks_incorrect}</span>
              </div>
            </div>

            <div className="text-lg mb-8 leading-relaxed whitespace-pre-wrap text-zinc-800">
              {currentQuestion.question_text}
            </div>

            {currentQuestion.question_images?.length > 0 && (
              <div className="mb-8">
                {currentQuestion.question_images.map((img, i) => (
                  <img key={i} src={img} alt="Figure" className="max-w-full h-auto border rounded-lg p-2 bg-zinc-50" />
                ))}
              </div>
            )}

            {currentQuestion.question_type === 'single_correct' && (
              <div className="space-y-3">
                {currentQuestion.options.map(opt => {
                  const isSelected = answers[currentQuestion.question_id] === opt.label;
                  return (
                    <label 
                      key={opt.label} 
                      className={`flex items-start gap-4 p-4 border rounded-xl cursor-pointer transition-all ${isSelected ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-zinc-200 hover:border-blue-300 hover:bg-zinc-50'}`}
                    >
                      <div className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-full border-2 ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-zinc-300'}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                      <div className="flex-1 text-base text-zinc-800 pt-0.5">
                        <span className="font-bold mr-2">{opt.label})</span>
                        {opt.text}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
            
            {/* If numerical, show input */}
            {currentQuestion.question_type === 'numerical' && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-zinc-700 mb-2">Enter your answer:</label>
                <input 
                  type="text" 
                  value={answers[currentQuestion.question_id] || ''}
                  onChange={(e) => handleOptionSelect(e.target.value)}
                  className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="Numerical value"
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <footer className="h-20 bg-white border-t flex items-center justify-between px-8 shrink-0 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <div className="flex gap-3">
            <button 
              onClick={markForReview}
              className="px-5 py-2.5 rounded-lg border-2 border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 font-medium flex items-center gap-2 transition-colors"
            >
              <Flag className="w-4 h-4" /> Mark for Review
            </button>
            <button 
              onClick={clearResponse}
              className="px-5 py-2.5 rounded-lg border-2 border-zinc-200 text-zinc-700 hover:bg-zinc-100 font-medium transition-colors"
            >
              Clear Response
            </button>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => navigateTo(currentIdx - 1)}
              disabled={currentIdx === 0}
              className="px-5 py-2.5 rounded-lg border text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 font-medium flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <button 
              onClick={saveAndNext}
              className="px-6 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium flex items-center gap-2 shadow-sm transition-colors"
            >
              Save & Next <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </footer>
      </div>

      {/* Right Sidebar - Palette */}
      <div className="w-80 bg-white border-l flex flex-col shadow-xl z-20">
        <div className="p-4 border-b bg-zinc-50 shrink-0">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold">
               User
             </div>
             <div>
               <div className="font-bold text-zinc-800">Candidate</div>
               <div className="text-xs text-zinc-500">JEE Mock Test</div>
             </div>
          </div>
          <div className="grid grid-cols-2 gap-y-3 text-xs font-medium">
            <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-md bg-green-500 text-white flex items-center justify-center">{Object.values(statuses).filter(s => s === 'answered').length}</div> Answered</div>
            <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-md bg-red-500 text-white flex items-center justify-center">{Object.values(statuses).filter(s => s === 'visited').length}</div> Not Answered</div>
            <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-md bg-white border border-zinc-300 flex items-center justify-center text-zinc-600">{questions.length - Object.keys(statuses).length}</div> Not Visited</div>
            <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center">{Object.values(statuses).filter(s => s === 'marked').length}</div> Marked</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-2 font-bold text-sm text-zinc-700">{activeSubject}</div>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              if (q.subject !== activeSubject) return null;
              
              const status = statuses[q.question_id] || 'unvisited';
              let bgClass = 'bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50';
              if (status === 'answered') bgClass = 'bg-green-500 text-white border-green-600';
              if (status === 'visited') bgClass = 'bg-red-500 text-white border-red-600';
              if (status === 'marked') bgClass = 'bg-purple-600 text-white border-purple-700 rounded-full';
              if (currentIdx === idx) bgClass += ' ring-2 ring-blue-500 ring-offset-2';

              return (
                <button
                  key={q.question_id}
                  onClick={() => navigateTo(idx)}
                  className={`w-10 h-10 border rounded-md font-medium text-sm flex items-center justify-center transition-all ${bgClass}`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t bg-zinc-50 shrink-0">
          <button 
            onClick={handleSubmit}
            className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-sm transition-colors"
          >
            Submit Test
          </button>
        </div>
      </div>
    </div>
  );
}
