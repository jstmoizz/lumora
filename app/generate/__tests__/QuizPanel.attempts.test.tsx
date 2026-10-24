import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import QuizPanel from "../QuizPanel";
import { multiQuestionQuiz } from "./fixtures";

// multiQuestionQuiz: Q1 correct "Chlorophyll", Q2 correct "Carbon dioxide",
// Q3 correct "Chloroplast". This answers Q1 right and Q2/Q3 wrong.
function finishWithTwoMistakes() {
  fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  fireEvent.click(screen.getByRole("button", { name: "Oxygen" }));
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  fireEvent.click(screen.getByRole("button", { name: "Nucleus" }));
  fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));
}

describe("QuizPanel — saving attempts", () => {
  test("reports a finished whole-quiz attempt once, with its score and missed question ids", () => {
    const onAttemptFinished = vi.fn(async () => true);
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} onAttemptFinished={onAttemptFinished} />);

    finishWithTwoMistakes();

    expect(onAttemptFinished).toHaveBeenCalledTimes(1);
    expect(onAttemptFinished).toHaveBeenCalledWith({
      quizId: "quiz-multi",
      topic: "Photosynthesis",
      mode: "full",
      correctCount: 1,
      totalCount: 3,
      missedQuestionIds: ["quiz-multi-2", "quiz-multi-3"],
    });
  });

  test("Review answers then Finish again is the same attempt — not saved twice", () => {
    const onAttemptFinished = vi.fn(async () => true);
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} onAttemptFinished={onAttemptFinished} />);

    finishWithTwoMistakes();
    fireEvent.click(screen.getByRole("button", { name: "Review answers" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));

    expect(onAttemptFinished).toHaveBeenCalledTimes(1);
  });

  test("tells the user when a score couldn't be saved, without blocking the quiz", async () => {
    render(
      <QuizPanel
        quizzes={[multiQuestionQuiz()]}
        onAttemptFinished={vi.fn(async () => false)}
      />,
    );

    finishWithTwoMistakes();

    expect(await screen.findByText("Couldn't save this score.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retake missed/ })).toBeEnabled();
  });

  test("works exactly as before when no save handler is given", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} />);

    finishWithTwoMistakes();

    expect(screen.getByText("Quiz complete")).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 3 correct/)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't save this score.")).not.toBeInTheDocument();
  });
});

describe("QuizPanel — retakes", () => {
  test("Retake missed replays only the questions that were wrong, and saves it as a 'missed' attempt", () => {
    const onAttemptFinished = vi.fn(async () => true);
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} onAttemptFinished={onAttemptFinished} />);

    finishWithTwoMistakes();
    fireEvent.click(screen.getByRole("button", { name: "Retake missed (2)" }));

    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByText(/Missed questions/)).toBeInTheDocument();
    expect(
      screen.getByText("Which gas do plants absorb for photosynthesis?"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Carbon dioxide" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(
      screen.getByText("Where does photosynthesis mainly take place in a plant cell?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Chloroplast" }));
    fireEvent.click(screen.getByRole("button", { name: "Finish quiz" }));

    expect(screen.getByText("Retake complete")).toBeInTheDocument();
    expect(screen.getByText(/2 \/ 2 correct/)).toBeInTheDocument();
    // Nothing left to retake once every missed question is right.
    expect(screen.queryByRole("button", { name: /Retake missed/ })).not.toBeInTheDocument();

    expect(onAttemptFinished).toHaveBeenCalledTimes(2);
    expect(onAttemptFinished).toHaveBeenLastCalledWith({
      quizId: "quiz-multi",
      topic: "Photosynthesis",
      mode: "missed",
      correctCount: 2,
      totalCount: 2,
      missedQuestionIds: [],
    });
  });

  test("Retake quiz starts the whole quiz over with answers cleared", () => {
    render(<QuizPanel quizzes={[multiQuestionQuiz()]} onAttemptFinished={vi.fn(async () => true)} />);

    finishWithTwoMistakes();
    fireEvent.click(screen.getByRole("button", { name: "Retake quiz" }));

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    // The first question's options are unlocked again — nothing selected.
    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("the 'explain my mistakes' message is only sent for the first attempt, never on a retake", () => {
    const onExplainMistakes = vi.fn();
    render(
      <QuizPanel
        quizzes={[multiQuestionQuiz()]}
        onExplainMistakes={onExplainMistakes}
        onAttemptFinished={vi.fn(async () => true)}
      />,
    );

    finishWithTwoMistakes();
    expect(onExplainMistakes).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retake quiz" }));
    finishWithTwoMistakes();

    expect(onExplainMistakes).toHaveBeenCalledTimes(1);
  });
});

describe("QuizPanel — saved best score", () => {
  test("shows the best whole-quiz score next to the quiz and on its results screen", async () => {
    render(
      <QuizPanel
        quizzes={[multiQuestionQuiz()]}
        attemptSummaries={{ "quiz-multi": { attempts: 4, bestFull: { correct: 3, total: 3 } } }}
        onAttemptFinished={vi.fn(async () => true)}
      />,
    );

    expect(screen.getByText("3 questions · Best 3/3")).toBeInTheDocument();

    finishWithTwoMistakes();
    await waitFor(() => expect(screen.getByText(/Best: 3 \/ 3/)).toBeInTheDocument());
    expect(screen.getByText(/4 attempts/)).toBeInTheDocument();
  });

  test("shows just the question count when there's no saved whole-quiz score", () => {
    render(
      <QuizPanel
        quizzes={[multiQuestionQuiz()]}
        attemptSummaries={{ "quiz-multi": { attempts: 1, bestFull: null } }}
      />,
    );

    expect(screen.getByText("3 questions")).toBeInTheDocument();
  });
});
