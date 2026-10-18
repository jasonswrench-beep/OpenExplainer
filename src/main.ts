import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("The app container is missing from index.html.");

app.innerHTML = `
  <header class="top">
    <h1>OpenExplainer</h1>
  </header>
  <main id="main" tabindex="-1">
    <h2>Welcome</h2>
    <p>
      OpenExplainer makes still-image tutorials and how-to books from screen captures.
      This is the app shell. Capture, editing and export are coming in later steps.
    </p>
    <p><button type="button" id="status-button">Check that the app is working</button></p>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
`;

document.querySelector<HTMLButtonElement>("#status-button")?.addEventListener("click", () => {
  const status = document.querySelector<HTMLParagraphElement>("#status");
  if (status) status.textContent = "The app is working.";
});
