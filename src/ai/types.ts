// What every answerer (the built-in model, later a cloud service with the author's own key) looks like to the rest of the app: ask it something, get words back. Nothing outside src/ai
// needs to know which one answered.

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AskOptions {
  /** The most words (tokens) the answer may have. */
  maxTokens?: number;
  /** How adventurous the wording may be. 0 is the most predictable. */
  temperature?: number;
  /** How long to wait for an answer before giving up, in milliseconds. */
  timeoutMs?: number;
  /** Lets the author cancel: aborting this stops the wait at once. */
  signal?: AbortSignal;
}

export interface Answer {
  text: string;
  /** True if the model ran out of room and the text stops short. A draft that was cut off must not be used as if it were whole. */
  truncated: boolean;
}

export interface Answerer {
  /** For logs and tests: "none", "built-in" ... */
  readonly name: string;
  ask(messages: ChatMessage[], options?: AskOptions): Promise<Answer>;
}

export type AiErrorCode =
  | "off" // the author has not turned AI help on
  | "not-ready" // chosen, but the model or key is not set up
  | "not-local" // the built-in model was pointed at something that is not this PC
  | "unreachable" // the model program did not answer
  | "busy" // it is still loading the model
  | "refused" // it did not accept our password
  | "failed" // it answered with an error
  | "bad-answer" // what came back could not be used
  | "timeout"
  | "cancelled";

/** A problem in words an author can read. The code is for the program; the message is for the person. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  constructor(code: AiErrorCode, message: string) {
    super(message);
    this.name = "AiError";
    this.code = code;
  }
}
