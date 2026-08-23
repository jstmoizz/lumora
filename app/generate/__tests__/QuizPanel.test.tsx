import { describe, test, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import QuizPanel from "../QuizPanel";
import { multiQuestionQuiz, singleQuestionQuiz } from "./fixtures";

describe("QuizPanel empty state", () => {
  test("shows a calm idle message when no quiz has been generated yet", () => {
    render(<QuizPanel quizzes={[]} />);
    expect(screen.getByText("No quiz yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /previous question/i }),
    ).not.toBeInTheDocument();
  });
});

// A single quiz is rendered as one Disclosure card, expanded by default
// (index 0 in the list) — these interaction tests exercise its content
// directly, the same way they did before quizzes were wrapped in a
// collapsible card.
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

// The actual behavior this phase's brief asked for: generating another
// quiz must not destroy/replace previous ones, each gets its own
// independently collapsible card, and only the newest starts expanded.
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

    // The newest quiz's own answer options are already visible and operable...
    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeVisible();

    // ...but the older quiz stays collapsed. Its content still exists in
    // the DOM (Disclosure keeps it mounted so its own state survives —
    // see the "answer selections survive" test below), it's just not
    // visible until expanded.
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

    // Answer the (already-expanded) newest quiz's first question.
    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    expect(screen.getByText("Correct!")).toBeInTheDocument();

    // Expand the older, collapsed quiz via its own disclosure trigger.
    const collapsedTrigger = screen.getByRole("button", {
      name: /Photosynthesis/,
      expanded: false,
    });
    fireEvent.click(collapsedTrigger);

    expect(collapsedTrigger).toHaveAttribute("aria-expanded", "true");
    // Its own (unanswered) question is now visible, scoped to its own
    // card since both quizzes' first questions share the same options —
    // and the newer quiz's answered state is untouched.
    const card = collapsedTrigger.closest("div");
    if (!card) throw new Error("expected the disclosure card container");
    const singleQuizOption = within(card).getByRole("button", {
      name: "Melanin",
    });
    expect(singleQuizOption).not.toBeDisabled();
    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });
});
