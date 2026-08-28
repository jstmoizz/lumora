import { describe, test, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import QuizPanel from "../QuizPanel";
import { emptyQuiz, multiQuestionQuiz, singleQuestionQuiz } from "./fixtures";

describe("QuizPanel empty state", () => {
  test("shows a calm idle message when no quiz has been generated yet", () => {
    render(<QuizPanel quizzes={[]} />);
    expect(screen.getByText("No quiz yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /previous question/i }),
    ).not.toBeInTheDocument();
  });
});

// Regression coverage: a persisted quiz can have zero questions (live
// generation's schema forbids it, but persisted data isn't re-validated) —
// indexing straight into questions[0] used to crash the whole /generate route.
describe("QuizPanel — persisted quiz with zero questions", () => {
  test("renders an accessible fallback instead of crashing, with no question UI", () => {
    render(<QuizPanel quizzes={[emptyQuiz()]} />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("This quiz couldn't be loaded.");
    expect(alert).toHaveTextContent("Try generating the quiz again.");

    expect(screen.queryByRole("button", { name: /previous question/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next question/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /finish quiz/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ \/ \d+/)).not.toBeInTheDocument();
  });

  test("the Disclosure still labels it correctly, and a normal quiz alongside it is unaffected", () => {
    // Putting the healthy quiz first (it starts expanded) means the broken
    // one starts collapsed, exercising the fallback via "expand it" rather
    // than only on first paint.
    render(<QuizPanel quizzes={[singleQuestionQuiz(), emptyQuiz()]} />);

    // The broken quiz's header still shows its topic/question count — only
    // its content is replaced by the fallback.
    expect(screen.getByText("0 questions")).toBeInTheDocument();

    const collapsedTrigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: false,
    });
    fireEvent.click(collapsedTrigger);
    expect(screen.getByRole("alert")).toHaveTextContent("This quiz couldn't be loaded.");

    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeInTheDocument();
  });
});

describe("QuizPanel answer interaction", () => {
  test("selecting the correct option locks the question in and shows Correct!", () => {
    render(<QuizPanel quizzes={[singleQuestionQuiz()]} />);

    const correctOption = screen.getByRole("button", { name: "Chlorophyll" });
    fireEvent.click(correctOption);

    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(correctOption).toBeDisabled();
    expect(screen.getByRole("button", { name: "Melanin" })).toBeDisabled();
  });

  test("selecting a wrong option shows the correct answer and doesn't mark it Correct!", () => {
    render(<QuizPanel quizzes={[singleQuestionQuiz()]} />);

    const wrongOption = screen.getByRole("button", { name: "Melanin" });
    fireEvent.click(wrongOption);

    expect(
      screen.getByText('Not quite — the correct answer is "Chlorophyll."'),
    ).toBeInTheDocument();
    expect(screen.queryByText("Correct!")).not.toBeInTheDocument();
    expect(wrongOption).toBeDisabled();
  });
});

describe("QuizPanel pagination", () => {
  test("shows one question at a time with a question number / total", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(
      screen.getByText("What pigment captures light in photosynthesis?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Which gas do plants absorb for photosynthesis?"),
    ).not.toBeInTheDocument();
  });

  test("Previous is disabled on the first question", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);
    expect(
      screen.getByRole("button", { name: "Previous question" }),
    ).toBeDisabled();
  });

  test("Next advances to the following question", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(
      screen.getByText("Which gas do plants absorb for photosynthesis?"),
    ).toBeInTheDocument();
  });

  test("Previous returns to the prior question, keeping its selection", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous question" }));

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeDisabled();
    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });

  test("the last question's Next button is labeled to finish the quiz", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish quiz" })).toBeInTheDocument();
  });
});

describe("QuizPanel completion state", () => {
  test("finishing the quiz shows a score and a way to review answers", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);

    // Answer question 1 correctly, question 2 incorrectly, leave 3 unanswered.
    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));

    expect(screen.getByText("Quiz complete")).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 3 correct/)).toBeInTheDocument();
    expect(screen.getByText(/1 unanswered/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Review answers" }));
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });
});

