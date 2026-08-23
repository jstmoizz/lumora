import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  test("output-available renders a non-interactive ready notice, not the quiz itself", () => {
    render(<QuizToolPart part={outputAvailableQuizPart()} />);

    // The notice reports the topic and question count. Matched with a
    // regex, not an exact string, since "Quiz ready:" and the topic sit in
    // sibling text/element nodes within the same paragraph.
    expect(screen.getByText(/Quiz ready/)).toBeInTheDocument();
    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
    expect(screen.getByText(/1 question/)).toBeInTheDocument();

    // ...but never the question/options themselves — those render
    // exclusively in the Quiz panel (see QuizPanel.test.tsx). This is the
    // architecture requirement this refactor exists for: one rendering
    // location for the interactive quiz, not two.
    expect(
      screen.queryByText("What pigment captures light in photosynthesis?", {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Chlorophyll" }),
    ).not.toBeInTheDocument();
  });

  test("output-error renders the tool's errorText", () => {
    render(<QuizToolPart part={outputErrorQuizPart("Duplicate answer options.")} />);
    expect(screen.getByText("Couldn't build this quiz")).toBeInTheDocument();
    expect(screen.getByText("Duplicate answer options.")).toBeInTheDocument();
  });
});
