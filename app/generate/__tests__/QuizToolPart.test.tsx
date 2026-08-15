import { describe, test, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import QuizToolPart from "../QuizToolPart";
import {
  inputAvailableQuizPart,
  inputStreamingQuizPart,
  outputAvailableQuizPart,
  outputErrorQuizPart,
} from "./fixtures";

describe("QuizToolPart lifecycle states", () => {
  test("input-streaming renders the preparing skeleton", () => {
    render(<QuizToolPart part={inputStreamingQuizPart()} />);
    expect(screen.getByRole("status", { name: "Preparing a quiz" })).toBeInTheDocument();
  });

  test("input-available renders the building state with the topic", () => {
    render(<QuizToolPart part={inputAvailableQuizPart()} />);
    expect(screen.getByText(/Building your quiz on/)).toBeInTheDocument();
    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
  });

  test("output-available renders the finished quiz card", () => {
    render(<QuizToolPart part={outputAvailableQuizPart()} />);
    expect(screen.getByText("Quiz")).toBeInTheDocument();
    expect(
      screen.getByText("What pigment captures light in photosynthesis?", {
        exact: false,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chlorophyll" })).toBeInTheDocument();
  });

  test("output-error renders the tool's errorText", () => {
    render(<QuizToolPart part={outputErrorQuizPart("Duplicate answer options.")} />);
    expect(screen.getByText("Couldn't build this quiz")).toBeInTheDocument();
    expect(screen.getByText("Duplicate answer options.")).toBeInTheDocument();
  });
});

describe("QuizCard answer interaction", () => {
  test("selecting the correct option locks the question in and shows Correct!", () => {
    render(<QuizToolPart part={outputAvailableQuizPart()} />);

    const correctOption = screen.getByRole("button", { name: "Chlorophyll" });
    fireEvent.click(correctOption);

    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(correctOption).toBeDisabled();
    expect(screen.getByRole("button", { name: "Melanin" })).toBeDisabled();
  });

  test("selecting a wrong option shows the correct answer and doesn't mark it Correct!", () => {
    render(<QuizToolPart part={outputAvailableQuizPart()} />);

    const wrongOption = screen.getByRole("button", { name: "Melanin" });
    fireEvent.click(wrongOption);

    expect(
      screen.getByText('Not quite — the correct answer is "Chlorophyll."'),
    ).toBeInTheDocument();
    expect(screen.queryByText("Correct!")).not.toBeInTheDocument();
    expect(wrongOption).toBeDisabled();
  });
});
