// The window shown before the first question to a hosted AI service in a session: exactly what would be sent, where it goes and with which model. Nothing is sent unless the author presses Send.
// Focus starts on "Do not send", so a stray Enter sends nothing. Escape and Do not send both mean no. The words are made by `disclosureWords` in src/ai/cloud.ts.
import { open } from "./dialogs.ts";
import { disclosureWords, type Disclose } from "./ai/cloud.ts";

export const discloseDialog: Disclose = async (what) => {
  const words = disclosureWords(what);
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-labelledby", "send-title");
  dialog.setAttribute("aria-describedby", "send-intro");
  dialog.innerHTML = `
    <form method="dialog">
      <h2 id="send-title"></h2>
      <p id="send-intro"></p>
      <pre id="send-text" tabindex="0" aria-label="The words that would be sent" style="max-height:50vh;overflow:auto;white-space:pre-wrap"></pre>
      <p><button value="no" id="send-no">Do not send</button> <button value="send" id="send-yes">Send</button></p>
    </form>`;
  dialog.querySelector("h2")!.textContent = words.heading;
  dialog.querySelector("#send-intro")!.textContent = words.intro;
  dialog.querySelector("#send-text")!.textContent = words.body;
  await open(dialog, dialog.querySelector<HTMLButtonElement>("#send-no")!);
  return dialog.returnValue === "send";
};