describe("QuizPanel explain-mistakes handoff", () => {
  test("finishing with wrong and unanswered questions sends one summary naming the topic and each miss", () => {
    const onExplainMistakes = vi.fn();
    render(
      <QuizPanel quizzes={[multiQuestionQuiz()]} onExplainMistakes={onExplainMistakes} />,
    );

    // Question 1 correct, question 2 wrong, question 3 left unanswered —
    // same sequence as the completion test above.
    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));

    expect(onExplainMistakes).toHaveBeenCalledTimes(1);
    const message = onExplainMistakes.mock.calls[0][0] as string;
    expect(message).toContain("Photosynthesis");
    expect(message).toContain("2 of 3 wrong");
    expect(message).toContain("Which gas do plants absorb for photosynthesis?");
    expect(message).toContain('I answered "Oxygen"');
    expect(message).toContain("Where does photosynthesis mainly take place in a plant cell?");
    expect(message).toContain("I left this unanswered");
    // The question answered correctly shouldn't appear as a miss.
    expect(message).not.toContain("What pigment captures light in photosynthesis?");
  });

  test("a perfect score never calls onExplainMistakes", () => {
    const onExplainMistakes = vi.fn();
    render(
      <QuizPanel quizzes={[multiQuestionQuiz()]} onExplainMistakes={onExplainMistakes} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Carbon dioxide" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Chloroplast" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));

    expect(onExplainMistakes).not.toHaveBeenCalled();
  });

  test("reviewing answers and finishing again does not resend the explanation", () => {
    const onExplainMistakes = vi.fn();
    render(
      <QuizPanel quizzes={[multiQuestionQuiz()]} onExplainMistakes={onExplainMistakes} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));
    expect(onExplainMistakes).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Review answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));

    expect(onExplainMistakes).toHaveBeenCalledTimes(1);
  });

  test("no crash and no call when onExplainMistakes isn't provided", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Melanin" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));

    expect(screen.getByText("Quiz complete")).toBeInTheDocument();
  });
});

describe("QuizPanel multiple quizzes", () => {
  test("every quiz gets its own row, labeled by topic and question count", () => {
    render(
      <QuizPanel
        quizzes={[multiQuestionQuiz(), singleQuestionQuiz()]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /Photosynthesis/, expanded: true }),
    ).toBeInTheDocument();
    expect(screen.getByText("3 questions")).toBeInTheDocument();
    expect(screen.getByText("1 question")).toBeInTheDocument();
  });

  test("only the first (most recently generated) quiz starts expanded", () => {
    render(
      <QuizPanel
        quizzes={[multiQuestionQuiz(), singleQuestionQuiz()]}
      />,
    );

    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeVisible();

    // The older quiz stays collapsed, but Disclosure keeps its content
    // mounted (not removed) so its state survives — see the "answer
    // selections survive" test below.
    const collapsedTrigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: false,
    });
    const card = collapsedTrigger.closest("div");
    if (!card) throw new Error("expected the disclosure card container");
    expect(within(card).getByText("1 / 1")).not.toBeVisible();
  });

  test("answer selections and completed state survive collapsing and reopening the same quiz", () => {
    render(<QuizPanel quizzes={[singleQuestionQuiz()]} />);

    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    expect(screen.getByText("Correct!")).toBeInTheDocument();

    const trigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: true,
    });
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);
    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeDisabled();
  });

  test("expanding a collapsed quiz reveals it without disturbing the other quiz's state", () => {
    render(
      <QuizPanel
        quizzes={[multiQuestionQuiz(), singleQuestionQuiz()]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    expect(screen.getByText("Correct!")).toBeInTheDocument();

    const collapsedTrigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: false,
    });
    fireEvent.click(collapsedTrigger);

    expect(collapsedTrigger).toHaveAttribute("aria-expanded", "true");
    // Scoped to its own card, since both quizzes' first questions share the
    // same answer options.
    const card = collapsedTrigger.closest("div");
    if (!card) throw new Error("expected the disclosure card container");
    const singleQuizOption = within(card).getByRole("button", {
      name: "Melanin",
    });
    expect(singleQuizOption).not.toBeDisabled();
    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });
});
