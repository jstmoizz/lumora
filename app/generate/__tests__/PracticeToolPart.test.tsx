import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AddKnowledgeTopicToolPart, FlashcardsToolPart, QuizToolPart } from "../PracticeToolPart";
import {
  inputAvailableAddTopicPart,
  inputAvailableFlashcardsPart,
  inputAvailableQuizPart,
  inputStreamingAddTopicPart,
  inputStreamingFlashcardsPart,
  inputStreamingQuizPart,
  outputAvailableAddTopicPart,
  outputAvailableFlashcardsPart,
  outputAvailableQuizPart,
  outputErrorAddTopicPart,
  outputErrorFlashcardsPart,
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

  test("output-available renders a compact ready notice pointing at Resources, not the quiz itself", () => {
    render(<QuizToolPart part={outputAvailableQuizPart()} />);

    expect(screen.getByText(/Quiz ready: Photosynthesis/)).toBeInTheDocument();
    expect(screen.getByText(/1 question/)).toBeInTheDocument();
    expect(screen.getByText(/Open Resources to take it/)).toBeInTheDocument();

    // The quiz content itself renders exclusively in Resources' Quizzes tab
    // (see QuizPanel.test.tsx), never in the chat.
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

describe("FlashcardsToolPart lifecycle states", () => {
  test("input-streaming renders the preparing skeleton", () => {
    render(<FlashcardsToolPart part={inputStreamingFlashcardsPart()} />);
    expect(
      screen.getByRole("status", { name: "Preparing flashcards" }),
    ).toBeInTheDocument();
  });

  test("input-available renders the building state with the topic", () => {
    render(<FlashcardsToolPart part={inputAvailableFlashcardsPart()} />);
    expect(screen.getByText(/Building flashcards on/)).toBeInTheDocument();
    expect(screen.getByText("Photosynthesis")).toBeInTheDocument();
  });

  test("output-available renders a compact ready notice pointing at Resources, not the cards themselves", () => {
    render(<FlashcardsToolPart part={outputAvailableFlashcardsPart()} />);

    expect(
      screen.getByText(/Flashcards ready: Photosynthesis/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 card/)).toBeInTheDocument();
    expect(screen.getByText(/Open Resources to study/)).toBeInTheDocument();

    expect(
      screen.queryByText("What pigment captures light in photosynthesis?", {
        exact: false,
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Chlorophyll")).not.toBeInTheDocument();
  });

  test("output-error renders the tool's errorText", () => {
    render(
      <FlashcardsToolPart
        part={outputErrorFlashcardsPart("Card 2 had an empty back.")}
      />,
    );
    expect(screen.getByText("Couldn't build these flashcards")).toBeInTheDocument();
    expect(screen.getByText("Card 2 had an empty back.")).toBeInTheDocument();
  });
});

describe("AddKnowledgeTopicToolPart lifecycle states", () => {
  test("input-streaming renders the preparing skeleton", () => {
    render(<AddKnowledgeTopicToolPart part={inputStreamingAddTopicPart()} />);
    expect(
      screen.getByRole("status", { name: "Adding to your knowledge graph" }),
    ).toBeInTheDocument();
  });

  test("input-available renders the building state with the topic", () => {
    render(<AddKnowledgeTopicToolPart part={inputAvailableAddTopicPart()} />);
    expect(screen.getByText(/Adding/)).toBeInTheDocument();
    expect(screen.getByText("World War II")).toBeInTheDocument();
  });

  test("output-available renders a ready notice naming the category and pointing at Explore", () => {
    render(<AddKnowledgeTopicToolPart part={outputAvailableAddTopicPart()} />);

    expect(screen.getByText(/Added to Explore: World War II/)).toBeInTheDocument();
    expect(screen.getByText(/Filed under 20th Century History/)).toBeInTheDocument();
    expect(screen.getByText(/View in Explore/)).toBeInTheDocument();
  });

  test("output-error renders the tool's errorText", () => {
    render(
      <AddKnowledgeTopicToolPart
        part={outputErrorAddTopicPart("The topic was empty after trimming whitespace.")}
      />,
    );
    expect(screen.getByText("Couldn't add this topic")).toBeInTheDocument();
    expect(screen.getByText("The topic was empty after trimming whitespace.")).toBeInTheDocument();
  });
});
