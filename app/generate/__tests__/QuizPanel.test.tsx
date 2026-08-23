import { describe, test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuizPanel from "../QuizPanel";
import { multiQuestionQuiz, singleQuestionQuiz } from "./fixtures";

describe("QuizPanel empty state", () => {
  test("shows a calm idle message when no quiz has been generated yet", () => {
    render(<QuizPanel quiz={null} />);
    expect(screen.getByText("No quiz yet")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /previous question/i }),
    ).not.toBeInTheDocument();
  });
});

describe("QuizPanel answer interaction", () => {
  // Same mechanic the quiz used to have inline in chat — preserved here,
  // now in its one true rendering location.
  test("selecting the correct option locks the question in and shows Correct!", () => {
    render(<QuizPanel quiz={singleQuestionQuiz()} />);

    const correctOption = screen.getByRole("button", { name: "Chlorophyll" });
    fireEvent.click(correctOption);

    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(correctOption).toBeDisabled();
    expect(screen.getByRole("button", { name: "Melanin" })).toBeDisabled();
  });

  test("selecting a wrong option shows the correct answer and doesn't mark it Correct!", () => {
    render(<QuizPanel quiz={singleQuestionQuiz()} />);

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
    render(<QuizPanel quiz={multiQuestionQuiz()} />);

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(
      screen.getByText("What pigment captures light in photosynthesis?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Which gas do plants absorb for photosynthesis?"),
    ).not.toBeInTheDocument();
  });

  test("Previous is disabled on the first question", () => {
    render(<QuizPanel quiz={multiQuestionQuiz()} />);
    expect(
      screen.getByRole("button", { name: "Previous question" }),
    ).toBeDisabled();
  });

  test("Next advances to the following question", () => {
    render(<QuizPanel quiz={multiQuestionQuiz()} />);

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(
      screen.getByText("Which gas do plants absorb for photosynthesis?"),
    ).toBeInTheDocument();
  });

  test("Previous returns to the prior question, keeping its selection", () => {
    render(<QuizPanel quiz={multiQuestionQuiz()} />);

    fireEvent.click(screen.getByRole("button", { name: "Chlorophyll" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous question" }));

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeDisabled();
    expect(screen.getByText("Correct!")).toBeInTheDocument();
  });

  test("the last question's Next button is labeled to finish the quiz", () => {
    render(<QuizPanel quiz={multiQuestionQuiz()} />);

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));

    expect(screen.getByText("3 / 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish quiz" })).toBeInTheDocument();
  });
});

describe("QuizPanel completion state", () => {
  test("finishing the quiz shows a score and a way to review answers", () => {
    render(<QuizPanel quiz={multiQuestionQuiz()} />);

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

  test("a new quiz resets progress even if the previous one was mid-completion", () => {
    const { rerender } = render(<QuizPanel quiz={multiQuestionQuiz()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    rerender(<QuizPanel quiz={singleQuestionQuiz()} />);

    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });
});
