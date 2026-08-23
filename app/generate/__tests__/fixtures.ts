import type {
  CreateFlashcardsOutput,
  CreateQuizOutput,
  LumoraUIMessage,
} from "@/lib/ai/tools";

type CreateQuizUIPart = Extract<
  LumoraUIMessage["parts"][number],
  { type: "tool-createQuiz" }
>;

export function userMessage(text: string, id = "user-1"): LumoraUIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  };
}

export function assistantTextMessage(
  text: string,
  id = "assistant-1",
  state: "streaming" | "done" = "done",
): LumoraUIMessage {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text, state }],
  };
}

export function assistantMessageWithParts(
  parts: LumoraUIMessage["parts"],
  id = "assistant-1",
): LumoraUIMessage {
  return { id, role: "assistant", parts };
}

const SAMPLE_QUIZ_INPUT = {
  topic: "Photosynthesis",
  questions: [
    {
      question: "What pigment captures light in photosynthesis?",
      options: ["Chlorophyll", "Melanin", "Keratin", "Hemoglobin"],
      correctIndex: 0,
    },
  ],
};

export function quizToolPart(
  overrides: Partial<CreateQuizUIPart> & { toolCallId?: string },
): CreateQuizUIPart {
  return {
    type: "tool-createQuiz",
    toolCallId: overrides.toolCallId ?? "call-1",
    ...overrides,
  } as CreateQuizUIPart;
}

export function inputStreamingQuizPart(toolCallId = "call-1"): CreateQuizUIPart {
  return quizToolPart({ toolCallId, state: "input-streaming", input: undefined });
}

export function inputAvailableQuizPart(toolCallId = "call-2"): CreateQuizUIPart {
  return quizToolPart({
    toolCallId,
    state: "input-available",
    input: SAMPLE_QUIZ_INPUT,
  });
}

// A one-question quiz, matching SAMPLE_QUIZ_INPUT above. Exposed directly
// (not just via outputAvailableQuizPart's tool-part wrapper) for tests that
// need a plain CreateQuizOutput — QuizPanel takes one directly, it doesn't
// know about tool parts at all.
export function singleQuestionQuiz(): CreateQuizOutput {
  return {
    quizId: "quiz-1",
    topic: SAMPLE_QUIZ_INPUT.topic,
    questions: SAMPLE_QUIZ_INPUT.questions.map((q, index) => ({
      id: `quiz-1-${index + 1}`,
      ...q,
    })),
  };
}

export function outputAvailableQuizPart(toolCallId = "call-3"): CreateQuizUIPart {
  return quizToolPart({
    toolCallId,
    state: "output-available",
    input: SAMPLE_QUIZ_INPUT,
    output: singleQuestionQuiz(),
  });
}

// A three-question quiz, for QuizPanel tests that exercise pagination
// (Previous/Next) and the completion state — outputAvailableQuizPart's
// single-question quiz can't exercise those.
export function multiQuestionQuiz(): CreateQuizOutput {
  return {
    quizId: "quiz-multi",
    topic: "Photosynthesis",
    questions: [
      {
        id: "quiz-multi-1",
        question: "What pigment captures light in photosynthesis?",
        options: ["Chlorophyll", "Melanin", "Keratin", "Hemoglobin"],
        correctIndex: 0,
      },
      {
        id: "quiz-multi-2",
        question: "Which gas do plants absorb for photosynthesis?",
        options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"],
        correctIndex: 2,
      },
      {
        id: "quiz-multi-3",
        question: "Where does photosynthesis mainly take place in a plant cell?",
        options: ["Mitochondria", "Nucleus", "Ribosome", "Chloroplast"],
        correctIndex: 3,
      },
    ],
  };
}

export function outputErrorQuizPart(
  errorText = "Question 1 has duplicate answer options.",
  toolCallId = "call-4",
): CreateQuizUIPart {
  return quizToolPart({
    toolCallId,
    state: "output-error",
    input: SAMPLE_QUIZ_INPUT,
    errorText,
  });
}


type CreateFlashcardsUIPart = Extract<
  LumoraUIMessage["parts"][number],
  { type: "tool-createFlashcards" }
>;

const SAMPLE_FLASHCARDS_INPUT = {
  topic: "Photosynthesis",
  cards: [
    {
      front: "What pigment captures light in photosynthesis?",
      back: "Chlorophyll",
    },
  ],
};

export function flashcardsToolPart(
  overrides: Partial<CreateFlashcardsUIPart> & { toolCallId?: string },
): CreateFlashcardsUIPart {
  return {
    type: "tool-createFlashcards",
    toolCallId: overrides.toolCallId ?? "fc-call-1",
    ...overrides,
  } as CreateFlashcardsUIPart;
}

export function inputStreamingFlashcardsPart(
  toolCallId = "fc-call-1",
): CreateFlashcardsUIPart {
  return flashcardsToolPart({ toolCallId, state: "input-streaming", input: undefined });
}

export function inputAvailableFlashcardsPart(
  toolCallId = "fc-call-2",
): CreateFlashcardsUIPart {
  return flashcardsToolPart({
    toolCallId,
    state: "input-available",
    input: SAMPLE_FLASHCARDS_INPUT,
  });
}

// A one-card flashcard set, matching SAMPLE_FLASHCARDS_INPUT above.
// Exposed directly (not just via outputAvailableFlashcardsPart's tool-part
// wrapper) for tests that need a plain CreateFlashcardsOutput —
// FlashcardsPanel takes an array of these directly, it doesn't know about
// tool parts at all.
export function singleCardFlashcardSet(): CreateFlashcardsOutput {
  return {
    flashcardSetId: "flashcards-1",
    topic: SAMPLE_FLASHCARDS_INPUT.topic,
    cards: SAMPLE_FLASHCARDS_INPUT.cards.map((c, index) => ({
      id: `flashcards-1-${index + 1}`,
      ...c,
    })),
  };
}

export function outputAvailableFlashcardsPart(
  toolCallId = "fc-call-3",
): CreateFlashcardsUIPart {
  return flashcardsToolPart({
    toolCallId,
    state: "output-available",
    input: SAMPLE_FLASHCARDS_INPUT,
    output: singleCardFlashcardSet(),
  });
}

// A three-card set, for FlashcardsPanel tests that exercise
// Previous/Next navigation and the position indicator —
// outputAvailableFlashcardsPart's single-card set can't exercise those.
export function multiCardFlashcardSet(): CreateFlashcardsOutput {
  return {
    flashcardSetId: "flashcards-multi",
    topic: "Photosynthesis",
    cards: [
      {
        id: "flashcards-multi-1",
        front: "What pigment captures light in photosynthesis?",
        back: "Chlorophyll",
      },
      {
        id: "flashcards-multi-2",
        front: "Which gas do plants absorb for photosynthesis?",
        back: "Carbon dioxide",
        explanation: "Released as a byproduct of cellular respiration.",
      },
      {
        id: "flashcards-multi-3",
        front: "Where does photosynthesis mainly take place in a plant cell?",
        back: "Chloroplast",
      },
    ],
  };
}

export function outputErrorFlashcardsPart(
  errorText = "Card 2 had an empty back.",
  toolCallId = "fc-call-4",
): CreateFlashcardsUIPart {
  return flashcardsToolPart({
    toolCallId,
    state: "output-error",
    input: SAMPLE_FLASHCARDS_INPUT,
    errorText,
  });
}
